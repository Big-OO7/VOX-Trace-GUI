"""
Fuzzy Query Grader - Standalone implementation based on evaluate_from_csv_v2.py

This script evaluates <query, recommendation> pairs with fuzzy string matching:
1. Loads raw CSV traces (CONVERSATION_ID, TRACE_COUNT, CONVERSATION_JSON)
2. Extracts candidate recommendations per query/rewrite
3. Applies fuzzy query matching/normalization before judge evaluation
4. Runs Chain-of-Thought (CoT) structured judge for each recommendation
5. Verifies and recalculates scores
6. Outputs JSONL format (one line per <query, recommendation> pair)

Based on the 17-check rubric from evaluate_from_csv_v2.py:
- 11 relevance & format checks
- 6 serendipity checks
- Weighted scoring: (relevance * 0.7) + (serendipity * 0.3)

Usage:
    python grade_fuzzy_queries.py \\
        --input VOX__Metis_100_FullTraces.csv \\
        --output fuzzy_grades.jsonl \\
        --judge-model gemini-2.0-flash-exp \\
        --fuzzy-threshold 0.7 \\
        --parallel-limit 10
"""

import argparse
import asyncio
import csv
import json
import logging
import os
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from math import log2
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Fuzzy matching
try:
    from rapidfuzz import fuzz, process
except ImportError:
    print("ERROR: rapidfuzz not installed. Install with: pip install rapidfuzz")
    sys.exit(1)

# LLM APIs
try:
    import google.generativeai as genai
except ImportError:
    genai = None

try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None


# ============================================================================
# Data Structures
# ============================================================================


@dataclass
class FuzzyScores:
    """Fuzzy matching scores for a query-recommendation pair."""

    query_to_rec: float = 0.0  # Similarity(query_norm, rec_norm)
    rec_to_top_item: float = 0.0  # Max similarity to top-20 items (if available)
    max_item_similarity: float = 0.0  # Overall max item similarity


@dataclass
class RecommendationScore:
    """Score for a single recommendation with detailed check breakdown."""

    recommendation: str
    relevance_format_score: float  # 0-10 (calculated from checks)
    serendipity_score: float  # 0-10 (calculated from checks)
    weighted_score: float  # (relevance_format * 0.7) + (serendipity * 0.3)
    relevance_checks: Dict[str, Any] = field(default_factory=dict)
    serendipity_checks: Dict[str, Any] = field(default_factory=dict)
    relevance_format_reasoning: str = ""
    serendipity_reasoning: str = ""
    overall_reasoning: str = ""


@dataclass
class GradingTask:
    """A single <query, recommendation> pair to evaluate."""

    conversation_id: str
    raw_row_index: int
    consumer_id: str
    query: str
    daypart: str
    recommendation_original: str
    rewrite_id: str
    # Optional context
    profile_summary: str = ""
    top_items: List[str] = field(default_factory=list)


@dataclass
class GradingResult:
    """Complete grading result for a single task."""

    # Provenance
    conversation_id: str
    raw_row_index: int
    consumer_id: str
    rewrite_id: str

    # Query data
    query: str
    normalized_query: str
    daypart: str

    # Recommendation
    recommendation_original: str
    recommendation_normalized: str

    # Fuzzy scores
    fuzzy_scores: FuzzyScores
    fuzzy_passed: bool

    # Judge results
    judge_model: str
    judge_result: RecommendationScore
    verified_scores: Dict[str, float]  # {relevance, serendipity, weighted}

    # Metadata
    elapsed_ms: float
    status: str  # "success", "error", "skipped"
    error: Optional[str] = None
    provenance: Dict[str, Any] = field(default_factory=dict)


# ============================================================================
# JSON Schema (from evaluate_from_csv_v2.py)
# ============================================================================

RECOMMENDATION_SCORE_SCHEMA = {
    "type": "object",
    "properties": {
        # Dimension 1: Relevance & Format checks (11 checks)
        "relevance_format_checks": {
            "type": "object",
            "properties": {
                "check_1_primary_intent": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_2_descriptive_traits": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_3_category_dietary": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_4_situational": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_5_explicit_constraints": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_6_profile_dietary_gate": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                        "is_gate_violation": {"type": "boolean"},
                    },
                    "required": ["passed", "points", "reason", "is_gate_violation"],
                },
                "check_7_output_clarity": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_8_mainstream_availability": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_9_format_correctness": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_10_no_redundant_info": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_11_no_vague_filler": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
            },
            "required": [
                "check_1_primary_intent",
                "check_2_descriptive_traits",
                "check_3_category_dietary",
                "check_4_situational",
                "check_5_explicit_constraints",
                "check_6_profile_dietary_gate",
                "check_7_output_clarity",
                "check_8_mainstream_availability",
                "check_9_format_correctness",
                "check_10_no_redundant_info",
                "check_11_no_vague_filler",
            ],
        },
        # Dimension 2: Serendipity checks (6 checks)
        "serendipity_checks": {
            "type": "object",
            "properties": {
                "check_1_novelty_tier": {
                    "type": "object",
                    "properties": {
                        "tier": {"type": "number"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["tier", "points", "reason"],
                },
                "check_2_low_discoverability": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_3_familiar_ingredients_new_context": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_4_context_fit_while_novel": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_5_aha_moment": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
                "check_6_creates_curiosity": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "boolean"},
                        "points": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["passed", "points", "reason"],
                },
            },
            "required": [
                "check_1_novelty_tier",
                "check_2_low_discoverability",
                "check_3_familiar_ingredients_new_context",
                "check_4_context_fit_while_novel",
                "check_5_aha_moment",
                "check_6_creates_curiosity",
            ],
        },
        # Summary scores (for verification)
        "relevance_format_score": {
            "type": "number",
            "description": "Score from 0-10 calculated as (sum of relevance checks / 20) × 10",
        },
        "serendipity_score": {
            "type": "number",
            "description": "Score from 0-10 as sum of serendipity checks",
        },
        "weighted_score": {
            "type": "number",
            "description": "Weighted score: (relevance_format * 0.7) + (serendipity * 0.3)",
        },
        # Reasoning summaries
        "relevance_format_reasoning": {
            "type": "string",
            "description": "One sentence summary of relevance & format performance",
        },
        "serendipity_reasoning": {
            "type": "string",
            "description": "One sentence summary of serendipity performance",
        },
        "overall_reasoning": {
            "type": "string",
            "description": "One sentence overall assessment",
        },
    },
    "required": [
        "relevance_format_checks",
        "serendipity_checks",
        "relevance_format_score",
        "serendipity_score",
        "weighted_score",
        "relevance_format_reasoning",
        "serendipity_reasoning",
        "overall_reasoning",
    ],
}


# ============================================================================
# Fuzzy Matching Functions
# ============================================================================

# Common stopwords to filter out
STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "from", "by", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "should", "could", "may", "might", "must", "can", "i", "me",
    "my", "we", "our", "you", "your",
}


def normalize_text(text: str) -> str:
    """
    Normalize text for fuzzy matching.

    Steps:
    1. Lowercase
    2. Remove punctuation
    3. Collapse whitespace
    4. Remove stopwords (optional)

    Args:
        text: Input text

    Returns:
        Normalized text
    """
    if not text:
        return ""

    # Lowercase
    text = text.lower().strip()

    # Remove punctuation (keep spaces and alphanumeric)
    text = re.sub(r'[^\w\s]', ' ', text)

    # Collapse whitespace
    text = ' '.join(text.split())

    # Remove stopwords
    words = text.split()
    filtered = [w for w in words if w not in STOPWORDS]

    # Return filtered if not empty, otherwise return original (avoid empty string)
    return ' '.join(filtered) if filtered else text


def compute_fuzzy_scores(
    query: str,
    recommendation: str,
    top_items: Optional[List[str]] = None,
) -> FuzzyScores:
    """
    Compute fuzzy similarity scores between query and recommendation.

    Args:
        query: User query (will be normalized)
        recommendation: Recommendation text (will be normalized)
        top_items: Optional list of top items for item-level matching

    Returns:
        FuzzyScores object with similarity metrics
    """
    # Normalize texts
    query_norm = normalize_text(query)
    rec_norm = normalize_text(recommendation)

    # Query to recommendation similarity (token sort ratio is robust to word order)
    query_to_rec = fuzz.token_sort_ratio(query_norm, rec_norm) / 100.0

    # Recommendation to top items (if available)
    rec_to_top_item = 0.0
    max_item_similarity = 0.0

    if top_items:
        # Normalize all items
        normalized_items = [normalize_text(item) for item in top_items if item]

        if normalized_items:
            # Find best match using rapidfuzz
            best_match = process.extractOne(
                rec_norm,
                normalized_items,
                scorer=fuzz.token_sort_ratio,
            )

            if best_match:
                rec_to_top_item = best_match[1] / 100.0
                max_item_similarity = rec_to_top_item

    return FuzzyScores(
        query_to_rec=query_to_rec,
        rec_to_top_item=rec_to_top_item,
        max_item_similarity=max_item_similarity,
    )


def passes_fuzzy_threshold(fuzzy_scores: FuzzyScores, threshold: float) -> bool:
    """
    Check if fuzzy scores pass the threshold.

    Currently uses query_to_rec as the primary metric.

    Args:
        fuzzy_scores: FuzzyScores object
        threshold: Threshold value (0.0-1.0)

    Returns:
        True if passes threshold
    """
    return fuzzy_scores.query_to_rec >= threshold


# ============================================================================
# System Prompt (from evaluate_from_csv_v2.py)
# ============================================================================

def build_system_prompt() -> str:
    """Build the system prompt with evaluation rubric instructions."""
    return """You are an expert evaluator assessing personalized food recommendations.

# IMPORTANT: Chain-of-Thought Evaluation Required

You MUST evaluate EVERY check individually and provide explicit reasoning for each decision.
Do NOT skip checks or jump to conclusions. Follow the rubric systematically.

---

# Evaluation Instructions

## Dimension 1: Relevance & Format (Per-Item) - 70%

Evaluate these 11 binary checks (20 points total, normalized to 0-10):

1. ☐ **Primary intent match?** (+3 points)
   - YES: Does the dish or cuisine match the main idea in the query (flavor, vibe, mood)?
   - NO: Contradicts intent

2. ☐ **Descriptive traits preserved?** (+2 points)
   - YES: Does the dish reflect ALL descriptive traits in the query (e.g., spicy AND cheesy)?
   - NO: Missing or contradicting traits

3. ☐ **Category/dietary label match?** (+2 points)
   - YES: Does the dish match the category or dietary label (e.g., healthy, keto, fast food)?
   - NO: Wrong category or label

4. ☐ **Situational suitability?** (+2 points)
   - YES: Is the dish suitable for the situation or use case (e.g., car, group, office)?
   - NO: Inappropriate for context

5. ☐ **Explicit constraints met?** (+2 points)
   - YES: Were explicit constraints (price, delivery time, allergy, group size) correctly carried into the rewrite?
   - NO: Constraints violated or ignored

6. ☐ **Profile dietary compliant?** (+1 point) - GATE CHECK
   - YES: The dish respects consumer preference, esp dietary, allergies, religious restrictions, lifestyle choices)
   - NO: Violates profile restrictions
   - **GATE: Profile dietary violation → ENTIRE ITEM SCORE = 0**

7. ☐ **Output clarity?** (+2 points)
   - YES: Is the output directly suggest a cuisine or dish?
   - NO: Still vague or ambiguous

8. ☐ **Mainstream availability?** (+2 points)
   - YES: Is the dish something you'd expect on a mainstream U.S. menu (not niche or invented)?
   - NO: Too niche or doesn't exist

9. ☐ **Format correctness?** (+2 points)
   - YES: Is the dish formatted correctly (no junk tokens, partial phrases, or cue errors)?
   - NO: Contains formatting errors

10. ☐ **No redundant info?** (+1 point)
   - YES: No redundant cuisine prefixes when dish name is self-explanatory (e.g., "kimchi jjigae" not "Korean kimchi jjigae", "sushi" not "Japanese sushi")
   - NO: Contains redundant cuisine prefix

11. ☐ **No vague/filler words?** (+1 point)
   - YES: No vague modifiers or unnecessary adjectives (e.g., "boba tea" not "fresh boba tea", "tacos" not "authentic tacos", avoid "delicious", "amazing", "traditional")
   - NO: Contains vague modifiers or filler words

**Relevance & Format Score** = (sum of points / 20) × 10  [0-10 scale]

---

## Dimension 2: Serendipity Quality (Per-Item) - 30%

Evaluate these 6 checks (1 graded + 5 binary):

### Novel Discovery (8 points)

1. ☐ **Cuisine & Dish Novelty** (6-tier graded, 0-5 points)
   Evaluate which tier best describes the recommendation's novelty:

   - **Tier 6 (+5.0)**: Completely new dish in CONNECTED new cuisine
     * Example: Japanese ramen → Vietnamese spring rolls
     * High novelty + safe connection = optimal serendipity

   - **Tier 5 (+4.0)**: Completely new dish in SAME familiar cuisine
     * Example: Japanese ramen → Japanese tempura
     * New dish but familiar cuisine

   - **Tier 4 (+3.0)**: Same/similar dish in CONNECTED new cuisine
     * Example: Japanese ramen → Vietnamese pho (both noodle soups)
     * Familiar format in new but connected cuisine

   - **Tier 3 (+2.0)**: Similar dish in SAME familiar cuisine
     * Example: Japanese ramen → Japanese udon (both noodles)
     * Similar format, same cuisine

   - **Tier 2 (+1.0)**: SAME dish SAME cuisine (variants only)
     * Example: Tonkotsu ramen → Shoyu ramen
     * Just variants of same dish

   - **Tier 1 (+0.0)**: Completely new dish in DISCONNECTED cuisine
     * Example: Japanese ramen → Ethiopian injera
     * Too random, no connection = poor serendipity

   **Culinary connection groups:**
   - East Asian: Chinese ↔ Japanese ↔ Korean ↔ Vietnamese ↔ Thai
   - South/SE Asian: Indian ↔ Pakistani ↔ Thai
   - Mediterranean: Italian ↔ Greek ↔ Turkish ↔ Middle Eastern
   - Latin American: Mexican ↔ Central/South American
   - Western: American ↔ British ↔ French ↔ German

   **Shared flavor philosophy:** spicy/bold, umami, fresh/herbaceous, rich/creamy, comfort

2. ☐ **Low discoverability?** (+1 point)
   - YES: Requires knowledge/bridges, not obvious from history
   - NO: Obvious next choice

3. ☐ **Familiar ingredients in new context?** (+1 point)
   - YES: Uses ingredients user knows from order history but in new dish/cuisine (e.g., orders chicken → Korean fried chicken, orders beef → Vietnamese pho)
   - NO: All ingredients unfamiliar OR same ingredients in same context
   - **DEFAULT YES if unable to determine**

4. ☐ **Context fit while novel?** (+1 point)
   - YES: Maintains query intent AND novel ("quick" + novel + ALSO quick)
   - NO: Novelty contradicts intent OR no novelty at all

### Surprise-Delight (2 points)

5. ☐ **"Aha moment"?** (+1 point)
   - YES: Non-obvious but makes sense in hindsight
   - NO: Obvious or completely random

6. ☐ **Creates curiosity?** (+1 point)
   - YES: "I want to try this!" personalized feel
   - NO: Generic, random, uninteresting

**Serendipity Score** = sum of points [0-10]

**Weighted Score** = (Relevance & Format × 0.70) + (Serendipity × 0.30)

---

# Output Format

Your response must be valid JSON with:

1. **relevance_format_checks**: Object with all 11 checks, each containing:
   - passed: boolean
   - points: number (as specified in rubric)
   - reason: string (brief explanation of your decision)
   - is_gate_violation: boolean (only for check 6)

2. **serendipity_checks**: Object with all 6 checks, each containing:
   - For check 1 (novelty): tier, points, reason
   - For checks 2-6: passed, points, reason

3. **relevance_format_score**: number (0-10) - calculated from checks
4. **serendipity_score**: number (0-10) - sum of check points
5. **weighted_score**: number (0-10) - (relevance_format × 0.70) + (serendipity × 0.30)
6. **relevance_format_reasoning**: string - one sentence summary
7. **serendipity_reasoning**: string - one sentence summary
8. **overall_reasoning**: string - one sentence overall assessment

**CRITICAL**: Calculate scores correctly:
- Relevance & Format: (sum of 11 check points / 20) × 10
- Serendipity: sum of 6 check points
- If check 6 fails (gate violation), ALL scores = 0"""


def build_user_prompt(
    query: str,
    daypart: str,
    profile_summary: str,
    recommendation: str,
) -> str:
    """Build the user prompt for evaluating a single recommendation."""
    return f"""# User Context

**Query:** "{query}"
**Daypart:** {daypart} (consider daypart appropriateness in context evaluation)

**User Profile:**
{profile_summary}

# Recommendation to Evaluate

**Dish:** {recommendation}

# Task

Evaluate this single recommendation by going through ALL 17 checks one by one (11 relevance & format + 6 serendipity).

For EACH check, you must provide:
1. Your decision (passed/tier/points)
2. Brief reasoning explaining WHY

Do NOT skip any checks. Complete the evaluation systematically.

Return your evaluation as structured JSON matching the schema."""


# ============================================================================
# Score Verification (from evaluate_from_csv_v2.py)
# ============================================================================

def verify_and_recalculate_scores(
    result: Dict[str, Any],
    recommendation: str,
) -> Dict[str, Any]:
    """
    Verify LLM's score calculations and recalculate if needed.

    Args:
        result: Raw JSON response from LLM
        recommendation: Dish name (for logging)

    Returns:
        Corrected result dict with verified scores
    """
    # Extract relevance format checks
    rel_checks = result.get("relevance_format_checks", {})

    # Check for gate violation first
    gate_check = rel_checks.get("check_6_profile_dietary_gate", {})
    is_gate_violation = gate_check.get("is_gate_violation", False)

    if is_gate_violation:
        # GATE violation: all scores = 0
        logging.warning(f"GATE VIOLATION for '{recommendation}' - setting all scores to 0")
        result["relevance_format_score"] = 0.0
        result["serendipity_score"] = 0.0
        result["weighted_score"] = 0.0
        return result

    # Calculate relevance & format score from checks
    rel_points = 0
    for check in rel_checks.values():
        if isinstance(check, dict):
            rel_points += check.get("points", 0)
        # Skip non-dict values (malformed response)
    calculated_rel_score = (rel_points / 20.0) * 10.0

    # Calculate serendipity score from checks
    ser_checks = result.get("serendipity_checks", {})
    ser_points = 0
    for check in ser_checks.values():
        if isinstance(check, dict):
            ser_points += check.get("points", 0)
        # Skip non-dict values (malformed response)
    calculated_ser_score = float(ser_points)

    # Calculate weighted score
    calculated_weighted = (calculated_rel_score * 0.7) + (calculated_ser_score * 0.3)

    # Compare with LLM's claimed scores
    llm_rel_score = result.get("relevance_format_score", 0)
    llm_ser_score = result.get("serendipity_score", 0)
    llm_weighted = result.get("weighted_score", 0)

    # Tolerance for floating point comparison
    tolerance = 0.15

    # Check for mismatches and log warnings
    if abs(calculated_rel_score - llm_rel_score) > tolerance:
        logging.warning(
            f"Relevance score mismatch for '{recommendation}': "
            f"LLM={llm_rel_score:.2f}, Calculated={calculated_rel_score:.2f} "
            f"(points: {rel_points}/20)"
        )
        result["relevance_format_score"] = calculated_rel_score

    if abs(calculated_ser_score - llm_ser_score) > tolerance:
        logging.warning(
            f"Serendipity score mismatch for '{recommendation}': "
            f"LLM={llm_ser_score:.2f}, Calculated={calculated_ser_score:.2f} "
            f"(points: {ser_points}/10)"
        )
        result["serendipity_score"] = calculated_ser_score

    if abs(calculated_weighted - llm_weighted) > tolerance:
        logging.warning(
            f"Weighted score mismatch for '{recommendation}': "
            f"LLM={llm_weighted:.2f}, Calculated={calculated_weighted:.2f}"
        )
        result["weighted_score"] = calculated_weighted

    return result


# ============================================================================
# LLM Judge API Calls (Standalone)
# ============================================================================

async def call_gemini_judge(
    user_prompt: str,
    model_name: str,
    system_prompt: str,
    temperature: float = 0.0,
) -> Dict[str, Any]:
    """
    Call Gemini API with structured output.

    Args:
        user_prompt: User prompt
        model_name: Gemini model name
        system_prompt: System prompt
        temperature: Sampling temperature

    Returns:
        Parsed JSON response
    """
    if genai is None:
        raise ImportError("google-generativeai not installed. Install with: pip install google-generativeai")

    # Configure API key
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY or GEMINI_API_KEY environment variable not set")

    genai.configure(api_key=api_key)

    # Create model
    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system_prompt,
    )

    # Generate content
    response = await asyncio.to_thread(
        model.generate_content,
        user_prompt,
        generation_config=genai.GenerationConfig(
            temperature=temperature,
            response_mime_type="application/json",
            response_schema=RECOMMENDATION_SCORE_SCHEMA,
        ),
    )

    # Parse response
    json_text = response.text
    if not json_text:
        raise ValueError("Empty response from Gemini")

    return json.loads(json_text)


async def call_openai_judge(
    user_prompt: str,
    model_name: str,
    system_prompt: str,
    temperature: float = 0.0,
) -> Dict[str, Any]:
    """
    Call OpenAI API with JSON mode.

    Args:
        user_prompt: User prompt
        model_name: OpenAI model name
        system_prompt: System prompt
        temperature: Sampling temperature

    Returns:
        Parsed JSON response
    """
    if AsyncOpenAI is None:
        raise ImportError("openai not installed. Install with: pip install openai")

    # Get API key
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")

    client = AsyncOpenAI(api_key=api_key)

    # Add JSON instruction to system prompt
    enhanced_system_prompt = system_prompt + "\n\nYou must respond with valid JSON only. No other text."

    # Call API with JSON mode
    response = await client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": enhanced_system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        response_format={"type": "json_object"},
    )

    # Parse response
    json_text = response.choices[0].message.content
    if not json_text:
        raise ValueError("Empty response from OpenAI")

    try:
        result = json.loads(json_text)
    except json.JSONDecodeError as e:
        # Try to extract partial JSON or provide better error
        raise ValueError(f"JSON decode error: {str(e)[:100]}") from e

    # Validate that required fields are present
    if not isinstance(result, dict):
        raise ValueError(f"Response is not a dict, got: {type(result)}")

    if "relevance_format_checks" not in result:
        raise ValueError("Response missing relevance_format_checks")
    if "serendipity_checks" not in result:
        raise ValueError("Response missing serendipity_checks")

    return result


async def evaluate_single_recommendation(
    task: GradingTask,
    judge_model: str,
    system_prompt: str,
    temperature: float = 0.0,
    max_retries: int = 3,
) -> Dict[str, Any]:
    """
    Evaluate a single recommendation with retry logic.

    Args:
        task: GradingTask to evaluate
        judge_model: Model name
        system_prompt: System prompt
        temperature: Sampling temperature
        max_retries: Maximum retry attempts

    Returns:
        Verified result dict
    """
    user_prompt = build_user_prompt(
        query=task.query,
        daypart=task.daypart,
        profile_summary=task.profile_summary,
        recommendation=task.recommendation_original,
    )

    for attempt in range(max_retries):
        try:
            # Call appropriate API
            if judge_model.startswith("gemini"):
                result = await call_gemini_judge(
                    user_prompt=user_prompt,
                    model_name=judge_model,
                    system_prompt=system_prompt,
                    temperature=temperature,
                )
            elif judge_model.startswith("gpt-") or judge_model.startswith("o1"):
                result = await call_openai_judge(
                    user_prompt=user_prompt,
                    model_name=judge_model,
                    system_prompt=system_prompt,
                    temperature=temperature,
                )
            else:
                raise ValueError(f"Unsupported model: {judge_model}")

            # Verify and recalculate scores
            verified_result = verify_and_recalculate_scores(
                result,
                task.recommendation_original,
            )

            return verified_result

        except Exception as e:
            if attempt < max_retries - 1:
                # Exponential backoff
                wait_time = 2 ** attempt
                logging.warning(
                    f"Attempt {attempt + 1} failed for '{task.recommendation_original}': {str(e)[:100]}"
                )
                logging.info(f"Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
            else:
                # Final attempt failed
                logging.error(
                    f"All {max_retries} attempts failed for '{task.recommendation_original}': {str(e)[:200]}"
                )
                # Return zero scores
                return {
                    "relevance_format_checks": {},
                    "serendipity_checks": {},
                    "relevance_format_score": 0.0,
                    "serendipity_score": 0.0,
                    "weighted_score": 0.0,
                    "relevance_format_reasoning": f"API error after {max_retries} retries",
                    "serendipity_reasoning": "API error",
                    "overall_reasoning": "API error",
                }


# ============================================================================
# CSV Parsing and Task Extraction
# ============================================================================

def extract_grading_tasks(
    csv_path: Path,
    consumer_id_filter: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[GradingTask]:
    """
    Extract grading tasks from CSV file.

    Args:
        csv_path: Path to CSV file
        consumer_id_filter: Optional consumer ID to filter by
        limit: Optional limit on number of tasks

    Returns:
        List of GradingTask objects
    """
    tasks = []

    # Increase CSV field size limit for large JSON payloads
    csv.field_size_limit(sys.maxsize)

    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)

        for row_idx, row in enumerate(reader):
            # Get conversation data
            conv_id = row.get('CONVERSATION_ID', '')
            conv_json_str = row.get('CONVERSATION_JSON', '')

            if not conv_id or not conv_json_str:
                continue

            try:
                conv_json = json.loads(conv_json_str)
            except json.JSONDecodeError:
                logging.warning(f"Failed to parse JSON for conversation {conv_id}")
                continue

            # Extract consumer ID
            ids = conv_json.get('ids', {})
            consumer_id = ids.get('consumer_id', ids.get('consumer', ''))

            # Apply filter
            if consumer_id_filter and consumer_id != consumer_id_filter:
                continue

            # Extract traces
            traces = conv_json.get('traces', [])
            query_log = conv_json.get('query_log', [])

            # Build profile summary (simplified - no external dependencies)
            profile = conv_json.get('consumer_profile', {})
            overall = profile.get('overall_profile', {})

            cuisine_prefs = overall.get('cuisine_preferences', 'N/A')
            food_prefs = str(overall.get('food_preferences', 'N/A'))[:100]
            taste_prefs = overall.get('taste_preference', 'N/A')
            dietary = overall.get('dietary_restrictions', 'none')

            profile_summary = f"""- Cuisine preferences: {cuisine_prefs}
- Food preferences: {food_prefs}
- Taste preferences: {taste_prefs}
- Dietary restrictions: {dietary}"""

            # Extract tasks from each trace
            for trace_idx, trace in enumerate(traces):
                original_query = trace.get('original_query', '')
                rewritten_queries = trace.get('rewritten_queries', [])

                # Infer daypart from timestamps (simplified)
                daypart = "weekday_lunch"  # Default

                # Extract recommendations from rewritten queries
                for rewrite_idx, rewrite in enumerate(rewritten_queries):
                    rewritten_query = rewrite.get('rewritten_query', '')

                    if not rewritten_query:
                        continue

                    rewrite_id = f"trace_{trace_idx}_rewrite_{rewrite_idx}"

                    # Create task
                    task = GradingTask(
                        conversation_id=conv_id,
                        raw_row_index=row_idx,
                        consumer_id=consumer_id,
                        query=original_query,
                        daypart=daypart,
                        recommendation_original=rewritten_query,
                        rewrite_id=rewrite_id,
                        profile_summary=profile_summary,
                        top_items=[],  # Could extract from store_recommendations if available
                    )

                    tasks.append(task)

                    # Check limit
                    if limit and len(tasks) >= limit:
                        return tasks

    return tasks


# ============================================================================
# Main Evaluation Loop
# ============================================================================

async def evaluate_tasks(
    tasks: List[GradingTask],
    judge_model: str,
    fuzzy_threshold: float,
    temperature: float,
    parallel_limit: int,
    output_path: Optional[Path] = None,
    save_interval: int = 10,
    dry_run: bool = False,
) -> List[GradingResult]:
    """
    Evaluate all tasks with concurrency control.

    Args:
        tasks: List of GradingTask objects
        judge_model: Model name for judge
        fuzzy_threshold: Fuzzy matching threshold
        temperature: Sampling temperature
        parallel_limit: Concurrency limit
        output_path: Optional path to save results incrementally
        save_interval: Save results every N tasks (default: 10)
        dry_run: If True, skip judge calls

    Returns:
        List of GradingResult objects
    """
    results = []
    system_prompt = build_system_prompt()

    # Progress tracking
    completed = 0
    success_count = 0
    error_count = 0
    skipped_count = 0
    total_weighted_score = 0.0
    total = len(tasks)
    progress_lock = asyncio.Lock()

    # Incremental save tracking
    unsaved_results = []

    # Clear output file if it exists
    if output_path and output_path.exists():
        output_path.unlink()
        logging.info(f"Cleared existing output file: {output_path}")

    # Semaphore for concurrency control
    semaphore = asyncio.Semaphore(parallel_limit)

    def save_unsaved_results():
        """Save accumulated results to file."""
        nonlocal unsaved_results
        if output_path and unsaved_results:
            with open(output_path, 'a') as f:
                for result in unsaved_results:
                    result_dict = asdict(result)
                    f.write(json.dumps(result_dict) + '\n')
            logging.info(f"Saved {len(unsaved_results)} results to {output_path}")
            unsaved_results = []

    async def process_task(task: GradingTask) -> GradingResult:
        nonlocal completed, success_count, error_count, skipped_count, total_weighted_score, unsaved_results

        async with semaphore:
            start_time = time.time()

            # Compute fuzzy scores
            fuzzy_scores = compute_fuzzy_scores(
                query=task.query,
                recommendation=task.recommendation_original,
                top_items=task.top_items,
            )

            # Check fuzzy threshold
            fuzzy_passed = passes_fuzzy_threshold(fuzzy_scores, fuzzy_threshold)

            # Normalized texts
            normalized_query = normalize_text(task.query)
            normalized_rec = normalize_text(task.recommendation_original)

            # Skip judge if dry run or fuzzy failed
            if dry_run or not fuzzy_passed:
                status = "skipped" if not fuzzy_passed else "dry_run"
                elapsed_ms = (time.time() - start_time) * 1000

                # Update progress
                async with progress_lock:
                    completed += 1
                    skipped_count += 1
                    if completed % 10 == 0 or completed == total:
                        pct = (completed / total) * 100
                        logging.info(
                            f"Progress: {completed}/{total} ({pct:.1f}%) | "
                            f"Success: {success_count} | Skipped: {skipped_count} | Errors: {error_count}"
                        )

                result = GradingResult(
                    conversation_id=task.conversation_id,
                    raw_row_index=task.raw_row_index,
                    consumer_id=task.consumer_id,
                    rewrite_id=task.rewrite_id,
                    query=task.query,
                    normalized_query=normalized_query,
                    daypart=task.daypart,
                    recommendation_original=task.recommendation_original,
                    recommendation_normalized=normalized_rec,
                    fuzzy_scores=fuzzy_scores,
                    fuzzy_passed=fuzzy_passed,
                    judge_model=judge_model,
                    judge_result=RecommendationScore(
                        recommendation=task.recommendation_original,
                        relevance_format_score=0.0,
                        serendipity_score=0.0,
                        weighted_score=0.0,
                    ),
                    verified_scores={
                        "relevance_format": 0.0,
                        "serendipity": 0.0,
                        "weighted": 0.0,
                    },
                    elapsed_ms=elapsed_ms,
                    status=status,
                    error=None if fuzzy_passed else f"Fuzzy threshold not met: {fuzzy_scores.query_to_rec:.2f} < {fuzzy_threshold}",
                )

                # Save incrementally
                async with progress_lock:
                    unsaved_results.append(result)
                    if len(unsaved_results) >= save_interval or completed == total:
                        save_unsaved_results()

                return result

            # Call judge
            try:
                judge_response = await evaluate_single_recommendation(
                    task=task,
                    judge_model=judge_model,
                    system_prompt=system_prompt,
                    temperature=temperature,
                )

                # Create RecommendationScore
                rec_score = RecommendationScore(
                    recommendation=task.recommendation_original,
                    relevance_format_score=judge_response["relevance_format_score"],
                    serendipity_score=judge_response["serendipity_score"],
                    weighted_score=judge_response["weighted_score"],
                    relevance_checks=judge_response.get("relevance_format_checks", {}),
                    serendipity_checks=judge_response.get("serendipity_checks", {}),
                    relevance_format_reasoning=judge_response.get("relevance_format_reasoning", ""),
                    serendipity_reasoning=judge_response.get("serendipity_reasoning", ""),
                    overall_reasoning=judge_response.get("overall_reasoning", ""),
                )

                elapsed_ms = (time.time() - start_time) * 1000

                # Update progress
                async with progress_lock:
                    completed += 1
                    success_count += 1
                    total_weighted_score += rec_score.weighted_score
                    if completed % 10 == 0 or completed == total:
                        pct = (completed / total) * 100
                        avg_score = total_weighted_score / max(success_count, 1)
                        logging.info(
                            f"Progress: {completed}/{total} ({pct:.1f}%) | "
                            f"Success: {success_count} (avg: {avg_score:.2f}) | "
                            f"Skipped: {skipped_count} | Errors: {error_count}"
                        )

                result = GradingResult(
                    conversation_id=task.conversation_id,
                    raw_row_index=task.raw_row_index,
                    consumer_id=task.consumer_id,
                    rewrite_id=task.rewrite_id,
                    query=task.query,
                    normalized_query=normalized_query,
                    daypart=task.daypart,
                    recommendation_original=task.recommendation_original,
                    recommendation_normalized=normalized_rec,
                    fuzzy_scores=fuzzy_scores,
                    fuzzy_passed=fuzzy_passed,
                    judge_model=judge_model,
                    judge_result=rec_score,
                    verified_scores={
                        "relevance_format": rec_score.relevance_format_score,
                        "serendipity": rec_score.serendipity_score,
                        "weighted": rec_score.weighted_score,
                    },
                    elapsed_ms=elapsed_ms,
                    status="success",
                    error=None,
                )

                # Save incrementally
                async with progress_lock:
                    unsaved_results.append(result)
                    if len(unsaved_results) >= save_interval or completed == total:
                        save_unsaved_results()

                return result

            except Exception as e:
                elapsed_ms = (time.time() - start_time) * 1000
                logging.error(f"Error evaluating task: {str(e)}")

                # Update progress
                async with progress_lock:
                    completed += 1
                    error_count += 1
                    if completed % 10 == 0 or completed == total:
                        pct = (completed / total) * 100
                        logging.info(
                            f"Progress: {completed}/{total} ({pct:.1f}%) | "
                            f"Success: {success_count} | Skipped: {skipped_count} | Errors: {error_count}"
                        )

                result = GradingResult(
                    conversation_id=task.conversation_id,
                    raw_row_index=task.raw_row_index,
                    consumer_id=task.consumer_id,
                    rewrite_id=task.rewrite_id,
                    query=task.query,
                    normalized_query=normalized_query,
                    daypart=task.daypart,
                    recommendation_original=task.recommendation_original,
                    recommendation_normalized=normalized_rec,
                    fuzzy_scores=fuzzy_scores,
                    fuzzy_passed=fuzzy_passed,
                    judge_model=judge_model,
                    judge_result=RecommendationScore(
                        recommendation=task.recommendation_original,
                        relevance_format_score=0.0,
                        serendipity_score=0.0,
                        weighted_score=0.0,
                    ),
                    verified_scores={
                        "relevance_format": 0.0,
                        "serendipity": 0.0,
                        "weighted": 0.0,
                    },
                    elapsed_ms=elapsed_ms,
                    status="error",
                    error=str(e),
                )

                # Save incrementally
                async with progress_lock:
                    unsaved_results.append(result)
                    if len(unsaved_results) >= save_interval or completed == total:
                        save_unsaved_results()

                return result

    # Process all tasks
    logging.info(f"Processing {len(tasks)} tasks with parallelism={parallel_limit}")
    results = await asyncio.gather(*[process_task(task) for task in tasks])

    return results


# ============================================================================
# JSONL Output
# ============================================================================

def save_results_jsonl(
    results: List[GradingResult],
    output_path: Path,
) -> None:
    """
    Save results to JSONL file (one line per result).

    Args:
        results: List of GradingResult objects
        output_path: Output file path
    """
    with open(output_path, 'w') as f:
        for result in results:
            # Convert to dict
            result_dict = asdict(result)
            # Write as JSON line
            f.write(json.dumps(result_dict) + '\n')

    logging.info(f"Saved {len(results)} results to {output_path}")


def validate_output_jsonl(output_path: Path) -> bool:
    """
    Validate JSONL output file.

    Args:
        output_path: Path to JSONL file

    Returns:
        True if valid
    """
    try:
        with open(output_path, 'r') as f:
            line_count = 0
            for line in f:
                if line.strip():
                    json.loads(line)
                    line_count += 1

        logging.info(f"Validation passed: {line_count} valid JSON lines")
        return True

    except Exception as e:
        logging.error(f"Validation failed: {e}")
        return False


# ============================================================================
# Main
# ============================================================================

async def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Fuzzy Query Grader - Evaluate query-recommendation pairs with fuzzy matching"
    )

    # Required arguments
    parser.add_argument(
        "--input",
        type=str,
        required=True,
        help="Input CSV file (CONVERSATION_ID, TRACE_COUNT, CONVERSATION_JSON)",
    )
    parser.add_argument(
        "--output",
        type=str,
        required=True,
        help="Output JSONL file",
    )
    parser.add_argument(
        "--judge-model",
        type=str,
        required=True,
        help="Judge model name (e.g., gemini-2.0-flash-exp, gpt-4o-mini)",
    )

    # Optional arguments
    parser.add_argument(
        "--consumer-id",
        type=str,
        help="Filter to single consumer ID",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Batch size for processing (default: 100)",
    )
    parser.add_argument(
        "--log-file",
        type=str,
        help="Log file path",
    )
    parser.add_argument(
        "--fuzzy-threshold",
        type=float,
        default=0.7,
        help="Fuzzy match threshold (0.0-1.0, default: 0.7)",
    )
    parser.add_argument(
        "--parallel-limit",
        type=int,
        default=10,
        help="Concurrency limit (default: 10)",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.0,
        help="LLM temperature (default: 0.0)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Limit number of tasks (for testing)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip judge calls (test fuzzy matching only)",
    )
    parser.add_argument(
        "--validate-output",
        action="store_true",
        help="Validate output JSONL after writing",
    )

    args = parser.parse_args()

    # Setup logging
    log_level = logging.INFO
    log_format = "%(asctime)s - %(levelname)s - %(message)s"

    if args.log_file:
        logging.basicConfig(
            level=log_level,
            format=log_format,
            handlers=[
                logging.FileHandler(args.log_file),
                logging.StreamHandler(sys.stdout),
            ],
        )
    else:
        logging.basicConfig(
            level=log_level,
            format=log_format,
        )

    # Validate input
    input_path = Path(args.input)
    if not input_path.exists():
        logging.error(f"Input file not found: {input_path}")
        sys.exit(1)

    # Extract tasks
    logging.info(f"Loading tasks from {input_path}")
    tasks = extract_grading_tasks(
        csv_path=input_path,
        consumer_id_filter=args.consumer_id,
        limit=args.limit,
    )

    if not tasks:
        logging.error("No tasks extracted from CSV")
        sys.exit(1)

    logging.info(f"Extracted {len(tasks)} grading tasks")

    # Run evaluation
    logging.info(f"Starting evaluation with model={args.judge_model}")
    logging.info(f"Fuzzy threshold={args.fuzzy_threshold}, parallel_limit={args.parallel_limit}")

    output_path = Path(args.output)

    results = await evaluate_tasks(
        tasks=tasks,
        judge_model=args.judge_model,
        fuzzy_threshold=args.fuzzy_threshold,
        temperature=args.temperature,
        parallel_limit=args.parallel_limit,
        output_path=output_path,
        save_interval=10,
        dry_run=args.dry_run,
    )

    # Results are already saved incrementally, but save any remaining
    logging.info("Evaluation complete - all results saved incrementally")

    # Validate output
    if args.validate_output:
        logging.info("Validating output...")
        if validate_output_jsonl(output_path):
            logging.info("Output validation passed")
        else:
            logging.error("Output validation failed")
            sys.exit(1)

    # Print summary
    success_count = sum(1 for r in results if r.status == "success")
    error_count = sum(1 for r in results if r.status == "error")
    skipped_count = sum(1 for r in results if r.status == "skipped")

    logging.info("\n" + "=" * 80)
    logging.info("GRADING SUMMARY")
    logging.info("=" * 80)
    logging.info(f"Total tasks: {len(results)}")
    logging.info(f"Success: {success_count}")
    logging.info(f"Error: {error_count}")
    logging.info(f"Skipped (fuzzy): {skipped_count}")

    if success_count > 0:
        avg_weighted = sum(r.verified_scores["weighted"] for r in results if r.status == "success") / success_count
        logging.info(f"Average weighted score: {avg_weighted:.2f}")

    logging.info("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
