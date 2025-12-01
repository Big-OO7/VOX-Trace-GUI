# Fuzzy Query Grader

Standalone fuzzy query grading implementation based on `evaluate_from_csv_v2.py` with fuzzy string matching capabilities.

## Overview

This tool evaluates `<query, recommendation>` pairs using:
1. **Fuzzy string matching** with `rapidfuzz` for text normalization and similarity scoring
2. **LLM-as-Judge evaluation** with the 17-check rubric from evaluate_from_csv_v2.py
3. **Score verification** to ensure LLM calculations are correct
4. **JSONL output** with complete provenance and metadata

## Features

### 17-Check Rubric (from evaluate_from_csv_v2.py)
- **11 Relevance & Format checks** (20 points, normalized to 0-10)
  - Primary intent match (+3 pts)
  - Descriptive traits preserved (+2 pts)
  - Category/dietary label match (+2 pts)
  - Situational suitability (+2 pts)
  - Explicit constraints met (+2 pts)
  - Profile dietary compliant (+1 pt) - **GATE CHECK**
  - Output clarity (+2 pts)
  - Mainstream availability (+2 pts)
  - Format correctness (+2 pts)
  - No redundant info (+1 pt)
  - No vague/filler words (+1 pt)

- **6 Serendipity checks** (10 points)
  - Cuisine & dish novelty (0-5 pts, tiered)
  - Low discoverability (+1 pt)
  - Familiar ingredients in new context (+1 pt)
  - Context fit while novel (+1 pt)
  - "Aha moment" (+1 pt)
  - Creates curiosity (+1 pt)

- **Weighted scoring**: `(Relevance × 0.7) + (Serendipity × 0.3)`

### Fuzzy Matching
- Text normalization: lowercase, punctuation removal, stopword filtering
- Similarity metrics:
  - `query_to_rec`: Similarity between query and recommendation
  - `rec_to_top_item`: Max similarity to top-20 items (if available)
  - `max_item_similarity`: Overall max item similarity
- Configurable threshold to filter low-similarity pairs
- Uses `rapidfuzz` with `token_sort_ratio` for robust matching

## Installation

### Dependencies

```bash
pip install rapidfuzz google-generativeai openai
```

### API Keys

Set your API key as an environment variable:

```bash
# For Gemini models
export GOOGLE_API_KEY="your-api-key"
# OR
export GEMINI_API_KEY="your-api-key"

# For OpenAI models
export OPENAI_API_KEY="your-api-key"
```

## Usage

### Basic Usage

```bash
python grade_fuzzy_queries.py \
    --input VOX__Metis_100_FullTraces.csv \
    --output fuzzy_grades.jsonl \
    --judge-model gemini-2.0-flash-exp
```

### With Custom Parameters

```bash
python grade_fuzzy_queries.py \
    --input VOX__Metis_100_FullTraces.csv \
    --output fuzzy_grades.jsonl \
    --judge-model gemini-2.0-flash-exp \
    --fuzzy-threshold 0.7 \
    --parallel-limit 20 \
    --temperature 0.0 \
    --log-file grading.log
```

### Test with Dry Run (No API Calls)

```bash
python grade_fuzzy_queries.py \
    --input VOX__Metis_100_FullTraces.csv \
    --output test_fuzzy.jsonl \
    --judge-model gemini-2.0-flash-exp \
    --limit 10 \
    --dry-run \
    --fuzzy-threshold 0.5
```

### Filter to Single Consumer

```bash
python grade_fuzzy_queries.py \
    --input VOX__Metis_100_FullTraces.csv \
    --output consumer_123_grades.jsonl \
    --judge-model gemini-2.0-flash-exp \
    --consumer-id "2940133"
```

### Validate Output After Writing

```bash
python grade_fuzzy_queries.py \
    --input VOX__Metis_100_FullTraces.csv \
    --output fuzzy_grades.jsonl \
    --judge-model gemini-2.0-flash-exp \
    --validate-output
```

## Command-Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--input` | Input CSV file (required) | - |
| `--output` | Output JSONL file (required) | - |
| `--judge-model` | Judge model name (required) | - |
| `--consumer-id` | Filter to single consumer ID | None |
| `--batch-size` | Batch size for processing | 100 |
| `--log-file` | Log file path | None (stdout) |
| `--fuzzy-threshold` | Fuzzy match threshold (0.0-1.0) | 0.7 |
| `--parallel-limit` | Concurrency limit | 10 |
| `--temperature` | LLM temperature | 0.0 |
| `--limit` | Limit number of tasks (testing) | None |
| `--dry-run` | Skip judge calls (fuzzy matching only) | False |
| `--validate-output` | Validate JSONL after writing | False |

## Supported Models

### Gemini (Recommended)
- `gemini-2.0-flash-exp` (fast, cost-effective)
- `gemini-2.5-pro` (high quality)
- `gemini-2.5-flash` (balanced)

### OpenAI
- `gpt-4o-mini` (cost-effective)
- `gpt-4o` (high quality)
- `o1-preview` (reasoning)

**Note**: Gemini models support structured JSON output natively, which is more reliable than OpenAI's JSON mode.

## Input Format

CSV file with columns:
- `CONVERSATION_ID`: Conversation identifier
- `TRACE_COUNT`: Number of traces
- `CONVERSATION_JSON`: JSON payload with traces

Example `CONVERSATION_JSON` structure:

```json
{
  "ids": {
    "consumer_id": "2940133"
  },
  "consumer_profile": {
    "overall_profile": {
      "cuisine_preferences": "American, Italian, Chinese",
      "food_preferences": "pizza, burgers, chicken",
      "taste_preference": "savory",
      "dietary_restrictions": "none"
    }
  },
  "traces": [
    {
      "original_query": "Buffalo wings",
      "rewritten_queries": [
        {
          "rewritten_query": "spicy buffalo chicken wings"
        }
      ]
    }
  ]
}
```

## Output Format

JSONL file where each line is a JSON object with the following structure:

```json
{
  "conversation_id": "conv_0894dea5",
  "raw_row_index": 0,
  "consumer_id": "2940133",
  "rewrite_id": "trace_0_rewrite_0",
  "query": "Buffalo wings",
  "normalized_query": "buffalo wings",
  "daypart": "weekday_lunch",
  "recommendation_original": "spicy buffalo chicken wings",
  "recommendation_normalized": "spicy buffalo chicken wings",
  "fuzzy_scores": {
    "query_to_rec": 0.87,
    "rec_to_top_item": 0.0,
    "max_item_similarity": 0.0
  },
  "fuzzy_passed": true,
  "judge_model": "gemini-2.0-flash-exp",
  "judge_result": {
    "recommendation": "spicy buffalo chicken wings",
    "relevance_format_score": 8.5,
    "serendipity_score": 4.0,
    "weighted_score": 7.15,
    "relevance_checks": { ... },
    "serendipity_checks": { ... },
    "relevance_format_reasoning": "...",
    "serendipity_reasoning": "...",
    "overall_reasoning": "..."
  },
  "verified_scores": {
    "relevance_format": 8.5,
    "serendipity": 4.0,
    "weighted": 7.15
  },
  "elapsed_ms": 1234.56,
  "status": "success",
  "error": null,
  "provenance": {}
}
```

### Status Values
- `success`: Judge evaluation completed successfully
- `error`: Error during judge evaluation
- `skipped`: Fuzzy threshold not met
- `dry_run`: Dry run mode (no judge call)

## Example Workflow

### 1. Test Fuzzy Matching (No API Calls)

```bash
# Test with 10 tasks to see fuzzy scores without API costs
python grade_fuzzy_queries.py \
  --input VOX__Metis_100_FullTraces.csv \
  --output test_fuzzy.jsonl \
  --judge-model gemini-2.0-flash-exp \
  --limit 10 \
  --dry-run \
  --fuzzy-threshold 0.6

# Check fuzzy scores
cat test_fuzzy.jsonl | jq '.fuzzy_scores'
```

### 2. Run Small Evaluation

```bash
# Evaluate 5 high-similarity pairs
python grade_fuzzy_queries.py \
  --input VOX__Metis_100_FullTraces.csv \
  --output small_eval.jsonl \
  --judge-model gemini-2.0-flash-exp \
  --limit 5 \
  --fuzzy-threshold 0.8 \
  --parallel-limit 5

# Check results
cat small_eval.jsonl | jq '{query, rec: .recommendation_original, fuzzy: .fuzzy_scores.query_to_rec, score: .verified_scores.weighted}'
```

### 3. Full Production Run

```bash
# Run full evaluation with logging
export GOOGLE_API_KEY="your-key"

python grade_fuzzy_queries.py \
  --input VOX__Metis_100_FullTraces.csv \
  --output VOX_Metis_100_fuzzy_grades.jsonl \
  --judge-model gemini-2.0-flash-exp \
  --fuzzy-threshold 0.7 \
  --parallel-limit 20 \
  --log-file fuzzy_grading.log \
  --validate-output

# Analyze results
cat VOX_Metis_100_fuzzy_grades.jsonl | jq -s '
  {
    total: length,
    success: map(select(.status == "success")) | length,
    skipped: map(select(.status == "skipped")) | length,
    avg_weighted_score: (map(select(.status == "success") | .verified_scores.weighted) | add / length)
  }
'
```

### 4. Filter and Analyze

```bash
# Find high-scoring recommendations
cat VOX_Metis_100_fuzzy_grades.jsonl | jq 'select(.verified_scores.weighted >= 8.0) | {query, rec: .recommendation_original, score: .verified_scores.weighted}'

# Find low fuzzy scores that passed threshold
cat VOX_Metis_100_fuzzy_grades.jsonl | jq 'select(.fuzzy_scores.query_to_rec < 0.5) | {query, rec: .recommendation_original, fuzzy: .fuzzy_scores.query_to_rec}'

# Check gate violations
cat VOX_Metis_100_fuzzy_grades.jsonl | jq 'select(.judge_result.relevance_checks.check_6_profile_dietary_gate.is_gate_violation == true)'
```

## Key Differences from evaluate_from_csv_v2.py

1. **Standalone**: No dependencies on internal modules (profile_loader, test_serendipity_rewrite)
2. **Fuzzy matching**: Pre-filters query-recommendation pairs based on text similarity
3. **JSONL output**: One line per result instead of CSV
4. **Per-recommendation grading**: Evaluates each rewrite independently
5. **Simplified profile handling**: Extracts profile from CONVERSATION_JSON
6. **Both Gemini and OpenAI**: Supports multiple LLM providers

## Troubleshooting

### Import Error: rapidfuzz not installed

```bash
pip install rapidfuzz
```

### CSV Field Size Error

Already handled in code with `csv.field_size_limit(sys.maxsize)`.

### API Key Not Found

```bash
# Check if key is set
echo $GOOGLE_API_KEY

# Set key
export GOOGLE_API_KEY="your-key"
```

### Empty Response from API

- Check API quota/limits
- Try reducing `--parallel-limit`
- Check model name is correct

### High Skipped Rate

- Lower `--fuzzy-threshold` (e.g., from 0.7 to 0.5)
- Check query and recommendation text quality

## Performance Tips

1. **Use Gemini Flash** for cost-effective evaluation: `gemini-2.0-flash-exp`
2. **Adjust parallelism** based on API limits: `--parallel-limit 20`
3. **Filter with fuzzy threshold** to reduce API calls: `--fuzzy-threshold 0.7`
4. **Test with --dry-run** first to see fuzzy scores
5. **Use --limit** for quick tests before full run

## Related Files

- `evaluate_from_csv_v2.py` - Original evaluation implementation
- `GRADING_PIPELINE_README.md` - Documentation for structured query grading
- `grade_traces.py` - Previous grading pipeline

---

**Generated**: 2025-11-24
**Based on**: `evaluate_from_csv_v2.py`
