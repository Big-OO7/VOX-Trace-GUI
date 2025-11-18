#!/usr/bin/env python3
"""
Two-Pronged E2E Evaluation System

Phase 1: Fuzzy Query → Structured Query Evaluation
Phase 2: Structured Query → Store Recommendations Evaluation

Combines insights from both evaluation approaches for comprehensive assessment.
"""

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import openai
from dotenv import load_dotenv
from tqdm.asyncio import tqdm_asyncio

# Load environment variables
load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable is required")
client = openai.AsyncOpenAI(api_key=API_KEY)

MODEL = "gpt-4.1-2025-04-14"

# ============================================================================
# PHASE 1: FUZZY QUERY EVALUATION
# ============================================================================

FUZZY_INTENT_CLASSIFICATION_PROMPT = """You are an expert AI evaluator specialized in understanding customer food ordering intent. Your task is to analyze a fuzzy query and classify its underlying intent category with precision.

**QUERY TO ANALYZE:**
"{query}"

**YOUR TASK:**
Carefully read the query and determine which ONE category best captures the customer's primary intent. The category you select will determine the weight given to personalization (Q8) in the evaluation rubric.

**CLASSIFICATION CATEGORIES:**

**1. Comfort / Craving / Emotional** (Q8 Weight: 3 - HIGHEST)
   - Core intent: Emotional fulfillment, nostalgia, stress relief, self-care
   - Personalization is CRITICAL - customers want specific comfort foods
   - Keywords: comfort, cozy, craving, feel-good, treat myself, indulge, nostalgic, miss, warm
   - Examples:
     * "need comfort food after a long day"
     * "cozy meal to warm me up"
     * "self-care dinner tonight"
     * "craving my favorite childhood food"
     * "something indulgent and satisfying"

**2. Flavor-Based (Taste / Texture)** (Q8 Weight: 2 - HIGH)
   - Core intent: Specific flavor profile or texture combination desired
   - Personalization matters - customers have specific taste preferences
   - Keywords: spicy, sweet, savory, crispy, crunchy, creamy, tangy, rich, bold, mild
   - Examples:
     * "spicy and cheesy"
     * "grilled and crispy chicken"
     * "something sweet and savory"
     * "rich and creamy pasta"
     * "bold flavors and crunchy texture"

**3. Dietary / Health-Driven** (Q8 Weight: 2 - HIGH)
   - Core intent: Meeting dietary requirements or health goals
   - Personalization matters - dietary needs are personal
   - Keywords: vegan, vegetarian, keto, paleo, gluten-free, dairy-free, healthy, low-carb, protein-rich
   - Examples:
     * "vegan dinner options"
     * "keto lunch under 500 calories"
     * "healthy but filling meal"
     * "gluten-free pizza"
     * "high-protein post-workout meal"

**4. Functional / Ergonomic** (Q8 Weight: 2 - HIGH)
   - Core intent: Practical eating situation or convenience requirement
   - Personalization matters - eating contexts vary by individual
   - Keywords: easy to eat, portable, travels well, desk meal, car-friendly, on-the-go
   - Examples:
     * "easy to eat in the car"
     * "quick desk lunch"
     * "travels well for picnic"
     * "one-handed eating while working"
     * "mess-free portable meal"

**5. Generic / Vague / Underspecified** (Q8 Weight: 2 - MEDIUM)
   - Core intent: Broad or unclear intent, needs clarification
   - Moderate personalization - preferences help narrow down
   - Keywords: something, good, nice, fun, interesting, different (without specifics)
   - Examples:
     * "something good for dinner"
     * "fun lunch idea"
     * "what should I eat?"
     * "looking for food"
     * "hungry, need ideas"

**6. Exploration / Novelty** (Q8 Weight: 1 - LOW)
   - Core intent: Discovering new options, trying unfamiliar foods
   - Lower personalization - actively seeking to break patterns
   - Keywords: new, different, never tried, hidden gem, discover, explore, adventurous
   - Examples:
     * "try something new"
     * "bored of my regulars"
     * "hidden gem restaurants"
     * "never had Ethiopian food"
     * "something adventurous"

**7. Group / Occasion** (Q8 Weight: 1 - LOW)
   - Core intent: Feeding multiple people or special event
   - Lower personalization - group consensus matters more
   - Keywords: family, group, party, friends, sharing, game night, potluck, gathering
   - Examples:
     * "family dinner for 6"
     * "snacks for game night"
     * "party food for friends"
     * "shareable appetizers"
     * "meal for the team"

**8. Popularity / Crowd-Pleaser** (Q8 Weight: 1 - LOW)
   - Core intent: Safe, popular, widely-liked options
   - Lower personalization - seeking mainstream appeal
   - Keywords: popular, trending, most ordered, safe pick, can't go wrong, everyone likes
   - Examples:
     * "what's most popular?"
     * "safe pick for picky eaters"
     * "trending restaurants nearby"
     * "most ordered dish"
     * "can't go wrong option"

**IMPORTANT GUIDELINES:**
1. Choose the category that BEST matches the PRIMARY intent (queries may have multiple intents)
2. If multiple categories seem to apply, select the one with the strongest signal
3. The Q8 weight reflects how much customer preferences matter:
   - Weight 3: Personalization is critical (emotional/comfort needs)
   - Weight 2: Personalization is important (specific requirements)
   - Weight 1: Personalization is less critical (exploration/group/popularity)
4. Be decisive - every query must map to exactly ONE category

**OUTPUT FORMAT:**
Return ONLY valid JSON with no additional text:
{{
  "intent_category": "<exact category name from list above>",
  "q8_weight": <integer: 1, 2, or 3>
}}
"""

FUZZY_QUERY_EVALUATION_PROMPT = """You are evaluating store recommendations for a FUZZY query using binary checks.

**IMPORTANT INSTRUCTIONS:**
- For each question, return "Yes", "No", or "NA" (as a string)
- Use "NA" ONLY when the check is not applicable based on the query
- ONLY evaluate what is present in the data - do NOT make assumptions
- Always consider item customizations available (e.g., spice level, protein replacements)

**Original Fuzzy Query:** {fuzzy_query}
**Structured Query (Rewrite):** {structured_query}

**Customer Profile:**
{customer_profile}

**Store Recommendation:**
{store_info}

**Menu Items (sample):**
{menu_items}

Evaluate the following 9 questions for the FUZZY query against this store:

## INTENT MATCH

**Q1** (Weight: 3): Does the store's menu match at least one of the main ideas/details of the fuzzy query (e.g., cozy, spicy, indulgent)?
- **Always scored (no NA)**
- Pass: Store menu matches at least one main idea from fuzzy query
- Fail: Store menu does not match any main ideas
- Examples:
  * Query "cozy meal" → ramen/curry restaurant = Yes; poke bowl shop = No
  * Query "indulgent dessert" → bakery/ice cream shop = Yes; salad bar = No
  * Query "spicy food" → Thai/Indian/Mexican with spicy options = Yes; Italian pasta = No

**Q2** (Weight: 2): Does the store's menu cover ALL the details/modifiers in the query (e.g., spicy AND cheesy)?
- Pass: Menu covers every modifier mentioned in fuzzy query
- Fail: Missing one or more modifiers
- NA: Query has only one modifier/detail
- Examples:
  * Query "spicy and cheesy" → spicy paneer pizza = Yes; only spicy curry + plain naan = No
  * Query "healthy and filling" → grain bowls with protein = Yes; light salads only = No
  * Query "quick" (single modifier) → NA

## CONSTRAINTS

**Q3** (Weight: 1): If the query includes a price limit, does the store have at least 2 items under that limit? For 'cheap' or 'affordable' queries, does the restaurant show $ or $$ pricing?
- Pass: Meets price requirements with 2+ items
- Fail: Does not meet price requirements
- NA: No price constraint in query
- Store price level: {price_level}
- Examples:
  * Query "cheap dinner" + Store has $$ pricing = Yes
  * Query "affordable lunch" + Store has $$$ pricing = No
  * Query "Italian food" (no price mentioned) = NA

**Q4** (Weight: 1): Is the restaurant within 2 miles of the named location or customer address ('near me')?
- Pass: Store within 2 miles of specified location
- Fail: Store more than 2 miles away
- NA: No location constraint in query
- Store distance: {distance_miles} miles
- Examples:
  * Query "Mexican near Mission" + Store in Mission district = Yes
  * Query "pizza near me" + Store 3 miles away = No
  * Query "best sushi" (no location) = NA

**Q5** (Weight: 1): For 'fast' or 'quick' queries, does the restaurant typically deliver in ≤30 minutes? For "< X mins" queries, does the restaurant deliver in X mins?
- Pass: Meets speed requirement
- Fail: Does not meet speed requirement
- NA: No speed constraint in query
- Store ETA: {eta_minutes} minutes
- Examples:
  * Query "quick Chinese" + ETA 25 mins = Yes
  * Query "pizza in 20 mins" + ETA 25 mins = No
  * Query "best burgers" (no speed) = NA

**Q6** (Weight: 1): For best/top-rated cuisine queries, does the restaurant have ≥4.7 stars or a favorite badge?
- Pass: Has 4.7+ stars or favorite badge
- Fail: Below 4.7 stars and no favorite badge
- NA: No quality requirement in query
- Store rating: {rating}
- Examples:
  * Query "best Italian" + 4.8 stars = Yes
  * Query "top-rated Thai" + 4.5 stars = No
  * Query "quick dinner" (no quality) = NA

**Q7** (Weight: 2): If the query includes a dietary need (vegan, keto, GF), does the store have at least 2 entrees that meet that criteria?
- Pass: Has 2+ entrees meeting dietary criteria
- Fail: Has 1 or fewer entrees meeting criteria
- NA: No dietary constraint in query
- Examples:
  * Query "vegan dinner date night" + Thai with 3 vegan mains = Yes
  * Query "gluten-free lunch" + BBQ with only fries GF = No
  * Query "cozy meal" (no dietary) = NA

## PERSONALIZATION

**Q8** (Weight: {q8_weight}): Does the store's menu align with the customer's profile preferences (cuisines, flavors, food preferences)?
- **Always scored (no NA)** - Yes/No only
- Pass: Store menu aligns with customer profile preferences
- Fail: Store menu conflicts with or ignores customer preferences
- Examples:
  * Customer likes "Thai, Indian, spicy food" + Thai restaurant = Yes
  * Customer prefers "healthy, light meals" + steakhouse = No
  * Customer likes "comfort food, pasta" + Italian restaurant = Yes

**Q9** (Weight: 2): Does the store provide at least 2 main dishes that avoid the customer's hard avoids (e.g., vegetarian, no beef)?
- **Always scored (no NA)** - Yes/No only
- Pass: Has 2+ main dishes that respect hard avoids
- Fail: Has 1 or fewer compliant main dishes
- Examples:
  * Vegetarian customer + Indian place with many veg mains = Yes
  * Vegetarian customer + steakhouse with 1 salad = No
  * No beef preference + Mexican restaurant with chicken/pork/veg options = Yes

**CRITICAL FORMATTING:**
Return ONLY valid JSON with exact field names. Each answer must be a string: "Yes", "No", or "NA".

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
    "q1": "Brief explanation (2-3 sentences)",
    "q2": "Brief explanation (2-3 sentences)",
    "q3": "Brief explanation (2-3 sentences)",
    "q4": "Brief explanation (2-3 sentences)",
    "q5": "Brief explanation (2-3 sentences)",
    "q6": "Brief explanation (2-3 sentences)",
    "q7": "Brief explanation (2-3 sentences)",
    "q8": "Brief explanation (2-3 sentences)",
    "q9": "Brief explanation (2-3 sentences)"
  }}
}}
"""

# ============================================================================
# PHASE 2: STRUCTURED QUERY EVALUATION
# ============================================================================

STRUCTURED_QUERY_EVALUATION_PROMPT = """You are evaluating store recommendations for a STRUCTURED query using binary checks.

**IMPORTANT INSTRUCTIONS:**
- For each criterion, return "Yes", "No", or "NA" (as a string)
- Use "NA" ONLY when the criterion is not applicable based on the query
- ONLY evaluate what is present in the data - do NOT make assumptions
- **Always consider item customizations available on the menu** (e.g., spice level, protein replacements, add-ons)
- C17, C18, C19 are ALWAYS enforced (never NA) - critical failures

**Structured Query:** {structured_query}
**(Original Fuzzy Query: {fuzzy_query})**

**Store Recommendation:**
{store_info}

**Menu Items:**
{menu_items}

**Store Reviews Summary:**
{reviews_summary}

Evaluate the following 19 criteria for the STRUCTURED query:

## MAIN DISH/CUISINE RELEVANCE

**C1** (Weight: 3): Does the restaurant clearly serve the dish or cuisine in the query?
- Pass: Restaurant clearly serves the dish/cuisine mentioned
- Fail: Does not serve the dish/cuisine
- NA: No specific dish/cuisine in query
- Examples:
  * Query "spicy pizza" → has Pizza = Yes
  * Query "cheap japanese" → serves Japanese food = Yes
  * Query "best restaurant" (no dish/cuisine) = NA

**C2** (Weight: 2): Is the dish or cuisine a primary focus of the store (does the store have 3+ items of the cuisine or main dish)?
- Pass: Store has 3+ items of the dish/cuisine
- Fail: Store has fewer than 3 items
- NA: No specific dish/cuisine in query
- Examples:
  * Query "spicy pizza" → has 5+ pizzas = Yes
  * Query "cheap japanese" → has 10+ Japanese dishes = Yes
  * Query "tacos" → only 2 taco items = No

**C3** (Weight: 2): Is the dish/cuisine mentioned as a primary offering in Mx profile?
- Pass: Dish/cuisine is listed as primary offering in merchant profile
- Fail: Not mentioned as primary offering
- NA: No specific dish/cuisine in query
- Examples:
  * Query "Best coffee near me" → Mx profile has primary offering as coffee = Yes
  * Query "burgers" → Mx profile says "American, Fast Food" with burgers featured = Yes
  * Query "sushi" → Mx profile is "Italian Restaurant" = No

## DIETARY RESTRICTIONS

**C4** (Weight: 3): Does the store have item(s) that include both the main dish / cuisine mentioned as well as with the mentioned dietary restrictions?
- For cuisine queries: there must be 2+ items that meet the dietary restriction
- Pass: Has required dish/cuisine WITH dietary restriction
- Fail: Missing dietary options
- NA: No dietary restriction in query
- Examples:
  * Query "gluten-free tacos" → has 1+ gluten-free taco = Yes
  * Query "vegan Thai" → has 3+ vegan Thai dishes = Yes
  * Query "cheap pizza" (no dietary) = NA

## RESTAURANT / STORE NAME

**C5** (Weight: 3): Does the store match the exact store in the query?
- Pass: Exact store name match
- Fail: Different store
- NA: No specific store name in query
- Examples:
  * Query "Chipotle near me" → store is Chipotle = Yes
  * Query "Starbucks coffee" → store is Peet's = No
  * Query "best burgers" (no store name) = NA

**C6** (Weight: 2): Is the store similar in cuisine or offerings as the store in the query?
- Pass: Similar cuisine/offerings to requested store
- Fail: Different cuisine/offerings
- NA: No store name in query OR exact match found (C5=Yes)
- Examples:
  * Query "Chipotle" not available → shows taqueria = Yes
  * Query "In-N-Out" → shows Five Guys (both burger joints) = Yes
  * Query "Chipotle" → shows sushi restaurant = No

## FLAVOR

**C7** (Weight: 2): Does the store have item(s) that include both the main dish / cuisine mentioned as well as the flavor mentioned?
- For cuisine queries: the store must offer 2+ dishes that meet both the cuisine and flavor
- Pass: Has dish/cuisine WITH flavor
- Fail: Missing flavor combination
- NA: No flavor mentioned in query
- Examples:
  * Query "Spicy pad thai" → 1+ pad thai that can be made spicy or is spicy = Yes
  * Query "Spicy Thai food" → 3+ spicy Thai dishes = Yes
  * Query "pad thai" (no flavor) = NA

## PREP STYLE REQUIREMENTS

**C8** (Weight: 1): Does the store have item(s) that include both the main dish / cuisine mentioned as well as the preparation style mentioned?
- For cuisine queries: the store must offer 2+ dishes that meet both the cuisine and preparation style criteria
- Pass: Has dish/cuisine WITH prep style
- Fail: Missing prep style combination
- NA: No prep style in query
- Examples:
  * Query "Grilled Salmon" → 1+ salmon dishes that are grilled = Yes
  * Query "Fried Mexican" → 3+ fried Mexican items = Yes
  * Query "salmon" (no prep style) = NA

## PORTION REQUIREMENTS

**C9** (Weight: 1): Do the store reviews mention large/generous portions?
- Pass: Reviews mention large/generous portions
- Fail: No mention of large portions in reviews
- NA: No portion size requirement in query
- Examples:
  * Query "large portions" → reviews say "huge servings" = Yes
  * Query "big meal" → reviews say "small plates" = No
  * Query "dinner" (no portion mention) = NA

## LARGE GROUP REQUIREMENTS

**C10** (Weight: 2): Does the Rx offer dishes that are available in platters, large quantities (e.g. family pack), or offer catering?
- Pass: Offers platters/family packs/catering
- Fail: No group-size options
- NA: No group requirement in query
- Examples:
  * Query "Friday dinner party for a group of friends" → Catering by Italian Pasta Kitchen = Yes
  * Query "party food" → Starbucks (no catering) = No
  * Query "dinner" (no group mention) = NA

## INGREDIENT REQUIREMENTS

**C11** (Weight: 3): Does the store have item(s) that include both the main dish / cuisine mentioned along with any specific ingredients mentioned?
- Pass: Has dish/cuisine WITH specific ingredient
- Fail: Missing ingredient
- NA: No specific ingredient in query
- Examples:
  * Query "chicken salad" → 1+ chicken salad = Yes
  * Query "bacon burger" → burger with bacon option = Yes
  * Query "salad" (no specific ingredient) = NA

## LOCATION REQUIREMENTS

**C12** (Weight: 2): Is the user within 2 miles of the location mentioned? (includes "Near me")
- Pass: Store within 2 miles of specified location
- Fail: Store more than 2 miles away
- NA: No location specified in query
- Store distance: {distance_miles} miles
- Examples:
  * Query "tacos in Tenderloin" → user location is within 2 miles of store = Yes
  * Query "pizza near me" → store 3 miles away = No
  * Query "best sushi" (no location) = NA

## SPEED REQUIREMENTS

**C13** (Weight: 2): For 'fast' or 'quick' queries, does the restaurant typically deliver in ≤39 minutes? For "< X mins" queries, does the restaurant deliver in X+5 mins?
- Pass: Meets speed requirement
- Fail: Does not meet speed requirement
- NA: No speed requirement in query
- Store ETA: {eta_minutes} minutes
- Examples:
  * Query "Quick Chinese" → ETA: 25 mins = Yes
  * Query "Pizza in 20 mins" → ETA: 35 mins = No (should be ≤25)
  * Query "best pizza" (no speed) = NA

## QUALITY REQUIREMENTS

**C14** (Weight: 2): Does the store or item have good ratings?
- For best/top-rated dish queries: does that dish have strong ratings (>=90%)? In case dish ratings are unavailable, use store ratings (4.7+ stars)?
- For cuisine queries: does the store have 4.7+ stars or a "favorite badge"?
- Pass: Meets quality requirement
- Fail: Below quality threshold
- NA: No quality requirement in query
- Store rating: {rating}
- Examples:
  * Query "best italian" → 4.7+ stars or "favorite badge" = Yes
  * Query "top-rated burgers" → 90%+ item rating or 4.7+ stars / favorite badge = Yes
  * Query "italian food" (no quality) = NA

## PRICE REQUIREMENTS

**C15** (Weight: 2): For general 'cheap' or 'affordable' queries, does the store indicate $ or $$ signs? Does the store or item(s) meet the specific price mentioned? For cuisine queries, the store must offer 2+ entrees under the specified price mentioned.
- Pass: Meets price requirement
- Fail: Does not meet price requirement
- NA: No price requirement in query
- Store price level: {price_level}
- Examples:
  * Query "cheap food" → $ or $$ signs = Yes
  * Query "spicy tacos under $15" → spicy taco under $15 = Yes
  * Query "Thai under $20" → 3+ thai dishes under $20 = Yes
  * Query "burgers" (no price) = NA

## DEALS REQUIREMENTS

**C16** (Weight: 2): Does the store have deals or promotions that meet the criteria of the query?
- Pass: Has relevant deals/promotions
- Fail: No relevant deals
- NA: No deals requirement in query
- Examples:
  * Query "BOGO burgers" → 1+ burger with Buy 1 Get 1 free = Yes
  * Query "Indian food with deals" → Rx with deals = Yes
  * Query "pizza" (no deals) = NA

## STORE OPEN CHECK (⚠️ CRITICAL IF DATA AVAILABLE)

**C17** (Weight: 3): Is the store open?
- Pass: Store is explicitly marked as open
- Fail: Store is explicitly marked as closed (CRITICAL FAILURE)
- **NA: If store open status is not available in the data (e.g., "Unknown", "N/A", or missing)**
- Store open status: {is_open}
- Examples:
  * Store status = "open" or "true" = Yes
  * Store status = "closed" or "false" = No (CRITICAL)
  * Store status = "Unknown" or "N/A" or missing = NA

## OVERALL STORE RATING CHECK (⚠️ ALWAYS ENFORCED - CRITICAL)

**C18** (Weight: 2): Does the restaurant have a rating > 4.5?
- **ALWAYS SCORED (never NA)** - Yes/No only
- Pass: Rating > 4.5
- Fail: Rating ≤ 4.5 (CRITICAL FAILURE)
- **NA: If no rating data is available (e.g., "N/A", "Unknown", null, or missing)**
- Store rating: {rating}
- Examples:
  * Store rating = 4.1 = No (CRITICAL)
  * Store rating = 4.7 = Yes
  * Store rating = "N/A" or null or missing = NA
  * Store rating = 0 (likely means no rating) = NA

## ALL MODIFIERS CHECK (⚠️ ALWAYS ENFORCED - CRITICAL)

**C19** (Weight: 3): Does the store contain at least one item that matches EVERY modifier and main dish / cuisine mentioned in the query?
- **ALWAYS SCORED (never NA)** - Yes/No only
- Pass: Has item matching ALL modifiers + dish/cuisine
- Fail: Missing one or more modifiers (CRITICAL FAILURE)
- Examples:
  * Query "cheap spicy burritos" → burrito that is spicy AND store has $/$ = Yes
  * Query "spicy grilled chicken near Embarcadero" → chicken that is both grilled and spicy, and store is <2 miles of Embarcadero = Yes
  * Query "cheap spicy pizza" → spicy pizza but store is $$$ = No (CRITICAL)

**CRITICAL FORMATTING:**
Return ONLY valid JSON with exact field names. Each answer must be a string: "Yes", "No", or "NA".
- C17 (store open): Use "NA" if open status is unknown/missing
- C18 (rating): Use "NA" if rating data is unavailable/null/0
- C19 (all modifiers): Always "Yes" or "No" (never NA)

{{
  "main_dish_cuisine": {{
    "c1_serves_dish_or_cuisine": "Yes/No/NA",
    "c2_primary_focus_3plus_items": "Yes/No/NA",
    "c3_primary_offering_in_profile": "Yes/No/NA"
  }},
  "dietary_restrictions": {{
    "c4_meets_dietary_with_dish": "Yes/No/NA"
  }},
  "store_name": {{
    "c5_exact_store_match": "Yes/No/NA",
    "c6_similar_store_cuisine": "Yes/No/NA"
  }},
  "flavor": {{
    "c7_has_dish_with_flavor": "Yes/No/NA"
  }},
  "prep_style": {{
    "c8_has_dish_with_prep_style": "Yes/No/NA"
  }},
  "portion": {{
    "c9_large_portions_in_reviews": "Yes/No/NA"
  }},
  "group": {{
    "c10_offers_large_quantities": "Yes/No/NA"
  }},
  "ingredients": {{
    "c11_has_dish_with_ingredients": "Yes/No/NA"
  }},
  "location": {{
    "c12_within_2_miles": "Yes/No/NA"
  }},
  "speed": {{
    "c13_meets_speed_requirement": "Yes/No/NA"
  }},
  "quality": {{
    "c14_good_ratings": "Yes/No/NA"
  }},
  "price": {{
    "c15_meets_price_requirement": "Yes/No/NA"
  }},
  "deals": {{
    "c16_has_relevant_deals": "Yes/No/NA"
  }},
  "store_open": {{
    "c17_is_store_open": "Yes/No/NA"
  }},
  "store_rating": {{
    "c18_rating_above_4_5": "Yes/No/NA"
  }},
  "all_modifiers": {{
    "c19_matches_all_modifiers": "Yes/No"
  }},
  "reasoning": {{
    "c1": "Brief explanation (2-3 sentences)",
    "c2": "Brief explanation (2-3 sentences)",
    "c3": "Brief explanation (2-3 sentences)",
    "c4": "Brief explanation (2-3 sentences)",
    "c5": "Brief explanation (2-3 sentences)",
    "c6": "Brief explanation (2-3 sentences)",
    "c7": "Brief explanation (2-3 sentences)",
    "c8": "Brief explanation (2-3 sentences)",
    "c9": "Brief explanation (2-3 sentences)",
    "c10": "Brief explanation (2-3 sentences)",
    "c11": "Brief explanation (2-3 sentences)",
    "c12": "Brief explanation (2-3 sentences)",
    "c13": "Brief explanation (2-3 sentences)",
    "c14": "Brief explanation (2-3 sentences)",
    "c15": "Brief explanation (2-3 sentences)",
    "c16": "Brief explanation (2-3 sentences)",
    "c17": "Brief explanation (2-3 sentences)",
    "c18": "Brief explanation (2-3 sentences)",
    "c19": "Brief explanation (2-3 sentences)"
  }}
}}
"""

# ============================================================================
# SCORING FUNCTIONS
# ============================================================================

def calculate_fuzzy_score(eval_result: Dict, q8_weight: int) -> Dict[str, Any]:
    """Calculate weighted score for fuzzy query evaluation."""
    weights = {
        "q1": 3, "q2": 2, "q3": 1, "q4": 1, "q5": 1,
        "q6": 1, "q7": 2, "q8": q8_weight, "q9": 2
    }

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

    total_weight = 0
    earned_weight = 0

    for q, answer in answers.items():
        if answer.upper() == "NA":
            continue
        total_weight += weights[q]
        if answer.upper() == "YES":
            earned_weight += weights[q]

    score_pct = (earned_weight / total_weight * 100) if total_weight > 0 else 0

    # Intent match score for irrelevance
    intent_match_weight = 0
    intent_match_earned = 0
    for q in ["q1", "q2"]:
        if answers[q].upper() != "NA":
            intent_match_weight += weights[q]
            if answers[q].upper() == "YES":
                intent_match_earned += weights[q]

    intent_match_score = (intent_match_earned / intent_match_weight * 100) if intent_match_weight > 0 else 0
    is_relevant = intent_match_score > 0

    return {
        "score_pct": round(score_pct, 2),
        "earned_weight": earned_weight,
        "total_weight": total_weight,
        "intent_match_score": round(intent_match_score, 2),
        "is_relevant": is_relevant,
        "answers": answers
    }


def calculate_structured_score(eval_result: Dict) -> Dict[str, Any]:
    """Calculate weighted score for structured query evaluation."""
    weights = {
        "c1": 3, "c2": 2, "c3": 2, "c4": 3, "c5": 3, "c6": 2,
        "c7": 2, "c8": 1, "c9": 1, "c10": 2, "c11": 3, "c12": 2,
        "c13": 2, "c14": 2, "c15": 2, "c16": 2, "c17": 3, "c18": 2, "c19": 3
    }

    answers = {
        "c1": eval_result["main_dish_cuisine"]["c1_serves_dish_or_cuisine"],
        "c2": eval_result["main_dish_cuisine"]["c2_primary_focus_3plus_items"],
        "c3": eval_result["main_dish_cuisine"]["c3_primary_offering_in_profile"],
        "c4": eval_result["dietary_restrictions"]["c4_meets_dietary_with_dish"],
        "c5": eval_result["store_name"]["c5_exact_store_match"],
        "c6": eval_result["store_name"]["c6_similar_store_cuisine"],
        "c7": eval_result["flavor"]["c7_has_dish_with_flavor"],
        "c8": eval_result["prep_style"]["c8_has_dish_with_prep_style"],
        "c9": eval_result["portion"]["c9_large_portions_in_reviews"],
        "c10": eval_result["group"]["c10_offers_large_quantities"],
        "c11": eval_result["ingredients"]["c11_has_dish_with_ingredients"],
        "c12": eval_result["location"]["c12_within_2_miles"],
        "c13": eval_result["speed"]["c13_meets_speed_requirement"],
        "c14": eval_result["quality"]["c14_good_ratings"],
        "c15": eval_result["price"]["c15_meets_price_requirement"],
        "c16": eval_result["deals"]["c16_has_relevant_deals"],
        "c17": eval_result["store_open"]["c17_is_store_open"],
        "c18": eval_result["store_rating"]["c18_rating_above_4_5"],
        "c19": eval_result["all_modifiers"]["c19_matches_all_modifiers"]
    }

    total_weight = 0
    earned_weight = 0

    for c, answer in answers.items():
        if answer.upper() == "NA":
            continue
        total_weight += weights[c]
        if answer.upper() == "YES":
            earned_weight += weights[c]

    score_pct = (earned_weight / total_weight * 100) if total_weight > 0 else 0

    # Critical failures (only enforced when data is available)
    critical_failures = []
    # C17: Store open check - COMMENTED OUT (data not available in traces)
    # if answers["c17"].upper() == "NO":
    #     critical_failures.append("Store is closed")

    # C18: Rating check - COMMENTED OUT (keeping as NA for now)
    # if answers["c18"].upper() == "NO":
    #     critical_failures.append("Rating ≤ 4.5")

    # C19: All modifiers - COMMENTED OUT (keeping as NA for now)
    # if answers["c19"].upper() == "NO":
    #     critical_failures.append("Missing modifiers")

    return {
        "score_pct": round(score_pct, 2),
        "earned_weight": earned_weight,
        "total_weight": total_weight,
        "critical_failures": critical_failures,
        "answers": answers
    }


# ============================================================================
# EVALUATION FUNCTIONS
# ============================================================================

async def classify_fuzzy_intent(query: str, semaphore: asyncio.Semaphore) -> Dict[str, Any]:
    """Classify intent category of fuzzy query."""
    async with semaphore:
        try:
            response = await client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": "You are an expert at classifying food query intents. Respond ONLY with valid JSON."},
                    {"role": "user", "content": FUZZY_INTENT_CLASSIFICATION_PROMPT.format(query=query)}
                ],
                response_format={"type": "json_object"},
                temperature=0
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"Error classifying intent for '{query}': {e}")
            return {"intent_category": "Generic / Vague / Underspecified", "q8_weight": 2}


async def evaluate_fuzzy_store(
    fuzzy_query: str,
    structured_query: str,
    customer_profile: Dict,
    store: Dict,
    q8_weight: int,
    semaphore: asyncio.Semaphore
) -> Dict[str, Any]:
    """Evaluate store for fuzzy query (Phase 1)."""
    async with semaphore:
        try:
            store_info = extract_store_info(store)
            menu_items = extract_menu_items(store)

            prompt = FUZZY_QUERY_EVALUATION_PROMPT.format(
                fuzzy_query=fuzzy_query,
                structured_query=structured_query,
                customer_profile=json.dumps(customer_profile, indent=2),
                store_info=json.dumps(store_info, indent=2),
                menu_items=json.dumps(menu_items, indent=2),
                distance_miles=store_info.get("distance_miles", "N/A"),
                eta_minutes=store_info.get("eta_minutes", "N/A"),
                rating=store_info.get("rating", "N/A"),
                price_level=store_info.get("price_level", "N/A"),
                q8_weight=q8_weight
            )

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
            scores = calculate_fuzzy_score(eval_result, q8_weight)

            return {
                "store_id": store.get("business_id", ""),
                "evaluation": eval_result,
                **scores
            }

        except Exception as e:
            print(f"Error evaluating fuzzy store {store.get('business_id', '')}: {e}")
            return {"store_id": store.get("business_id", ""), "error": str(e)}


async def evaluate_structured_store(
    structured_query: str,
    fuzzy_query: str,
    store: Dict,
    semaphore: asyncio.Semaphore
) -> Dict[str, Any]:
    """Evaluate store for structured query (Phase 2)."""
    async with semaphore:
        try:
            store_info = extract_store_info(store)
            menu_items = extract_menu_items(store)
            reviews_summary = store.get("reviews_summary", "No reviews available")

            # Handle is_open field - default to Unknown if not present
            is_open_status = store.get("is_open")
            if is_open_status is None or is_open_status == "":
                is_open_status = "Unknown"

            prompt = STRUCTURED_QUERY_EVALUATION_PROMPT.format(
                structured_query=structured_query,
                fuzzy_query=fuzzy_query,
                store_info=json.dumps(store_info, indent=2),
                menu_items=json.dumps(menu_items, indent=2),
                reviews_summary=reviews_summary,
                distance_miles=store_info.get("distance_miles", "N/A"),
                eta_minutes=store_info.get("eta_minutes", "N/A"),
                rating=store_info.get("rating", "N/A"),
                price_level=store_info.get("price_level", "N/A"),
                is_open=is_open_status
            )

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
            scores = calculate_structured_score(eval_result)

            return {
                "store_id": store.get("business_id", ""),
                "evaluation": eval_result,
                **scores
            }

        except Exception as e:
            print(f"Error evaluating structured store {store.get('business_id', '')}: {e}")
            return {"store_id": store.get("business_id", ""), "error": str(e)}


def extract_store_info(store: Dict) -> Dict:
    """Extract store information."""
    return {
        "business_id": store.get("business_id", ""),
        "name": store.get("name", store.get("business_id", "")),
        "address": store.get("address", ""),
        "cuisine": store.get("cuisine", ""),
        "dietary_options": store.get("dietary_options", ""),
        "distance_miles": store.get("distance_miles", "N/A"),
        "eta_minutes": store.get("eta_minutes", "N/A"),
        "rating": store.get("rating", "N/A"),
        "price_level": store.get("price_level", "N/A"),
        "is_open": store.get("is_open", "Unknown")
    }


def extract_menu_items(store: Dict) -> List[Dict]:
    """Extract menu items with names and tags."""
    menu_items = []
    for item in store.get("menu_items", [])[:10]:
        item_info = {"item_id": item.get("item_id", ""), "name": "", "tags": ""}

        if "profile" in item:
            try:
                profile = json.loads(item["profile"]) if isinstance(item["profile"], str) else item["profile"]
                item_info["name"] = profile.get("identity", {}).get("name", "")
            except:
                pass

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

    return menu_items


async def evaluate_trace_two_pronged(
    trace: Dict,
    customer_profile: Dict,
    semaphore: asyncio.Semaphore
) -> Dict[str, Any]:
    """Evaluate trace using two-pronged approach with parallelized store evaluations."""
    fuzzy_query = trace.get("original_query", "")
    rewritten_queries = trace.get("rewritten_queries", [])
    structured_query = rewritten_queries[0].get("rewritten_query", fuzzy_query) if rewritten_queries else fuzzy_query

    # Classify fuzzy intent
    intent_info = await classify_fuzzy_intent(fuzzy_query, semaphore)
    q8_weight = intent_info.get("q8_weight", 2)

    # Collect all stores to evaluate
    all_stores = []
    for carousel in trace.get("store_recommendations", []):
        for store in carousel.get("stores", []):
            all_stores.append(store)

    # Parallelize store evaluations (both fuzzy and structured for each store)
    async def evaluate_single_store(store: Dict) -> Dict[str, Any]:
        """Evaluate a single store with both fuzzy and structured approaches in parallel."""
        # Run fuzzy and structured evaluations in parallel
        fuzzy_task = evaluate_fuzzy_store(
            fuzzy_query, structured_query, customer_profile,
            store, q8_weight, semaphore
        )
        structured_task = evaluate_structured_store(
            structured_query, fuzzy_query, store, semaphore
        )

        fuzzy_eval, structured_eval = await asyncio.gather(fuzzy_task, structured_task)

        return {
            "store_id": store.get("business_id", ""),
            "fuzzy_evaluation": fuzzy_eval,
            "structured_evaluation": structured_eval,
            "combined_score": round((fuzzy_eval.get("score_pct", 0) + structured_eval.get("score_pct", 0)) / 2, 2)
        }

    # Evaluate all stores in parallel
    store_results = await asyncio.gather(*[evaluate_single_store(store) for store in all_stores])

    if not store_results:
        return {
            "trace_id": trace.get("trace_id", ""),
            "fuzzy_query": fuzzy_query,
            "structured_query": structured_query,
            "intent_category": intent_info.get("intent_category", ""),
            "q8_weight": q8_weight,
            "error": "No store recommendations found"
        }

    # Calculate aggregates
    valid_results = [r for r in store_results if "error" not in r.get("fuzzy_evaluation", {}) and "error" not in r.get("structured_evaluation", {})]

    if not valid_results:
        return {
            "trace_id": trace.get("trace_id", ""),
            "fuzzy_query": fuzzy_query,
            "structured_query": structured_query,
            "intent_category": intent_info.get("intent_category", ""),
            "q8_weight": q8_weight,
            "store_evaluations": store_results,
            "error": "All store evaluations failed"
        }

    # Calculate NDCG
    import numpy as np
    fuzzy_scores = [r["fuzzy_evaluation"]["score_pct"] for r in valid_results]
    structured_scores = [r["structured_evaluation"]["score_pct"] for r in valid_results]
    combined_scores = [r["combined_score"] for r in valid_results]

    dcg_fuzzy = sum(s / 100 / np.log2(i + 2) for i, s in enumerate(fuzzy_scores))
    dcg_structured = sum(s / 100 / np.log2(i + 2) for i, s in enumerate(structured_scores))
    dcg_combined = sum(s / 100 / np.log2(i + 2) for i, s in enumerate(combined_scores))

    ideal_fuzzy = sorted(fuzzy_scores, reverse=True)
    ideal_structured = sorted(structured_scores, reverse=True)
    ideal_combined = sorted(combined_scores, reverse=True)

    idcg_fuzzy = sum(s / 100 / np.log2(i + 2) for i, s in enumerate(ideal_fuzzy)) or 1
    idcg_structured = sum(s / 100 / np.log2(i + 2) for i, s in enumerate(ideal_structured)) or 1
    idcg_combined = sum(s / 100 / np.log2(i + 2) for i, s in enumerate(ideal_combined)) or 1

    return {
        "trace_id": trace.get("trace_id", ""),
        "fuzzy_query": fuzzy_query,
        "structured_query": structured_query,
        "intent_category": intent_info.get("intent_category", ""),
        "q8_weight": q8_weight,
        "num_stores_evaluated": len(valid_results),
        "avg_fuzzy_score": round(sum(fuzzy_scores) / len(fuzzy_scores), 2),
        "avg_structured_score": round(sum(structured_scores) / len(structured_scores), 2),
        "avg_combined_score": round(sum(combined_scores) / len(combined_scores), 2),
        "ndcg_fuzzy": round(dcg_fuzzy / idcg_fuzzy, 4),
        "ndcg_structured": round(dcg_structured / idcg_structured, 4),
        "ndcg_combined": round(dcg_combined / idcg_combined, 4),
        "store_evaluations": store_results
    }


async def evaluate_conversation_two_pronged(
    conversation_id: str,
    conversation_data: Dict,
    semaphore: asyncio.Semaphore
) -> Dict[str, Any]:
    """Evaluate conversation using two-pronged approach."""
    customer_profile = conversation_data.get("consumer_profile", {})

    if "profile" in customer_profile and isinstance(customer_profile["profile"], str):
        try:
            customer_profile["parsed_profile"] = json.loads(customer_profile["profile"])
        except:
            pass

    traces = conversation_data.get("traces", [])
    trace_results = []

    for trace in traces:
        result = await evaluate_trace_two_pronged(trace, customer_profile, semaphore)
        trace_results.append(result)

    valid_traces = [t for t in trace_results if "error" not in t or "store_evaluations" in t]

    if not valid_traces:
        return {
            "conversation_id": conversation_id,
            "num_traces": len(traces),
            "error": "No valid traces to evaluate"
        }

    avg_fuzzy = sum(t.get("avg_fuzzy_score", 0) for t in valid_traces) / len(valid_traces)
    avg_structured = sum(t.get("avg_structured_score", 0) for t in valid_traces) / len(valid_traces)
    avg_combined = sum(t.get("avg_combined_score", 0) for t in valid_traces) / len(valid_traces)
    avg_ndcg_fuzzy = sum(t.get("ndcg_fuzzy", 0) for t in valid_traces) / len(valid_traces)
    avg_ndcg_structured = sum(t.get("ndcg_structured", 0) for t in valid_traces) / len(valid_traces)
    avg_ndcg_combined = sum(t.get("ndcg_combined", 0) for t in valid_traces) / len(valid_traces)

    return {
        "conversation_id": conversation_id,
        "num_traces": len(traces),
        "avg_fuzzy_score": round(avg_fuzzy, 2),
        "avg_structured_score": round(avg_structured, 2),
        "avg_combined_score": round(avg_combined, 2),
        "avg_ndcg_fuzzy": round(avg_ndcg_fuzzy, 4),
        "avg_ndcg_structured": round(avg_ndcg_structured, 4),
        "avg_ndcg_combined": round(avg_ndcg_combined, 4),
        "trace_evaluations": trace_results
    }


# ============================================================================
# MAIN
# ============================================================================

async def main():
    parser = argparse.ArgumentParser(description="Two-Pronged E2E Evaluation")
    parser.add_argument("--input", required=True, help="Path to CSV file with traces")
    parser.add_argument("--output", required=True, help="Path to output evaluation JSON file")
    parser.add_argument("--parallel", type=int, default=100, help="Maximum parallel API calls")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of conversations")

    args = parser.parse_args()

    global np
    import numpy as np

    print(f"Loading traces from {args.input}...")
    df = pd.read_csv(args.input)

    if args.limit:
        df = df.head(args.limit)

    print(f"Loaded {len(df)} conversations\n")

    semaphore = asyncio.Semaphore(args.parallel)

    print(f"Evaluating conversations with two-pronged approach (max {args.parallel} parallel)...")

    tasks = []
    for idx, row in df.iterrows():
        conversation_id = row["CONVERSATION_ID"]
        conversation_data = json.loads(row["CONVERSATION_JSON"])
        task = evaluate_conversation_two_pronged(conversation_id, conversation_data, semaphore)
        tasks.append(task)

    results = await tqdm_asyncio.gather(*tasks, desc="Evaluating")

    valid_results = [r for r in results if "error" not in r]

    if valid_results:
        avg_fuzzy = sum(r["avg_fuzzy_score"] for r in valid_results) / len(valid_results)
        avg_structured = sum(r["avg_structured_score"] for r in valid_results) / len(valid_results)
        avg_combined = sum(r["avg_combined_score"] for r in valid_results) / len(valid_results)
        avg_ndcg_fuzzy = sum(r["avg_ndcg_fuzzy"] for r in valid_results) / len(valid_results)
        avg_ndcg_structured = sum(r["avg_ndcg_structured"] for r in valid_results) / len(valid_results)
        avg_ndcg_combined = sum(r["avg_ndcg_combined"] for r in valid_results) / len(valid_results)

        print(f"\n{'='*70}")
        print(f"TWO-PRONGED E2E EVALUATION SUMMARY")
        print(f"{'='*70}")
        print(f"Total Conversations: {len(results)}")
        print(f"Valid Evaluations: {len(valid_results)}")
        print(f"\nPhase 1 - Fuzzy Query Metrics:")
        print(f"  Avg Fuzzy Score: {avg_fuzzy:.2f}%")
        print(f"  Avg NDCG (Fuzzy): {avg_ndcg_fuzzy:.4f}")
        print(f"\nPhase 2 - Structured Query Metrics:")
        print(f"  Avg Structured Score: {avg_structured:.2f}%")
        print(f"  Avg NDCG (Structured): {avg_ndcg_structured:.4f}")
        print(f"\nCombined Metrics:")
        print(f"  Avg Combined Score: {avg_combined:.2f}%")
        print(f"  Avg NDCG (Combined): {avg_ndcg_combined:.4f}")
        print(f"{'='*70}\n")

    print(f"Saving results to {args.output}...")
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    output_data = {
        "metadata": {
            "input_file": args.input,
            "num_conversations": len(results),
            "num_valid": len(valid_results),
            "evaluation_type": "two_pronged",
            "avg_fuzzy_score": round(avg_fuzzy, 2) if valid_results else 0,
            "avg_structured_score": round(avg_structured, 2) if valid_results else 0,
            "avg_combined_score": round(avg_combined, 2) if valid_results else 0,
            "avg_ndcg_fuzzy": round(avg_ndcg_fuzzy, 4) if valid_results else 0,
            "avg_ndcg_structured": round(avg_ndcg_structured, 4) if valid_results else 0,
            "avg_ndcg_combined": round(avg_ndcg_combined, 4) if valid_results else 0
        },
        "results": results
    }

    with open(output_path, 'w') as f:
        json.dump(output_data, f, indent=2)

    print(f"Done! Results saved to {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
