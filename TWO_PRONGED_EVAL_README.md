# Two-Pronged E2E Evaluation System

## Overview

Comprehensive evaluation system implementing both Fuzzy Query and Structured Query rubrics for restaurant recommendation assessment.

## Evaluation Approach

### Phase 1: Fuzzy Query → Store Evaluation
Evaluates how well stores match the **original fuzzy query** (e.g., "cozy meal", "spicy and cheesy")

**9 Questions (Q1-Q9):**
- **Intent Match** (Q1-Q2): Does the store match the fuzzy query intent?
- **Constraints** (Q3-Q7): Price, location, speed, quality, dietary requirements
- **Personalization** (Q8-Q9): Customer preferences and hard avoids

**Scoring:**
- Weighted sum (Q1=3, Q2=2, Q3-Q6=1, Q7=2, Q8=1-3 dynamic, Q9=2)
- Dynamic Q8 weight based on intent category (Comfort/Craving=3, Flavor=2, Exploration=1, etc.)
- NA answers excluded from total weight

### Phase 2: Structured Query → Store Evaluation
Evaluates how well stores match the **rewritten structured query** (e.g., "buffalo wings", "pad thai")

**19 Criteria (C1-C19):**
- **Main Dish/Cuisine** (C1-C3): Does store serve the dish/cuisine as primary offering?
- **Dietary** (C4): Items with dish + dietary restrictions
- **Store Name** (C5-C6): Exact match or similar
- **Flavor** (C7): Dish + flavor combination
- **Prep Style** (C8): Dish + preparation style
- **Portion** (C9): Large portions in reviews
- **Groups** (C10): Platters, catering, family packs
- **Ingredients** (C11): Specific ingredients present
- **Location** (C12): Within 2 miles
- **Speed** (C13): Meets delivery time requirements
- **Quality** (C14): Rating ≥4.7 or favorite badge
- **Price** (C15): Meets price requirements
- **Deals** (C16): Relevant promotions
- **Store Open** (C17): ⚠️ Always enforced
- **Rating Check** (C18): ⚠️ Rating >4.5 always enforced
- **All Modifiers** (C19): ⚠️ All modifiers present - always enforced

**Scoring:**
- Weighted sum (see criteria weights above)
- Critical failures tracked separately (C17, C18, C19 must pass)

### Combined Evaluation
- **Combined Score** = Average of Fuzzy Score + Structured Score
- **NDCG Calculation**: Position-weighted ranking metric for all three scores
- Separate metrics for fuzzy, structured, and combined approaches

## Usage

### Setup
```bash
# Install dependencies
pip install pandas openai python-dotenv tqdm numpy

# Set API key
export OPENAI_API_KEY="your-key-here"
```

### Run Evaluation

**Test on 2 conversations:**
```bash
python3 two_pronged_eval.py \
  --input "VOX__Metis_100_FullTraces.csv" \
  --output "two_pronged_eval_results.json" \
  --parallel 5 \
  --limit 2
```

**Full evaluation on all 100 conversations:**
```bash
python3 two_pronged_eval.py \
  --input "VOX__Metis_100_FullTraces.csv" \
  --output "two_pronged_eval_results.json" \
  --parallel 10
```

### Parameters
- `--input`: Path to trace CSV file
- `--output`: Path for output JSON results
- `--parallel`: Max parallel API calls (default: 10)
- `--limit`: Limit number of conversations for testing (optional)

## Output Format

```json
{
  "metadata": {
    "evaluation_type": "two_pronged",
    "num_conversations": 100,
    "num_valid": 100,
    "avg_fuzzy_score": 78.19,
    "avg_structured_score": 82.45,
    "avg_combined_score": 80.32,
    "avg_ndcg_fuzzy": 0.9724,
    "avg_ndcg_structured": 0.9801,
    "avg_ndcg_combined": 0.9763
  },
  "results": [
    {
      "conversation_id": "conv_123",
      "num_traces": 1,
      "avg_fuzzy_score": 85.5,
      "avg_structured_score": 90.2,
      "avg_combined_score": 87.85,
      "trace_evaluations": [
        {
          "trace_id": "trace_456",
          "fuzzy_query": "cozy meal",
          "structured_query": "ramen",
          "intent_category": "Comfort / Craving / Emotional",
          "q8_weight": 3,
          "store_evaluations": [
            {
              "store_id": "store_789",
              "fuzzy_evaluation": {
                "evaluation": { /* Q1-Q9 answers */ },
                "score_pct": 85.5,
                "intent_match_score": 100.0,
                "is_relevant": true
              },
              "structured_evaluation": {
                "evaluation": { /* C1-C19 answers */ },
                "score_pct": 90.2,
                "critical_failures": []
              },
              "combined_score": 87.85
            }
          ]
        }
      ]
    }
  ]
}
```

## Key Differences from Original fuzzy_query_eval.py

1. **Two-phase evaluation**: Separate fuzzy and structured assessments
2. **19 structured criteria** vs 9 fuzzy questions
3. **Critical failure detection**: Tracks stores that fail must-pass checks (open, rating, modifiers)
4. **Combined scoring**: Averages both approaches for comprehensive view
5. **Richer output**: Includes both evaluation types per store

## Results Viewer Integration

The results viewer needs updates to display:
- Separate tabs/views for Fuzzy vs Structured vs Combined results
- Critical failure indicators (⚠️ Closed, Low Rating, Missing Modifiers)
- Intent category classification
- Detailed Q1-Q9 and C1-C19 breakdowns
- NDCG metrics for all three scoring approaches

## Next Steps

1. ✅ Two-pronged evaluation script created
2. ⏳ Test with API key on sample data
3. ⏳ Update results viewer UI for two-pronged display
4. ⏳ Run full evaluation on 100 conversations
5. ⏳ Deploy updated system to Vercel
