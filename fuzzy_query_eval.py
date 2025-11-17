#!/usr/bin/env python3
"""
Fuzzy Query E2E Evaluation Script
Evaluates restaurant recommendations based on:
1. Intent Match (Q1-Q2): Does store menu match query intent
2. Constraints (Q3-Q7): Price, location, speed, quality, dietary
3. Personalization (Q8-Q9): Customer preferences and hard avoids

Uses LLM-as-a-Judge with GPT-4.1 for deterministic evaluation.
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import openai
from dotenv import load_dotenv
from tqdm.asyncio import tqdm_asyncio

# Load environment variables
load_dotenv()

# Initialize OpenAI client
# Use OPENAI_API_KEY environment variable
API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable is required")
client = openai.AsyncOpenAI(api_key=API_KEY)

# Evaluation model
MODEL = "gpt-4.1-2025-04-14"

# ============================================================================
# INTENT CATEGORY CLASSIFIER
# ============================================================================

INTENT_CLASSIFICATION_PROMPT = """You are classifying the intent category of a fuzzy food query.

Query: {query}

Classify into ONE of these categories and return the Q8 weight:

1. "Comfort / Craving / Emotional" (weight: 3)
   - Examples: "need comfort food", "cozy meal", "self-care dinner"

2. "Flavor-Based (Taste / Texture)" (weight: 2)
   - Examples: "spicy and cheesy", "grilled and crispy"

3. "Exploration / Novelty" (weight: 1)
   - Examples: "try something new", "bored of my regulars", "hidden gem"

4. "Group / Occasion" (weight: 1)
   - Examples: "family dinner", "snacks for game night"

5. "Dietary / Health-Driven" (weight: 2)
   - Examples: "vegan dinner", "keto lunch", "healthy but filling"

6. "Functional / Ergonomic" (weight: 2)
   - Examples: "easy to eat in car", "quick desk meal", "travels well"

7. "Generic / Vague / Underspecified" (weight: 2)
   - Examples: "something good", "fun lunch idea"

8. "Popularity / Crowd-Pleaser" (weight: 1)
   - Examples: "what's most popular", "safe pick"

Return ONLY valid JSON:
{{
  "intent_category": "<category name>",
  "q8_weight": <1-3>
}}
"""

# ============================================================================
# EVALUATION PROMPT - ALL 9 QUESTIONS
# ============================================================================

EVALUATION_PROMPT = """You are evaluating a restaurant recommendation for a fuzzy query.

**Query:** {query}

**Customer Profile:**
{customer_profile}

**Store Recommendation:**
{store_info}

**Menu Items (sample):**
{menu_items}

Evaluate the following 9 questions. For each, return "Yes", "No", or "NA" (not applicable).

---

## INTENT MATCH (Critical for relevance)

**Q1** (Weight: 3): Does the store's menu match at least one of the main ideas/details of the fuzzy query?
- Always scored (no NA)
- Example: Query "cozy meal" → ramen/curry = Yes; poke = No

**Q2** (Weight: 2): Does the store's menu cover ALL the details/modifiers in the query (e.g., spicy AND cheesy)?
- Example: Query "spicy and cheesy" → spicy paneer pizza = Yes; only spicy curry + plain naan = No

---

## CONSTRAINTS

**Q3** (Weight: 1): If the query includes a price limit, does the store meet it?
- For 'cheap'/'affordable': Store shows $ or $$ pricing
- NA if no price mentioned

**Q4** (Weight: 1): If the query mentions location ('near me', specific place), is the restaurant within 2 miles?
- NA if no location specified
- Store distance: {distance_miles} miles

**Q5** (Weight: 1): For 'fast'/'quick' queries, does the restaurant deliver in ≤30 minutes?
- For "in X mins" queries, does ETA match?
- NA if no speed requirement
- Store ETA: {eta_minutes}

**Q6** (Weight: 1): For 'best'/'top-rated' queries, does the restaurant have ≥4.7 stars or favorite badge?
- NA if no quality requirement mentioned

**Q7** (Weight: 2): If the query includes a dietary need (vegan, keto, GF), does the store have at least 2 entrees meeting that criteria?
- NA if no dietary need in query

---

## PERSONALIZATION

**Q8** (Weight: {q8_weight}): Does the store's menu align with the customer's profile preferences (cuisines, flavors)?
- Consider customer's cuisine preferences, food preferences, taste preferences
- Yes/No only (no NA)

**Q9** (Weight: 2): Does the store provide at least 2 main dishes that avoid the customer's hard avoids?
- Check strict dietary preferences and preferred ingredient consumption
- Example: Vegetarian customer → restaurant with veg mains = Yes; steakhouse with only 1 salad = No
- Yes/No only (always enforced)

---

Return ONLY valid JSON:
{{
  "intent_match": {{
    "q1_menu_matches_query_intent": "Yes/No",
    "q2_covers_all_modifiers": "Yes/No/NA"
  }},
  "constraints": {{
    "q3_price_limit_met": "Yes/No/NA",
    "q4_location_within_range": "Yes/No/NA",
    "q5_speed_requirement_met": "Yes/No/NA",
    "q6_quality_rating_met": "Yes/No/NA",
    "q7_dietary_need_met": "Yes/No/NA"
  }},
  "personalization": {{
    "q8_matches_customer_preferences": "Yes/No",
    "q9_avoids_customer_hard_avoids": "Yes/No"
  }},
  "reasoning": {{
    "q1": "Brief explanation",
    "q2": "Brief explanation",
    "q3": "Brief explanation",
    "q4": "Brief explanation",
    "q5": "Brief explanation",
    "q6": "Brief explanation",
    "q7": "Brief explanation",
    "q8": "Brief explanation",
    "q9": "Brief explanation"
  }}
}}
"""

# ============================================================================
# SCORING FUNCTIONS
# ============================================================================

def calculate_store_score(eval_result: Dict, q8_weight: int) -> Dict[str, Any]:
    """
    Calculate weighted score for a single store evaluation.

    Weights:
    - Q1: 3, Q2: 2 (Intent Match)
    - Q3: 1, Q4: 1, Q5: 1, Q6: 1, Q7: 2 (Constraints)
    - Q8: dynamic (1-3), Q9: 2 (Personalization)
    """
    weights = {
        "q1": 3,
        "q2": 2,
        "q3": 1,
        "q4": 1,
        "q5": 1,
        "q6": 1,
        "q7": 2,
        "q8": q8_weight,
        "q9": 2
    }

    # Extract answers
    answers = {
        "q1": eval_result["intent_match"]["q1_menu_matches_query_intent"],
        "q2": eval_result["intent_match"]["q2_covers_all_modifiers"],
        "q3": eval_result["constraints"]["q3_price_limit_met"],
        "q4": eval_result["constraints"]["q4_location_within_range"],
        "q5": eval_result["constraints"]["q5_speed_requirement_met"],
        "q6": eval_result["constraints"]["q6_quality_rating_met"],
        "q7": eval_result["constraints"]["q7_dietary_need_met"],
        "q8": eval_result["personalization"]["q8_matches_customer_preferences"],
        "q9": eval_result["personalization"]["q9_avoids_customer_hard_avoids"]
    }

    # Calculate scores
    total_weight = 0
    earned_weight = 0

    for q, answer in answers.items():
        if answer.upper() == "NA":
            # NA questions don't count toward total
            continue
        total_weight += weights[q]
        if answer.upper() == "YES":
            earned_weight += weights[q]

    # Calculate percentages
    score_pct = (earned_weight / total_weight * 100) if total_weight > 0 else 0

    # Intent Match score (for irrelevance rate)
    intent_match_weight = 0
    intent_match_earned = 0
    for q in ["q1", "q2"]:
        if answers[q].upper() != "NA":
            intent_match_weight += weights[q]
            if answers[q].upper() == "YES":
                intent_match_earned += weights[q]

    intent_match_score = (intent_match_earned / intent_match_weight * 100) if intent_match_weight > 0 else 0
    is_relevant = intent_match_score > 0  # At least some intent match

    return {
        "score_pct": round(score_pct, 2),
        "earned_weight": earned_weight,
        "total_weight": total_weight,
        "intent_match_score": round(intent_match_score, 2),
        "is_relevant": is_relevant,
        "answers": answers
    }


def calculate_ndcg(store_scores: List[Dict], k: int = None) -> float:
    """
    Calculate NDCG (Normalized Discounted Cumulative Gain) for position-weighted scoring.
    """
    if not store_scores:
        return 0.0

    if k is None:
        k = len(store_scores)
    else:
        k = min(k, len(store_scores))

    # DCG calculation
    dcg = 0.0
    for i in range(k):
        rel = store_scores[i]["score_pct"] / 100  # Normalize to 0-1
        dcg += rel / np.log2(i + 2)  # i+2 because positions are 1-indexed and log2(1)=0

    # Ideal DCG (sorted by score)
    ideal_scores = sorted([s["score_pct"] for s in store_scores], reverse=True)[:k]
    idcg = 0.0
    for i in range(len(ideal_scores)):
        rel = ideal_scores[i] / 100
        idcg += rel / np.log2(i + 2)

    if idcg == 0:
        return 0.0

    return round(dcg / idcg, 4)


# ============================================================================
# EVALUATION FUNCTIONS
# ============================================================================

async def classify_intent(query: str, semaphore: asyncio.Semaphore) -> Dict[str, Any]:
    """Classify the intent category of a query to determine Q8 weight."""
    async with semaphore:
        try:
            response = await client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": "You are an expert at classifying food query intents. Respond ONLY with valid JSON."},
                    {"role": "user", "content": INTENT_CLASSIFICATION_PROMPT.format(query=query)}
                ],
                response_format={"type": "json_object"},
                temperature=0
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"Error classifying intent for '{query}': {e}")
            # Default to generic query weight
            return {"intent_category": "Generic / Vague / Underspecified", "q8_weight": 2}


async def evaluate_store(
    query: str,
    customer_profile: Dict,
    store: Dict,
    q8_weight: int,
    semaphore: asyncio.Semaphore
) -> Dict[str, Any]:
    """Evaluate a single store recommendation against the query."""
    async with semaphore:
        try:
            # Extract store info
            store_info = {
                "business_id": store.get("business_id", ""),
                "name": store.get("name", store.get("business_id", "")),
                "address": store.get("address", ""),
                "cuisine": store.get("cuisine", ""),
                "dietary_options": store.get("dietary_options", ""),
                "distance_miles": store.get("distance_miles", "N/A"),
                "eta_minutes": store.get("eta_minutes", "N/A"),
                "rating": store.get("rating", "N/A"),
                "price_level": store.get("price_level", "N/A")
            }

            # Extract sample menu items (limit to avoid token overflow)
            menu_items = []
            for item in store.get("menu_items", [])[:10]:  # Top 10 items
                item_info = {
                    "item_id": item.get("item_id", ""),
                    "name": "",
                    "tags": ""
                }
                # Parse profile if it's a string
                if "profile" in item:
                    try:
                        profile = json.loads(item["profile"]) if isinstance(item["profile"], str) else item["profile"]
                        item_info["name"] = profile.get("identity", {}).get("name", "")
                    except:
                        pass
                # Parse tags if it's a string
                if "item_webster_tags" in item:
                    try:
                        tags = json.loads(item["item_webster_tags"]) if isinstance(item["item_webster_tags"], str) else item["item_webster_tags"]
                        item_info["tags"] = {
                            "cuisine": tags.get("cuisine", []),
                            "dish_type": tags.get("dish_type", ""),
                            "flavor": tags.get("flavor", []),
                            "dietary_attributes": tags.get("dietary_attributes", []),
                            "dietary_compliance": tags.get("dietary_compliance", [])
                        }
                    except:
                        pass
                menu_items.append(item_info)

            # Build prompt
            prompt = EVALUATION_PROMPT.format(
                query=query,
                customer_profile=json.dumps(customer_profile, indent=2),
                store_info=json.dumps(store_info, indent=2),
                menu_items=json.dumps(menu_items, indent=2),
                distance_miles=store_info["distance_miles"],
                eta_minutes=store_info["eta_minutes"],
                q8_weight=q8_weight
            )

            # Call LLM
            response = await client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": "You are an expert evaluator. Respond ONLY with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0
            )

            eval_result = json.loads(response.choices[0].message.content)

            # Calculate scores
            scores = calculate_store_score(eval_result, q8_weight)

            return {
                "store_id": store.get("business_id", ""),
                "evaluation": eval_result,
                **scores
            }

        except Exception as e:
            print(f"Error evaluating store {store.get('business_id', '')}: {e}")
            return {
                "store_id": store.get("business_id", ""),
                "error": str(e)
            }


async def evaluate_trace(
    trace: Dict,
    customer_profile: Dict,
    semaphore: asyncio.Semaphore
) -> Dict[str, Any]:
    """Evaluate all store recommendations in a single trace."""
    query = trace.get("original_query", "")

    # Classify intent to get Q8 weight
    intent_info = await classify_intent(query, semaphore)
    q8_weight = intent_info.get("q8_weight", 2)

    # Evaluate each store in recommendations
    store_results = []
    for carousel in trace.get("store_recommendations", []):
        for store in carousel.get("stores", []):
            result = await evaluate_store(query, customer_profile, store, q8_weight, semaphore)
            store_results.append(result)

    if not store_results:
        return {
            "trace_id": trace.get("trace_id", ""),
            "query": query,
            "intent_category": intent_info.get("intent_category", ""),
            "q8_weight": q8_weight,
            "error": "No store recommendations found"
        }

    # Calculate aggregate metrics
    valid_results = [r for r in store_results if "error" not in r]

    if not valid_results:
        return {
            "trace_id": trace.get("trace_id", ""),
            "query": query,
            "intent_category": intent_info.get("intent_category", ""),
            "q8_weight": q8_weight,
            "store_evaluations": store_results,
            "error": "All store evaluations failed"
        }

    # Calculate NDCG for position-weighted scoring
    import numpy as np
    dcg = sum(r["score_pct"] / 100 / np.log2(i + 2) for i, r in enumerate(valid_results))
    ideal_scores = sorted([r["score_pct"] for r in valid_results], reverse=True)
    idcg = sum(s / 100 / np.log2(i + 2) for i, s in enumerate(ideal_scores))
    ndcg = round(dcg / idcg, 4) if idcg > 0 else 0

    # Aggregate scores
    avg_score = sum(r["score_pct"] for r in valid_results) / len(valid_results)
    avg_intent_match = sum(r["intent_match_score"] for r in valid_results) / len(valid_results)
    irrelevance_rate = sum(1 for r in valid_results if not r["is_relevant"]) / len(valid_results) * 100

    return {
        "trace_id": trace.get("trace_id", ""),
        "query": query,
        "intent_category": intent_info.get("intent_category", ""),
        "q8_weight": q8_weight,
        "num_stores_evaluated": len(valid_results),
        "avg_satisfaction_score": round(avg_score, 2),
        "avg_intent_match_score": round(avg_intent_match, 2),
        "irrelevance_rate": round(irrelevance_rate, 2),
        "ndcg": ndcg,
        "store_evaluations": store_results
    }


async def evaluate_conversation(
    conversation_id: str,
    conversation_data: Dict,
    semaphore: asyncio.Semaphore
) -> Dict[str, Any]:
    """Evaluate all traces in a conversation."""
    customer_profile = conversation_data.get("consumer_profile", {})

    # Parse profile if it's a string
    if "profile" in customer_profile and isinstance(customer_profile["profile"], str):
        try:
            customer_profile["parsed_profile"] = json.loads(customer_profile["profile"])
        except:
            pass

    traces = conversation_data.get("traces", [])

    trace_results = []
    for trace in traces:
        result = await evaluate_trace(trace, customer_profile, semaphore)
        trace_results.append(result)

    # Aggregate conversation-level metrics
    valid_traces = [t for t in trace_results if "error" not in t or "store_evaluations" in t]

    if not valid_traces:
        return {
            "conversation_id": conversation_id,
            "num_traces": len(traces),
            "error": "No valid traces to evaluate"
        }

    # Calculate conversation-level scores
    avg_satisfaction = sum(t.get("avg_satisfaction_score", 0) for t in valid_traces) / len(valid_traces)
    avg_irrelevance = sum(t.get("irrelevance_rate", 0) for t in valid_traces) / len(valid_traces)
    avg_ndcg = sum(t.get("ndcg", 0) for t in valid_traces) / len(valid_traces)

    return {
        "conversation_id": conversation_id,
        "num_traces": len(traces),
        "avg_satisfaction_score": round(avg_satisfaction, 2),
        "avg_irrelevance_rate": round(avg_irrelevance, 2),
        "avg_ndcg": round(avg_ndcg, 4),
        "trace_evaluations": trace_results
    }


# ============================================================================
# MAIN
# ============================================================================

async def main():
    parser = argparse.ArgumentParser(
        description="Evaluate fuzzy query recommendations using E2E rubric"
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to CSV file with traces"
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to output evaluation JSON file"
    )
    parser.add_argument(
        "--parallel",
        type=int,
        default=10,
        help="Maximum parallel API calls"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of conversations to evaluate (for testing)"
    )

    args = parser.parse_args()

    # Import numpy for NDCG calculation
    global np
    import numpy as np

    # Load CSV
    print(f"Loading traces from {args.input}...")
    df = pd.read_csv(args.input)

    if args.limit:
        df = df.head(args.limit)

    print(f"Loaded {len(df)} conversations\n")

    # Create semaphore for rate limiting
    semaphore = asyncio.Semaphore(args.parallel)

    # Evaluate all conversations
    print(f"Evaluating conversations (max {args.parallel} parallel)...")

    tasks = []
    for idx, row in df.iterrows():
        conversation_id = row["CONVERSATION_ID"]
        conversation_data = json.loads(row["CONVERSATION_JSON"])
        task = evaluate_conversation(conversation_id, conversation_data, semaphore)
        tasks.append(task)

    results = await tqdm_asyncio.gather(*tasks, desc="Evaluating")

    # Calculate summary statistics
    valid_results = [r for r in results if "error" not in r]

    if valid_results:
        avg_satisfaction = sum(r["avg_satisfaction_score"] for r in valid_results) / len(valid_results)
        avg_irrelevance = sum(r["avg_irrelevance_rate"] for r in valid_results) / len(valid_results)
        avg_ndcg = sum(r["avg_ndcg"] for r in valid_results) / len(valid_results)

        print(f"\n{'='*70}")
        print(f"EVALUATION SUMMARY - Fuzzy Query E2E Evals")
        print(f"{'='*70}")
        print(f"Total Conversations: {len(results)}")
        print(f"Valid Evaluations: {len(valid_results)}")
        print(f"\nAggregate Metrics:")
        print(f"  Avg Satisfaction Score: {avg_satisfaction:.2f}%")
        print(f"  Avg Irrelevance Rate: {avg_irrelevance:.2f}%")
        print(f"  Avg NDCG: {avg_ndcg:.4f}")
        print(f"{'='*70}\n")

    # Save results
    print(f"Saving results to {args.output}...")
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    output_data = {
        "metadata": {
            "input_file": args.input,
            "num_conversations": len(results),
            "num_valid": len(valid_results),
            "avg_satisfaction_score": round(avg_satisfaction, 2) if valid_results else 0,
            "avg_irrelevance_rate": round(avg_irrelevance, 2) if valid_results else 0,
            "avg_ndcg": round(avg_ndcg, 4) if valid_results else 0
        },
        "results": results
    }

    with open(output_path, 'w') as f:
        json.dump(output_data, f, indent=2)

    print(f"Done! Results saved to {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
