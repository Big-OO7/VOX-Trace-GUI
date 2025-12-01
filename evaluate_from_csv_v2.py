"""
LLM-as-Judge evaluation V2 with Chain-of-Thought reasoning.

This version enforces explicit check-by-check evaluation to ensure the LLM:
1. Evaluates every check individually (16 total checks)
2. Shows reasoning for each check decision
3. Calculates scores that can be verified against check results

Key differences from V1:
- Structured JSON schema with individual check results
- Score verification (Python recalculates and validates LLM scores)
- Better audit trail for debugging evaluation quality

Usage:
    # Same as evaluate_from_csv.py
    uv run python -m src.v2vburg.m1.demo.query_rewrite.evaluate_from_csv_v2 \
      --input offline_eval/results/results_2025-11-17_20-12-51.csv
"""

import asyncio
import csv
import json
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Add project root to path
project_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from src.v2vburg.m1.demo.query_rewrite.profile_loader import (
    load_profile_from_crdb,
    load_profile_from_snowflake,
)
from src.v2vburg.m1.demo.query_rewrite.test_serendipity_rewrite import (
    call_gemini,
    load_profile_from_csv_cache,
    save_profile_to_csv_cache,
)


@dataclass
class RecommendationScore:
    """Score for a single recommendation with detailed check breakdown."""

    recommendation: str
    relevance_format_score: float  # 0-10 (calculated from checks)
    serendipity_score: float  # 0-10 (calculated from checks)
    weighted_score: float  # (relevance_format * 0.7) + (serendipity * 0.3)
    relevance_checks: Dict[str, Any]  # Individual check results
    serendipity_checks: Dict[str, Any]  # Individual check results
    relevance_format_reasoning: str
    serendipity_reasoning: str
    overall_reasoning: str


@dataclass
class EvaluationResult:
    """Evaluation result from LLM judge - per-recommendation scores."""

    consumer_id: str
    query: str
    daypart: str
    recommendation_scores: List[RecommendationScore]
    ndcg: float = 0.0  # nDCG@5 score (0-1)
    set_score: float = 0.0  # Set-level score (0-10)


def calculate_ndcg_at_5(weighted_scores: List[float]) -> float:
    """
    Calculate nDCG@5 (Normalized Discounted Cumulative Gain) for ranking quality.

    Compares actual ranking against ideal case where all recommendations score 10.0.
    Position indexing starts at 0, so position 0 uses log2(0+2) = log2(2) = 1.0.

    Args:
        weighted_scores: List of weighted scores in the order presented (actual ranking)

    Returns:
        nDCG value between 0.0 (worst) and 1.0 (perfect - all 10s in optimal order)
    """
    from math import log2

    if not weighted_scores or len(weighted_scores) == 0:
        return 0.0

    # Calculate DCG for actual ranking
    # Position i=0: score/log2(2), i=1: score/log2(3), etc.
    dcg = sum(score / log2(i + 2) for i, score in enumerate(weighted_scores))

    # Calculate ideal DCG: all perfect scores (10.0) at top positions
    # IDCG = 10/log2(2) + 10/log2(3) + 10/log2(4) + ... for k positions
    k = len(weighted_scores)
    idcg = sum(10.0 / log2(i + 2) for i in range(k))

    # Normalize
    return dcg / idcg if idcg > 0 else 0.0


# JSON schema for structured output from Gemini with chain-of-thought
RECOMMENDATION_SCORE_SCHEMA = {
    "type": "object",
    "properties": {
        # Dimension 1: Relevance & Format checks (10 checks)
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


def build_system_prompt() -> str:
    """Build the system prompt with evaluation rubric instructions for single recommendation."""
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

1. **relevance_format_checks**: Object with all 10 checks, each containing:
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
- Relevance & Format: (sum of 10 check points / 20) × 10
- Serendipity: sum of 6 check points
- If check 6 fails (gate violation), ALL scores = 0"""


def build_user_prompt_single(
    query: str,
    daypart: str,
    profile_summary: str,
    recommendation: str,
) -> str:
    """Build the user prompt for evaluating a SINGLE recommendation.

    Args:
        query: User's search query
        daypart: Daypart (e.g., "weekday_lunch")
        profile_summary: Formatted profile with cuisine/food/taste preferences and dietary restrictions
        recommendation: Single dish name to evaluate
    """
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


def verify_and_recalculate_scores(result: Dict[str, Any], recommendation: str) -> Dict[str, Any]:
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
        print(f"   ⚠️  GATE VIOLATION detected for '{recommendation}' - setting all scores to 0")
        result["relevance_format_score"] = 0.0
        result["serendipity_score"] = 0.0
        result["weighted_score"] = 0.0
        return result

    # Calculate relevance & format score from checks
    rel_points = sum(check.get("points", 0) for check in rel_checks.values())
    calculated_rel_score = (rel_points / 20.0) * 10.0

    # Calculate serendipity score from checks
    ser_checks = result.get("serendipity_checks", {})
    ser_points = sum(check.get("points", 0) for check in ser_checks.values())
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
        print(
            f"   ⚠️  Relevance score mismatch for '{recommendation}': "
            f"LLM said {llm_rel_score:.2f}, checks sum to {calculated_rel_score:.2f} "
            f"(raw points: {rel_points}/20)"
        )
        result["relevance_format_score"] = calculated_rel_score

    if abs(calculated_ser_score - llm_ser_score) > tolerance:
        print(
            f"   ⚠️  Serendipity score mismatch for '{recommendation}': "
            f"LLM said {llm_ser_score:.2f}, checks sum to {calculated_ser_score:.2f} "
            f"(raw points: {ser_points}/10)"
        )
        result["serendipity_score"] = calculated_ser_score

    if abs(calculated_weighted - llm_weighted) > tolerance:
        print(
            f"   ⚠️  Weighted score mismatch for '{recommendation}': "
            f"LLM said {llm_weighted:.2f}, should be {calculated_weighted:.2f}"
        )
        result["weighted_score"] = calculated_weighted

    return result


def get_all_consumer_ids(csv_path: Path) -> List[str]:
    """
    Get all unique consumer IDs from CSV file.

    Args:
        csv_path: Path to CSV file

    Returns:
        List of unique consumer IDs found in the CSV
    """
    consumer_ids = set()

    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            consumer_id = row.get("consumer_id")
            if consumer_id:
                consumer_ids.add(consumer_id)

    return sorted(list(consumer_ids))


def read_csv_results(csv_path: Path, target_consumer_id: str) -> Dict[Tuple[str, str], Dict[str, Any]]:
    """
    Read CSV file and group recommendations by query for a specific consumer.

    Args:
        csv_path: Path to CSV file
        target_consumer_id: Consumer ID to filter by (required)

    Returns:
        Results dict that maps (query, daypart) tuple to dict with recommendations list and daypart
    """
    results: Dict[Tuple[str, str], Dict[str, Any]] = defaultdict(lambda: {"recommendations": [], "daypart": None})

    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row_consumer_id = row.get("consumer_id")

            # Skip rows that don't match the target consumer_id
            if row_consumer_id != target_consumer_id:
                continue

            query = row["query"]
            daypart = row.get("daypart", "weekday_lunch")
            search_term = row["search_term"]

            key = (query, daypart)
            results[key]["recommendations"].append(search_term)
            results[key]["daypart"] = daypart

    return dict(results)


async def evaluate_single_recommendation_with_retry(
    query: str,
    daypart: str,
    profile_summary: str,
    recommendation: str,
    judge_model: str,
    system_prompt: str,
    max_retries: int = 3,
) -> Dict[str, Any]:
    """Evaluate a single recommendation with retry logic.

    Args:
        query: User's search query
        daypart: Daypart (e.g., "weekday_lunch")
        profile_summary: Formatted profile string
        recommendation: Single dish name to evaluate
        judge_model: Model name to use
        system_prompt: System prompt with rubric
        max_retries: Maximum number of retry attempts (default: 3)

    Returns:
        Dict with verified scores and detailed check results
    """
    for attempt in range(max_retries):
        try:
            result = await evaluate_single_recommendation(
                query, daypart, profile_summary, recommendation, judge_model, system_prompt
            )
            # Verify and recalculate scores
            verified_result = verify_and_recalculate_scores(result, recommendation)
            return verified_result
        except Exception as e:
            if attempt < max_retries - 1:
                # Exponential backoff: 2^attempt seconds
                wait_time = 2**attempt
                print(f"   ⚠️  Attempt {attempt + 1} failed: {str(e)[:100]}")
                print(f"   ⏳ Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
            else:
                # Final attempt failed
                print(f"   ❌ All {max_retries} attempts failed for: {recommendation}")
                print(f"   Error: {str(e)[:200]}")
                # Return zero scores on complete failure
                return {
                    "relevance_format_checks": {},
                    "serendipity_checks": {},
                    "relevance_format_score": 0.0,
                    "serendipity_score": 0.0,
                    "weighted_score": 0.0,
                    "relevance_format_reasoning": f"Failed after {max_retries} retries: {str(e)[:100]}",
                    "serendipity_reasoning": "API error",
                    "overall_reasoning": "API error",
                }


async def evaluate_single_recommendation(
    query: str,
    daypart: str,
    profile_summary: str,
    recommendation: str,
    judge_model: str,
    system_prompt: str,
) -> Dict[str, Any]:
    """Evaluate a single recommendation and return JSON response.

    Args:
        query: User's search query
        daypart: Daypart (e.g., "weekday_lunch")
        profile_summary: Formatted profile string
        recommendation: Single dish name to evaluate
        judge_model: Model name to use
        system_prompt: System prompt with rubric

    Returns:
        Dict with detailed check results and scores
    """
    user_prompt = build_user_prompt_single(query, daypart, profile_summary, recommendation)

    # Call appropriate judge model with JSON schema
    if judge_model.startswith("gemini"):
        json_response = await call_gemini(
            user_prompt,
            judge_model,
            system_prompt=system_prompt,
            response_schema=RECOMMENDATION_SCORE_SCHEMA,
        )
    else:
        # OpenAI doesn't support this yet in our implementation
        raise ValueError(f"Only Gemini models support structured output currently. Got: {judge_model}")

    # Check if response is empty
    if not json_response or json_response.strip() == "":
        print(f"   ⚠️  Received empty response from {judge_model}")
        return {
            "relevance_format_checks": {},
            "serendipity_checks": {},
            "relevance_format_score": 0.0,
            "serendipity_score": 0.0,
            "weighted_score": 0.0,
            "relevance_format_reasoning": "Empty response from API",
            "serendipity_reasoning": "Empty response from API",
            "overall_reasoning": "Empty response from API",
        }

    # Parse JSON response
    try:
        result = json.loads(json_response)
        return result
    except json.JSONDecodeError as e:
        print(f"   ⚠️  Failed to parse JSON response: {e}")
        print(f"   Response was: {json_response[:500]}...")
        print(f"   Full response length: {len(json_response)} chars")
        # Try to find if it's wrapped in markdown code blocks
        if "```json" in json_response:
            print("   💡 Response appears to be wrapped in markdown code blocks")
            try:
                # Extract JSON from markdown
                import re
                json_match = re.search(r"```json\s*\n(.*?)\n```", json_response, re.DOTALL)
                if json_match:
                    clean_json = json_match.group(1)
                    result = json.loads(clean_json)
                    print("   ✓ Successfully extracted JSON from markdown")
                    return result
            except Exception as extract_error:
                print(f"   ❌ Failed to extract JSON from markdown: {extract_error}")

        # Return zero scores on parse failure
        return {
            "relevance_format_checks": {},
            "serendipity_checks": {},
            "relevance_format_score": 0.0,
            "serendipity_score": 0.0,
            "weighted_score": 0.0,
            "relevance_format_reasoning": "Failed to parse JSON response",
            "serendipity_reasoning": "Failed to parse JSON response",
            "overall_reasoning": "Failed to parse JSON response",
        }


async def evaluate_query(
    consumer_id: str,
    query: str,
    daypart: str,
    recommendations: List[str],
    profile: Dict[str, Any],
    judge_model: str,
) -> EvaluationResult:
    """Evaluate a single query's recommendations by making separate LLM calls per recommendation."""
    # Try to get daypart-specific profile, fallback to overall
    daypart_profiles = profile.get("daypart_profiles", {})
    daypart_profile = daypart_profiles.get(daypart, {})
    overall_profile = profile.get("overall_profile", {})

    # Use daypart-specific if available, otherwise fallback to overall
    cuisine_prefs = daypart_profile.get("cuisine_preferences") or overall_profile.get("cuisine_preferences", "N/A")
    food_prefs = daypart_profile.get("food_preferences") or overall_profile.get("food_preferences", "N/A")
    taste_prefs = daypart_profile.get("taste_preference") or overall_profile.get("taste_preference", "N/A")
    dietary = overall_profile.get("dietary_restrictions", "none")  # dietary always from overall

    # Truncate food preferences if too long
    if len(str(food_prefs)) > 100:
        food_prefs = str(food_prefs)[:100] + "..."

    profile_summary = f"""- Daypart: {daypart}
- Cuisine preferences: {cuisine_prefs}
- Food preferences: {food_prefs}
- Taste preferences: {taste_prefs}
- Dietary restrictions: {dietary}"""

    # Build system prompt once
    system_prompt = build_system_prompt()

    print(f"\n🤖 Evaluating '{query}' ({daypart}) - {len(recommendations)} recommendations with {judge_model}...")
    print(f"   🚀 Running {len(recommendations)} evaluations in parallel...")

    # Evaluate all recommendations in parallel using asyncio.gather with retry logic
    tasks = [
        evaluate_single_recommendation_with_retry(
            query=query,
            daypart=daypart,
            profile_summary=profile_summary,
            recommendation=rec,
            judge_model=judge_model,
            system_prompt=system_prompt,
            max_retries=3,
        )
        for rec in recommendations
    ]

    results = await asyncio.gather(*tasks)

    # Process results and create RecommendationScore objects
    recommendation_scores = []
    for i, (rec, result) in enumerate(zip(recommendations, results), 1):
        rec_score = RecommendationScore(
            recommendation=rec,
            relevance_format_score=result["relevance_format_score"],
            serendipity_score=result["serendipity_score"],
            weighted_score=result["weighted_score"],
            relevance_checks=result.get("relevance_format_checks", {}),
            serendipity_checks=result.get("serendipity_checks", {}),
            relevance_format_reasoning=result["relevance_format_reasoning"],
            serendipity_reasoning=result["serendipity_reasoning"],
            overall_reasoning=result["overall_reasoning"],
        )
        recommendation_scores.append(rec_score)

        print(
            f"   [{i}/{len(recommendations)}] {rec}: Relevance & Format {result['relevance_format_score']:.1f}, "
            f"Serendipity {result['serendipity_score']:.1f}, Weighted {result['weighted_score']:.1f}"
        )

    # Calculate set-level nDCG@5 score
    weighted_scores = [rec.weighted_score for rec in recommendation_scores]
    ndcg = calculate_ndcg_at_5(weighted_scores)
    set_score = ndcg * 10.0

    return EvaluationResult(
        consumer_id=consumer_id,
        query=query,
        daypart=daypart,
        recommendation_scores=recommendation_scores,
        ndcg=ndcg,
        set_score=set_score,
    )


def print_evaluation(evaluation: EvaluationResult, verbose: bool = False) -> None:
    """Print per-recommendation evaluation results.

    Args:
        evaluation: Evaluation result to print
        verbose: If True, print detailed check-by-check breakdown
    """
    print(f"\n{'='*80}")
    print(f"EVALUATION: '{evaluation.query}' ({evaluation.daypart})")
    print(f"Consumer: {evaluation.consumer_id}")
    print(f"{'='*80}\n")

    # Per-recommendation scores
    for i, rec_score in enumerate(evaluation.recommendation_scores, 1):
        print(f"📋 {i}. {rec_score.recommendation}")
        print(f"   🎯 Relevance & Format: {rec_score.relevance_format_score:.1f}/10")
        print(f"   ✨ Serendipity: {rec_score.serendipity_score:.1f}/10")
        print(f"   📈 Weighted: {rec_score.weighted_score:.2f}/10")

        # Print reasoning
        print(f"   💭 Relevance: {rec_score.relevance_format_reasoning}")
        print(f"   💭 Serendipity: {rec_score.serendipity_reasoning}")
        print(f"   💭 Overall: {rec_score.overall_reasoning}")

        # Print detailed checks if verbose
        if verbose:
            print("\n   📊 Detailed Check Breakdown:")
            print("   Relevance & Format Checks:")
            for check_name, check_data in rec_score.relevance_checks.items():
                passed = check_data.get("passed", False)
                points = check_data.get("points", 0)
                reason = check_data.get("reason", "")
                status = "✓" if passed else "✗"
                print(f"      {status} {check_name}: {points} pts - {reason}")

            print("   Serendipity Checks:")
            for check_name, check_data in rec_score.serendipity_checks.items():
                if "tier" in check_data:
                    tier = check_data.get("tier", 0)
                    points = check_data.get("points", 0)
                    reason = check_data.get("reason", "")
                    print(f"      • {check_name}: Tier {tier} ({points} pts) - {reason}")
                else:
                    passed = check_data.get("passed", False)
                    points = check_data.get("points", 0)
                    reason = check_data.get("reason", "")
                    status = "✓" if passed else "✗"
                    print(f"      {status} {check_name}: {points} pts - {reason}")

        print()

    # Average scores
    avg_relevance_format = sum(r.relevance_format_score for r in evaluation.recommendation_scores) / len(
        evaluation.recommendation_scores
    )
    avg_serendipity = sum(r.serendipity_score for r in evaluation.recommendation_scores) / len(
        evaluation.recommendation_scores
    )
    avg_weighted = sum(r.weighted_score for r in evaluation.recommendation_scores) / len(
        evaluation.recommendation_scores
    )

    print("📊 Average Scores:")
    print(f"   Relevance & Format: {avg_relevance_format:.2f}/10")
    print(f"   Serendipity: {avg_serendipity:.2f}/10")
    print(f"   Weighted: {avg_weighted:.2f}/10")

    # Set-level scores
    print("\n🎯 Set-Level Scores:")
    print(f"   nDCG@5: {evaluation.ndcg:.3f} (0-1 scale)")
    print(f"   Set Score: {evaluation.set_score:.2f}/10")
    print(f"\n{'='*80}\n")


def print_aggregate_summary(evaluations: List[EvaluationResult]) -> None:
    """Print aggregate summary across all per-recommendation evaluations."""
    print(f"\n\n{'='*80}")
    print("AGGREGATE SUMMARY - ALL RECOMMENDATIONS")
    print(f"{'='*80}\n")

    # Flatten all recommendation scores
    all_rec_scores = [rec_score for eval_result in evaluations for rec_score in eval_result.recommendation_scores]
    total = len(all_rec_scores)

    avg_relevance_format = sum(r.relevance_format_score for r in all_rec_scores) / total
    avg_serendipity = sum(r.serendipity_score for r in all_rec_scores) / total
    avg_weighted = sum(r.weighted_score for r in all_rec_scores) / total

    print(f"📊 Average Scores (n={total} recommendations)")
    print("-" * 80)
    print(f"Relevance & Format: {avg_relevance_format:.2f}/10")
    print(f"Serendipity: {avg_serendipity:.2f}/10")
    print(f"Weighted: {avg_weighted:.2f}/10")

    # Score distribution based on weighted scores
    excellent = sum(1 for r in all_rec_scores if r.weighted_score >= 9.0)
    good = sum(1 for r in all_rec_scores if 7.0 <= r.weighted_score < 9.0)
    mediocre = sum(1 for r in all_rec_scores if 5.0 <= r.weighted_score < 7.0)
    poor = sum(1 for r in all_rec_scores if r.weighted_score < 5.0)

    print("\n📈 Weighted Score Distribution")
    print("-" * 80)
    print(f"Excellent (9-10): {excellent} ({excellent/total*100:.1f}%)")
    print(f"Good (7-8.9): {good} ({good/total*100:.1f}%)")
    print(f"Mediocre (5-6.9): {mediocre} ({mediocre/total*100:.1f}%)")
    print(f"Poor (<5): {poor} ({poor/total*100:.1f}%)")


def save_evaluations_to_csv(evaluations: List[EvaluationResult], output_path: Path, include_checks: bool = False) -> None:
    """Save per-recommendation evaluations to CSV file (one row per recommendation).

    Args:
        evaluations: List of evaluation results
        output_path: Path to save CSV
        include_checks: If True, add a column with JSON of all check results
    """
    import csv

    with open(output_path, "w", newline="") as f:
        writer = csv.writer(f)

        # Header - per-recommendation columns with separate reasoning columns + set-level scores
        header = [
            "consumer_id",
            "query",
            "daypart",
            "recommendation",
            "relevance_format_score",
            "serendipity_score",
            "weighted_score",
            "ndcg",
            "set_score",
            "relevance_format_reasoning",
            "serendipity_reasoning",
            "overall_reasoning",
        ]

        if include_checks:
            header.append("check_breakdown_json")

        writer.writerow(header)

        # Rows - one per recommendation
        for eval_result in evaluations:
            for rec_score in eval_result.recommendation_scores:
                row = [
                    eval_result.consumer_id,
                    eval_result.query,
                    eval_result.daypart,
                    rec_score.recommendation,
                    f"{rec_score.relevance_format_score:.2f}",
                    f"{rec_score.serendipity_score:.2f}",
                    f"{rec_score.weighted_score:.2f}",
                    f"{eval_result.ndcg:.3f}",
                    f"{eval_result.set_score:.2f}",
                    rec_score.relevance_format_reasoning,
                    rec_score.serendipity_reasoning,
                    rec_score.overall_reasoning,
                ]

                if include_checks:
                    # Add JSON of all checks for audit trail
                    checks_json = json.dumps({
                        "relevance_checks": rec_score.relevance_checks,
                        "serendipity_checks": rec_score.serendipity_checks,
                    })
                    row.append(checks_json)

                writer.writerow(row)


class Tee:
    """Redirect stdout to both terminal and a file."""

    def __init__(self, log_file_path: Path):
        self.terminal = sys.stdout
        self.log_file = open(log_file_path, "w", encoding="utf-8")

    def write(self, message: str) -> None:
        """Write to both terminal and file."""
        self.terminal.write(message)
        self.log_file.write(message)
        self.log_file.flush()

    def flush(self) -> None:
        """Flush both streams."""
        self.terminal.flush()
        self.log_file.flush()

    def close(self) -> None:
        """Close the log file and restore stdout."""
        if hasattr(self, "log_file") and self.log_file:
            self.log_file.close()


async def main() -> None:
    """Main evaluation function."""
    import argparse

    parser = argparse.ArgumentParser(description="Evaluate query rewrite CSV results with LLM-as-judge (V2 with CoT)")
    parser.add_argument("--input", type=str, required=True, help="Input CSV file with query rewrite results")
    parser.add_argument(
        "--consumer-id", type=str, help="Consumer ID (optional, evaluates ALL consumer_ids in CSV if not specified)"
    )
    parser.add_argument(
        "--profile-source",
        type=str,
        choices=["file", "snowflake", "crdb"],
        default="snowflake",
    )
    parser.add_argument("--profile-version", type=str, default="3.0")
    parser.add_argument(
        "--judge-model",
        type=str,
        default="gemini-2.5-pro",
        help="Model to use as judge (default: gemini-2.5-pro). Supports: gemini-2.5-pro, gemini-2.5-flash",
    )
    parser.add_argument("--output", type=str, help="Save evaluation results to CSV file (will auto-add 'eval_v2_' prefix)")
    parser.add_argument(
        "--log-file", type=str, help="Optional: Save terminal output to text file (e.g., evaluation_log.txt)"
    )
    parser.add_argument(
        "--verbose", action="store_true", help="Print detailed check-by-check breakdown for each recommendation"
    )
    parser.add_argument(
        "--include-checks", action="store_true", help="Include check breakdown JSON column in CSV output"
    )

    args = parser.parse_args()

    # Set up log file redirection if requested
    tee = None
    original_stdout = sys.stdout
    if args.log_file:
        log_file_path = Path(args.log_file)
        print(f"📝 Logging output to: {log_file_path}")
        tee = Tee(log_file_path)
        sys.stdout = tee

    try:
        # Validate input file
        input_path = Path(args.input)
        if not input_path.exists():
            print(f"❌ Input file not found: {input_path}")
            sys.exit(1)

        # Get all consumer_ids from CSV
        print(f"📂 Reading query rewrite results from: {input_path}")
        all_consumer_ids = get_all_consumer_ids(input_path)

        if not all_consumer_ids:
            print("❌ No consumer_ids found in CSV")
            sys.exit(1)

        print(f"   ✅ Found {len(all_consumer_ids)} consumer_id(s) in CSV: {', '.join(all_consumer_ids)}")

        # Determine which consumer_ids to evaluate
        if args.consumer_id:
            if args.consumer_id not in all_consumer_ids:
                print(f"❌ Specified consumer_id={args.consumer_id} not found in CSV")
                print(f"   Available: {', '.join(all_consumer_ids)}")
                sys.exit(1)
            consumer_ids_to_evaluate = [args.consumer_id]
            print(f"   ℹ️  Evaluating only consumer_id={args.consumer_id}\n")
        else:
            consumer_ids_to_evaluate = all_consumer_ids
            print(f"   ℹ️  Will evaluate all {len(consumer_ids_to_evaluate)} consumer_ids\n")

        # Collect all evaluations across all consumers
        all_evaluations = []

        # Evaluate each consumer_id
        for consumer_idx, consumer_id in enumerate(consumer_ids_to_evaluate, 1):
            print(f"\n{'#'*80}")
            print(f"# CONSUMER {consumer_idx}/{len(consumer_ids_to_evaluate)}: {consumer_id}")
            print(f"{'#'*80}\n")

            # Read results for this consumer
            results = read_csv_results(input_path, target_consumer_id=consumer_id)
            print(f"   ✅ Found {len(results)} queries for consumer_id={consumer_id}")

            if not results:
                print(f"   ⚠️  No queries found for consumer_id={consumer_id}, skipping...\n")
                continue

            # Load profile
            print(f"\n🔄 Loading profile for consumer_id={consumer_id}...")
            # Try CSV cache first
            print("   Checking CSV cache...")
            profile = load_profile_from_csv_cache(consumer_id)

            if profile:
                print("   ✅ Loaded profile from CSV cache")
            else:
                print(f"   ⚠️  Profile not in cache, loading from {args.profile_source}...")
                if args.profile_source == "snowflake":
                    profile = load_profile_from_snowflake(consumer_id, args.profile_version)
                    print("   ✅ Loaded profile from Snowflake")
                    save_profile_to_csv_cache(consumer_id, profile)
                elif args.profile_source == "crdb":
                    profile = load_profile_from_crdb(int(consumer_id))
                    print("   ✅ Loaded profile from CRDB")
                    save_profile_to_csv_cache(consumer_id, profile)
                else:
                    print("❌ --profile-source must be 'snowflake' or 'crdb'")
                    sys.exit(1)

            print()

            # Run evaluations for this consumer
            for i, (key, data) in enumerate(results.items(), 1):
                query, daypart = key
                recommendations = data["recommendations"]

                print(f"\n{'='*80}")
                print(f"[{i}/{len(results)}] Evaluating: '{query}' ({daypart})")
                print(f"   {len(recommendations)} recommendations")
                print(f"{'='*80}")

                evaluation = await evaluate_query(
                    consumer_id, query, daypart, recommendations, profile, args.judge_model
                )

                all_evaluations.append(evaluation)
                print_evaluation(evaluation, verbose=args.verbose)

        # Print aggregate summary for all evaluations
        if len(all_evaluations) > 1:
            print(f"\n\n{'='*80}")
            print("OVERALL SUMMARY - ALL CONSUMERS")
            print(f"{'='*80}")
            print_aggregate_summary(all_evaluations)

        # Save all results to single CSV file
        if args.output:
            output_path = Path(args.output)
            # If output is just a filename (not a path), save to offline_eval/results
            if not output_path.is_absolute() and output_path.parent == Path("."):
                # Get the script directory
                script_dir = Path(__file__).parent
                results_dir = script_dir / "offline_eval" / "results"
                results_dir.mkdir(parents=True, exist_ok=True)
                output_path = results_dir / output_path.name
        else:
            # Auto-generate output path based on input
            output_path = input_path.parent / input_path.name

        # Add "eval_v2_" prefix to filename if not already present
        if not output_path.name.startswith("eval_v2_"):
            eval_path = output_path.parent / f"eval_v2_{output_path.name}"
        else:
            eval_path = output_path

        # Calculate total recommendation count
        total_recommendations = sum(len(eval_result.recommendation_scores) for eval_result in all_evaluations)

        # Save as CSV
        if eval_path.suffix.lower() == ".csv":
            save_evaluations_to_csv(all_evaluations, eval_path, include_checks=args.include_checks)
            print(f"\n💾 Per-recommendation scores saved to CSV: {eval_path}")
            print(
                f"   Total recommendations: {total_recommendations} (from {len(all_evaluations)} queries across {len(consumer_ids_to_evaluate)} consumer(s))"
            )
            print("   Format: One row per recommendation with individual scores")
            if args.include_checks:
                print("   ✓ Includes detailed check breakdown JSON")
        else:
            # Fallback to JSON if not CSV
            with open(eval_path, "w") as f:
                json.dump([asdict(e) for e in all_evaluations], f, indent=2)
            print(f"\n💾 Per-recommendation scores saved to JSON: {eval_path}")
            print(
                f"   Total recommendations: {total_recommendations} (from {len(all_evaluations)} queries across {len(consumer_ids_to_evaluate)} consumer(s))"
            )

    finally:
        # Restore stdout and close log file
        if tee:
            sys.stdout = original_stdout
            tee.close()
            print(f"✅ Log file closed: {args.log_file}")


if __name__ == "__main__":
    asyncio.run(main())
