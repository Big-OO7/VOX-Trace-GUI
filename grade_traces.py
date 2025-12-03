#!/usr/bin/env python3
"""
Structured Query Grader - VOX Metis Trace Evaluation Pipeline

This script evaluates <query, store> relevance using the DoorDash
StructuredQueryStoreEvaluator rubric and scoring system.

Usage:
    python grade_traces.py --input VOX__Metis_100_FullTraces.csv --output grades.json --limit 10
"""

import argparse
import json
import logging
import sys
import os
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from datetime import datetime

import pandas as pd
from tqdm import tqdm

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package not installed. Run: pip install openai")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('grading_pipeline.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


# ============================================================================
# SCORING CONFIGURATION (from DoorDash evaluator)
# ============================================================================

DEFAULT_SCORE_MAPPING_DICT = {
    'is_serving_matched': 3,
    'is_serving_more_than_three_items': 2,
    'is_primary_serving': 2,
    'is_dietary_serving': 3,
    'is_flavor_match': 1,
    'is_ingredient_present': 3,
    'is_prep_style_matched': 1,
    'is_exact_restaurant': 3,
    'is_similar_restaurant': 2,
    'is_portion_matched': 1,
    'is_group_matched': 1,
    'is_nearby': 2,
    'is_fast_delivery': 2,
    'is_top_rated': 2,
    'is_overall_rating_good': 2,
    'is_store_open': 3,
    'is_price_match': 2,
    'is_fast_delivery_check': 2,
}


# ============================================================================
# SYSTEM PROMPT (from DoorDash evaluator)
# ============================================================================

SYSTEM_PROMPT = """
You are an expert evaluator for food delivery <query, store> relevance based on rubrics and with the following inputs:
- search_query
- store_name
- most_relevant_20_items_in_the_store (in the format of a string in "[name: item_1_name, menu_category: item_1_menu_category...], [name: item_2_name, menu_category: item_2_menu_category...], ..".
- store_summary
- store_price_dollar_sign
- store_rating
- store_and_consumer_distance_miles
- store_eta_minute
- store_address
- whether_the_store_is_open

IDENTIFY QUERY CATEGORIES:
Classify the structured_query into exactly ONE MAJOR CATEGORY of:
- dish: names a specific dish or a dish family with/without attributes (e.g., "burger", "chicken tikka masala", "ramen", "spicy burger", "vegan burger")
- cuisine: names a cuisine with/without attributes (e.g., "thai", "japanese", "mexican", "mediterranean", "healthy thai")
- restaurant: names a restaurant/brand (e.g., "Chipotle", "Marnee Thai")
- attribute_only: only flavor/dietary/price/portion/prep/distance/speed/popularity/quality terms, with NO dish and NO cuisine (e.g., "cheap spicy vegetarian", "gluten free", "under $20 healthy dinner")
- ambiguous: unclear after reasonable effort

IMPORTANT HARD RULE:
- If query_type = attribute_only (or ambiguous with no dish/cuisine evidence), then for is_serving_matched, is_serving_more_than_three_items, and is_primary_serving, the answer must be NA.

CORE CATEGORY RUBRICS (dish queries) - w means weight
- is_serving_matched (w=3): NA if the query is not asking for specific cuisine and not for specific dish names; Y if store clearly serves the named dish (≥1); N otherwise.
- is_serving_more_than_three_items (w=2): NA if the query is not asking for specific cuisine and not for specific dish names; Y if ≥3 items of that dish type exist; N otherwise.
- is_primary_serving (w=2): NA if the query is not asking for specific cuisine and not for specific dish names; Y if the dish is a primary offering (≥30% of menu or in store name/summary); N otherwise.
- is_dietary_serving (w=3): NA if dietary constraints not mentioned in search_query; Y if the store serves ≥1 requested dish that meets both dish type and dietary constraints; else N.
- is_flavor_match (w=1): NA if flavor not mentioned in search_query; Y if ≥1 item matches both dish and flavor request; else N.
- is_ingredient_present (w=3): NA if query's dish/cuisine already embeds the ingredient or it's a cuisine-only query; Y if named ingredient is clearly present in the requested item; else N.
- is_prep_style_matched (w=1): NA if prep style not mentioned in search_query; Y if ≥1 item matches dish and prep style; else N.
- is_exact_restaurant (w=3): NA if restaurant name not mentioned; Y if exact match; N otherwise.
- is_similar_restaurant (w=2): NA if restaurant name not mentioned or exact match found; Y if similar restaurant; N otherwise.
- is_portion_matched (w=1): NA if portion not mentioned; Y if ≥1 matched item's portion meets request; else N.
- is_group_matched (w=1): NA if group information not mentioned; Y if ≥1 item matches dish and is platter/combo or meets portion request; else N.

CONTEXT RUBRICS
- is_nearby (w=2): NA if location/distance not mentioned; Y if distance ≤ 2 miles; N otherwise.
- is_fast_delivery (w=2): NA if speed not mentioned; Y if ETA ≤ 30 minutes; N otherwise.
- is_fast_delivery_check (w=2): Y if ETA ≤ 30 minutes; N otherwise.
- is_store_open (w=3): Y if store is open (whether_the_store_is_open = 1); N otherwise.
- is_top_rated (w=2): NA if rating/quality not mentioned; Y if rating ≥ 4.5; N otherwise.
- is_overall_rating_good (w=2): Y if rating ≥ 4.0; N otherwise.
- is_price_match (w=2): NA if price not mentioned; Y if price matches request; N otherwise.

OUTPUT FORMAT:
Return a JSON object with exactly these fields:
{
  "label": "relevant" or "not_relevant",
  "explanation": "Y | <comma-separated YES criteria>; N | <comma-separated NO criteria>; NA | <comma-separated NA criteria>; SUM | <earned_points>; RATIONAL | <brief rationale>"
}

Example explanation:
"Y | is_serving_matched, is_primary_serving, is_nearby, is_fast_delivery_check; N | is_flavor_match; NA | is_dietary_serving, is_exact_restaurant; SUM | 10; RATIONAL | Store serves burgers and is nearby with fast delivery"
"""


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class GradingTask:
    """Represents a single <query, store> grading task."""
    conversation_id: str
    trace_index: int
    rewrite_id: str
    carousel_index: int
    query: str
    original_query: str
    store_id: str
    store_name: str
    most_relevant_top_20_items: List[Dict[str, Any]]
    store_summary: str
    store_price_dollar_sign: str
    store_rating: float
    store_and_consumer_distance_miles: float
    store_eta_minute: int
    store_address: str
    whether_the_store_is_open: int


@dataclass
class GradingResult:
    """Represents the output of grading a single task."""
    conversation_id: str
    trace_index: int
    rewrite_id: str
    carousel_index: int
    query: str
    original_query: str
    store_id: str
    store_name: str
    scores: Dict[str, str]
    weighted_score_pct: float
    earned_pts: float
    applicable_pts: float
    label: str
    rationale: str
    raw_explanation: str
    error: Optional[str] = None


# ============================================================================
# CSV PARSING FUNCTIONS
# ============================================================================

def extract_grading_tasks(csv_path: str, limit: Optional[int] = None) -> List[GradingTask]:
    """
    Extract all grading tasks from VOX Metis trace CSV.

    Args:
        csv_path: Path to CSV file
        limit: Optional limit on number of tasks to extract

    Returns:
        List of GradingTask objects
    """
    logger.info(f"Loading traces from {csv_path}")
    df = pd.read_csv(csv_path)
    logger.info(f"Loaded {len(df)} conversations")

    all_tasks = []
    skipped = 0

    for idx, row in tqdm(df.iterrows(), total=len(df), desc="Extracting tasks"):
        try:
            conversation_id = row['CONVERSATION_ID']
            conversation_json = json.loads(row['CONVERSATION_JSON'])

            traces = conversation_json.get('traces', [])

            for trace_idx, trace in enumerate(traces):
                original_query = trace.get('original_query', '')

                # Get rewritten queries
                rewritten_queries = trace.get('rewritten_queries', [])
                if not rewritten_queries:
                    # Use original query if no rewrites
                    queries_to_process = [(f"trace_{trace_idx}", original_query)]
                else:
                    queries_to_process = [
                        (f"trace_{trace_idx}_rewrite_{rw_idx}", rw.get('rewritten_query', original_query))
                        for rw_idx, rw in enumerate(rewritten_queries)
                    ]

                # Get store recommendations
                store_recommendations = trace.get('store_recommendations', [])

                for carousel_idx_pos, carousel in enumerate(store_recommendations):
                    carousel_idx = carousel.get('carousel_index', carousel_idx_pos)
                    carousel_name = carousel.get('carousel_name') or carousel.get('title')
                    stores = carousel.get('stores', [])

                    # Determine which query to use for this carousel (match name-based logic from GUI)
                    rewrite_id = f"trace_{trace_idx}_rewrite_0"
                    query = original_query

                    if carousel_name and rewritten_queries:
                        # Try to find a rewrite that matches the carousel name (case-insensitive)
                        matching_idx = -1
                        for rw_idx, rw in enumerate(rewritten_queries):
                            rw_query = rw.get('rewritten_query', '')
                            if rw_query and carousel_name.lower() in rw_query.lower():
                                matching_idx = rw_idx
                                break

                        if matching_idx != -1:
                            rewrite_id = f"trace_{trace_idx}_rewrite_{matching_idx}"
                            query = rewritten_queries[matching_idx].get('rewritten_query', original_query)
                        elif carousel_idx_pos < len(queries_to_process):
                            # Fall back to position-based matching
                            rewrite_id, query = queries_to_process[carousel_idx_pos]
                    elif carousel_idx_pos < len(queries_to_process):
                        # No name, use position-based matching (carousel pos 0 -> rewrite 0, pos 1 -> rewrite 1, etc.)
                        rewrite_id, query = queries_to_process[carousel_idx_pos]

                    # Grade each store in this carousel with the matched query
                    for store in stores:
                        task = create_grading_task(
                            conversation_id=conversation_id,
                            trace_index=trace_idx,
                            rewrite_id=rewrite_id,
                            carousel_index=carousel_idx,
                            query=query,
                            original_query=original_query,
                            store=store
                        )

                        if task:
                            all_tasks.append(task)

                            if limit and len(all_tasks) >= limit:
                                logger.info(f"Reached limit of {limit} tasks")
                                return all_tasks

        except Exception as e:
            logger.warning(f"Failed to process conversation {idx}: {e}")
            skipped += 1
            continue

    logger.info(f"Extracted {len(all_tasks)} grading tasks")
    logger.info(f"Skipped {skipped} conversations due to errors")

    return all_tasks


def create_grading_task(conversation_id: str, trace_index: int, rewrite_id: str,
                       carousel_index: int, query: str, original_query: str,
                       store: Dict[str, Any]) -> Optional[GradingTask]:
    """Create a GradingTask from store data."""
    try:
        # Extract menu items
        menu_items = store.get('menu_items', [])[:20]

        # Parse ETA
        eta_str = store.get('eta_minutes', '0')
        if isinstance(eta_str, str):
            eta_minutes = int(eta_str.replace('min', '').strip())
        else:
            eta_minutes = int(eta_str)

        # Create task
        task = GradingTask(
            conversation_id=conversation_id,
            trace_index=trace_index,
            rewrite_id=rewrite_id,
            carousel_index=carousel_index,
            query=query,
            original_query=original_query,
            store_id=str(store.get('store_id', store.get('business_id', ''))),
            store_name=store.get('store_name', 'Unknown'),
            most_relevant_top_20_items=menu_items,
            store_summary=store.get('summary', ''),
            store_price_dollar_sign='$' * int(store.get('price_range', 1)),
            store_rating=float(store.get('star_rating', 0.0)),
            store_and_consumer_distance_miles=float(store.get('distance_miles', 0.0)),
            store_eta_minute=eta_minutes,
            store_address=store.get('address', ''),
            whether_the_store_is_open=1 if store.get('is_open') is not False else 0,
        )

        return task

    except Exception as e:
        logger.warning(f"Failed to create task: {e}")
        return None


# ============================================================================
# EVALUATOR FUNCTIONS
# ============================================================================

def format_menu_items(items: List[Dict[str, Any]]) -> str:
    """Format menu items for the prompt."""
    formatted_items = []
    for item in items:
        # Parse item_webster_tags if it's a JSON string
        webster_tags = item.get('item_webster_tags', {})
        if isinstance(webster_tags, str):
            try:
                webster_tags = json.loads(webster_tags)
            except:
                webster_tags = {}

        # Extract name and category
        name = item.get('item_name', item.get('name', 'Unknown'))

        # Try to get menu category from webster_tags or profile
        menu_category = webster_tags.get('dish_type', 'Unknown')
        if menu_category == 'Unknown':
            profile = item.get('profile', {})
            if isinstance(profile, str):
                try:
                    profile = json.loads(profile)
                except:
                    profile = {}
            menu_category = profile.get('identity', {}).get('category', 'Unknown')

        formatted_items.append(f"[name: {name}, menu_category: {menu_category}]")

    return ", ".join(formatted_items)


def create_user_prompt(task: GradingTask) -> str:
    """Create user prompt for a grading task."""
    menu_items_str = format_menu_items(task.most_relevant_top_20_items)

    prompt = f"""
search_query: {task.query}
store_name: {task.store_name}
most_relevant_20_items_in_the_store: {menu_items_str}
store_summary: {task.store_summary}
store_price_dollar_sign: {task.store_price_dollar_sign}
store_rating: {task.store_rating}
store_and_consumer_distance_miles: {task.store_and_consumer_distance_miles}
store_eta_minute: {task.store_eta_minute}
store_address: {task.store_address}
whether_the_store_is_open: {task.whether_the_store_is_open}
"""

    return prompt.strip()


def call_llm(client: OpenAI, user_prompt: str, model: str = "gpt-4o-mini",
             temperature: float = 0.0) -> Optional[Dict[str, Any]]:
    """Call OpenAI API with the evaluation prompt."""
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=temperature,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        return result

    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return None


def parse_explanation(explanation: str) -> Tuple[Dict[str, str], str]:
    """Parse explanation string to extract scores and rationale."""
    scores = {}
    rationale = ""

    try:
        parts = explanation.split(';')

        for part in parts:
            part = part.strip()
            if '|' not in part:
                continue

            key, value = part.split('|', 1)
            key = key.strip()
            value = value.strip()

            if key == 'Y':
                for criterion in value.split(','):
                    criterion = criterion.strip()
                    if criterion:
                        scores[criterion] = 'Yes'

            elif key == 'N':
                for criterion in value.split(','):
                    criterion = criterion.strip()
                    if criterion:
                        scores[criterion] = 'No'

            elif key == 'NA':
                for criterion in value.split(','):
                    criterion = criterion.strip()
                    if criterion:
                        scores[criterion] = 'NA to Query'

            elif key == 'RATIONAL':
                rationale = value

    except Exception as e:
        logger.warning(f"Failed to parse explanation: {e}")

    return scores, rationale


def calculate_weighted_score(scores: Dict[str, str]) -> Tuple[float, float, float]:
    """Calculate weighted score from rubric scores."""
    earned = 0.0
    applicable = 0.0

    for criterion, answer in scores.items():
        weight = DEFAULT_SCORE_MAPPING_DICT.get(criterion, 0)

        if answer == 'Yes':
            earned += weight
            applicable += weight
        elif answer == 'No':
            applicable += weight
        # NA criteria don't count toward applicable points

    # Calculate percentage
    if applicable > 0:
        weighted_pct = (earned / applicable) * 100
    else:
        weighted_pct = 0.0

    return weighted_pct, earned, applicable


def evaluate_task(task: GradingTask, client: OpenAI, model: str, temperature: float) -> GradingResult:
    """Evaluate a single grading task."""
    try:
        # Create prompt
        user_prompt = create_user_prompt(task)

        # Call LLM
        llm_result = call_llm(client, user_prompt, model, temperature)

        if not llm_result:
            raise Exception("LLM call returned no result")

        # Parse response
        label = llm_result.get('label', 'not_relevant')
        explanation = llm_result.get('explanation', '')

        # Extract scores and rationale
        scores, rationale = parse_explanation(explanation)

        # Calculate weighted score
        weighted_pct, earned, applicable = calculate_weighted_score(scores)

        # Create result
        result = GradingResult(
            conversation_id=task.conversation_id,
            trace_index=task.trace_index,
            rewrite_id=task.rewrite_id,
            carousel_index=task.carousel_index,
            query=task.query,
            original_query=task.original_query,
            store_id=task.store_id,
            store_name=task.store_name,
            scores=scores,
            weighted_score_pct=weighted_pct,
            earned_pts=earned,
            applicable_pts=applicable,
            label=label,
            rationale=rationale,
            raw_explanation=explanation,
        )

        return result

    except Exception as e:
        logger.error(f"Failed to evaluate task {task.rewrite_id}: {e}")
        return GradingResult(
            conversation_id=task.conversation_id,
            trace_index=task.trace_index,
            rewrite_id=task.rewrite_id,
            carousel_index=task.carousel_index,
            query=task.query,
            original_query=task.original_query,
            store_id=task.store_id,
            store_name=task.store_name,
            scores={},
            weighted_score_pct=0.0,
            earned_pts=0.0,
            applicable_pts=0.0,
            label='error',
            rationale='',
            raw_explanation='',
            error=str(e),
        )


def run_evaluator(tasks: List[GradingTask], model: str = "gpt-4o-mini",
                 temperature: float = 0.0, max_workers: int = 10) -> List[GradingResult]:
    """Run evaluation on all tasks using parallel workers."""
    logger.info(f"Running evaluator on {len(tasks)} tasks with {max_workers} workers")

    # Initialize OpenAI client
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        logger.error("OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    results = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_task = {
            executor.submit(evaluate_task, task, client, model, temperature): task
            for task in tasks
        }

        # Collect results with progress bar
        for future in tqdm(as_completed(future_to_task), total=len(tasks), desc="Evaluating"):
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                logger.error(f"Task evaluation failed: {e}")

    logger.info(f"Completed evaluation of {len(results)} tasks")
    return results


# ============================================================================
# OUTPUT FUNCTIONS
# ============================================================================

def save_results(results: List[GradingResult], output_path: str):
    """Save results as JSON file."""
    logger.info(f"Saving {len(results)} results to {output_path}")

    output_data = {
        'metadata': {
            'total_tasks': len(results),
            'timestamp': datetime.now().isoformat(),
            'score_mapping': DEFAULT_SCORE_MAPPING_DICT,
        },
        'results': [
            {
                'conversation_id': r.conversation_id,
                'trace_index': r.trace_index,
                'rewrite_id': r.rewrite_id,
                'carousel_index': r.carousel_index,
                'query': r.query,
                'original_query': r.original_query,
                'store_id': r.store_id,
                'store_name': r.store_name,
                'scores': r.scores,
                'weighted_score_pct': r.weighted_score_pct,
                'earned_pts': r.earned_pts,
                'applicable_pts': r.applicable_pts,
                'label': r.label,
                'rationale': r.rationale,
                'error': r.error,
            }
            for r in results
        ]
    }

    with open(output_path, 'w') as f:
        json.dump(output_data, f, indent=2)

    logger.info(f"Successfully saved results to {output_path}")


def print_summary_stats(results: List[GradingResult]):
    """Print summary statistics."""
    if not results:
        logger.warning("No results to summarize")
        return

    total = len(results)
    relevant = sum(1 for r in results if r.label == 'relevant')
    not_relevant = sum(1 for r in results if r.label == 'not_relevant')
    errors = sum(1 for r in results if r.error)

    scores = [r.weighted_score_pct for r in results if not r.error]
    avg_score = sum(scores) / len(scores) if scores else 0

    logger.info("=" * 60)
    logger.info("GRADING SUMMARY")
    logger.info("=" * 60)
    logger.info(f"Total tasks: {total}")
    logger.info(f"Relevant: {relevant} ({relevant/total*100:.1f}%)")
    logger.info(f"Not relevant: {not_relevant} ({not_relevant/total*100:.1f}%)")
    logger.info(f"Errors: {errors}")
    logger.info(f"Average score: {avg_score:.2f}%")
    logger.info("=" * 60)


# ============================================================================
# MAIN PIPELINE
# ============================================================================

def main():
    """Main pipeline orchestration."""
    parser = argparse.ArgumentParser(
        description='Grade VOX Metis traces using structured query rubric'
    )
    parser.add_argument('--input', required=True, help='Path to input CSV')
    parser.add_argument('--output', required=True, help='Path to output JSON')
    parser.add_argument('--model', default='gpt-4o-mini', help='OpenAI model')
    parser.add_argument('--temperature', type=float, default=0.0, help='LLM temperature')
    parser.add_argument('--parallel', type=int, default=10, help='Number of parallel workers')
    parser.add_argument('--limit', type=int, help='Limit number of tasks (for testing)')

    args = parser.parse_args()

    if not Path(args.input).exists():
        logger.error(f"Input file not found: {args.input}")
        sys.exit(1)

    try:
        # Step 1: Extract tasks
        logger.info("STEP 1: Extracting grading tasks")
        tasks = extract_grading_tasks(args.input, limit=args.limit)

        if not tasks:
            logger.error("No tasks extracted. Check input format.")
            sys.exit(1)

        # Step 2: Run evaluation
        logger.info("STEP 2: Running evaluation")
        results = run_evaluator(
            tasks,
            model=args.model,
            temperature=args.temperature,
            max_workers=args.parallel
        )

        # Step 3: Save results
        logger.info("STEP 3: Saving results")
        save_results(results, args.output)

        # Step 4: Print summary
        logger.info("STEP 4: Summary statistics")
        print_summary_stats(results)

        logger.info("Pipeline completed successfully!")

    except Exception as e:
        logger.error(f"Pipeline failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
