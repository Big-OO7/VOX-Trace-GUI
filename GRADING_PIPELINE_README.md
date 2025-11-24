# 🚀 Structured Query Grading Pipeline

Complete standalone implementation of the structured query grading system using the DoorDash `StructuredQueryStoreEvaluator` rubric and scoring logic.

## 📋 Overview

This pipeline:
1. **Loads raw Metis traces** from CSV
2. **Extracts `<query, store>` pairs** for each rewrite/hop
3. **Normalizes fields** to match evaluator schema
4. **Runs evaluation** using `StructuredQueryStoreEvaluator`
5. **Outputs consolidated JSONL** with all grades and scores

## 🏗️ Architecture

```
Raw CSV → Extract Tasks → Normalize Fields → Run Evaluator → Output JSONL
```

### Key Components

- **`GradingTask`**: Represents a single `<query, store>` pair to evaluate
- **`GradingResult`**: Contains evaluation output with scores and rationale
- **`extract_grading_tasks()`**: Parses traces and creates tasks
- **`normalize_store_fields()`**: Standardizes field names and formats
- **`run_evaluator()`**: Interfaces with StructuredQueryStoreEvaluator
- **`save_results()`**: Writes JSONL output

## ⚙️ Setup

### 1. Install Dependencies

```bash
pip install pandas tqdm openai
```

### 2. Set OpenAI API Key

```bash
export OPENAI_API_KEY="your-api-key-here"
```

The pipeline uses the OpenAI API directly with a standalone implementation of the DoorDash evaluator rubric.

## 🚀 Usage

### Basic Usage

```bash
export OPENAI_API_KEY="your-api-key"
python grade_traces.py \
    --input VOX__Metis_100_FullTraces.csv \
    --output structured_query_grades.json
```

### With Custom Parameters

```bash
python grade_traces.py \
    --input VOX__Metis_100_FullTraces.csv \
    --output grades.json \
    --model gpt-4o-mini \
    --temperature 0.0 \
    --parallel 20 \
    --limit 10  # For testing
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--input` | Path to input CSV with raw traces | Required |
| `--output` | Path to output JSON file | Required |
| `--model` | OpenAI model to use | `gpt-4o-mini` |
| `--temperature` | LLM temperature | `0.0` |
| `--parallel` | Number of parallel workers | `10` |
| `--limit` | Limit number of tasks (for testing) | None |

## 📊 Input Format

Your CSV must have these columns:

```
CONVERSATION_ID, TRACE_COUNT, CONVERSATION_JSON
```

Where `CONVERSATION_JSON` contains:

```json
{
  "traces": [
    {
      "original_query": "sushi near me",
      "rewritten_queries": [...],
      "store_recommendations": [
        {
          "stores": [
            {
              "store_id": "12345",
              "store_name": "Sushi Palace",
              "menu_items": [...],
              "distance_miles": 1.2,
              "eta_minutes": 25,
              ...
            }
          ]
        }
      ]
    }
  ]
}
```

## 📤 Output Format

The output is a single JSON file with metadata and results array:

```json
{
  "metadata": {
    "total_tasks": 100,
    "timestamp": "2025-11-24T00:27:55.841663",
    "score_mapping": {
      "is_serving_matched": 3,
      "is_serving_more_than_three_items": 2,
      "is_primary_serving": 2,
      "is_dietary_serving": 3,
      "is_flavor_match": 1,
      ...
    }
  },
  "results": [
    {
      "conversation_id": "conv_001",
      "trace_index": 0,
      "rewrite_id": "trace_0_rewrite_1",
      "carousel_index": 0,
      "query": "affordable sushi restaurants",
      "original_query": "sushi near me",
      "store_id": "12345",
      "store_name": "Sushi Palace",
      "scores": {
        "is_serving_matched": "Yes",
        "is_primary_serving": "Yes",
        "is_dietary_serving": "NA to Query",
        "is_flavor_match": "No",
        "is_exact_restaurant": "NA to Query",
        "is_nearby": "Yes",
        "is_fast_delivery": "Yes",
        "is_store_open": "Yes",
        "is_overall_rating_good": "Yes",
        "is_price_match": "Yes"
      },
      "weighted_score_pct": 85.5,
      "earned_pts": 17.1,
      "applicable_pts": 20.0,
      "label": "relevant",
      "rationale": "Store serves sushi and is nearby with fast delivery",
      "error": null
    }
  ]
}
```

## 🔍 Key Features

### 1. **Flexible Trace Parsing**

Handles multiple trace formats:
- `store_recommendations` arrays
- `candidate_stores` lists
- `retrieval.stores` objects
- Nested carousel structures

### 2. **Comprehensive Field Normalization**

Automatically maps various field names:
- `business_id` → `store_id`
- `star_rating` / `rating` → `store_rating`
- `distance` → `distance_miles`
- `eta` → `eta_minutes`

### 3. **Graceful Error Handling**

- Skips malformed JSON
- Logs parsing errors
- Continues processing on failures
- Reports summary statistics

### 4. **Per-Rewrite Grading**

Creates separate tasks for:
- Each rewrite of a query
- Each store candidate
- Each carousel/hop

### 5. **Batch Processing**

Processes tasks in configurable batches for:
- Memory efficiency
- Progress tracking
- Rate limiting

## 📈 Pipeline Output

The script logs comprehensive progress:

```
2025-01-24 10:00:00 - INFO - Loading traces from VOX__Metis_100_FullTraces.csv
2025-01-24 10:00:01 - INFO - Loaded 100 conversations
Extracting tasks: 100%|██████████| 100/100
2025-01-24 10:00:05 - INFO - Extracted 2,450 grading tasks from 98 valid conversations
2025-01-24 10:00:05 - INFO - Skipped 2 conversations due to parsing errors

2025-01-24 10:00:05 - INFO - Running evaluator on 2,450 tasks
Processing batch 1/25: 100%|██████████|
...
2025-01-24 10:15:30 - INFO - Completed evaluation of 2,450 tasks

2025-01-24 10:15:30 - INFO - Saving 2,450 results to structured_query_grades.jsonl

============================================================
GRADING SUMMARY
============================================================
Total tasks graded: 2,450
Relevant: 1,876 (76.6%)
Not relevant: 574 (23.4%)
Average score: 72.3%
Errors: 0
============================================================
```

## 🐛 Troubleshooting

### Issue: "No grading tasks extracted"

**Solution:** Check your CSV format. Ensure `CONVERSATION_JSON` column exists and contains valid JSON.

### Issue: Import error for evaluator

**Solution:** Make sure the evaluator file is in the same directory or in your Python path:

```bash
export PYTHONPATH="${PYTHONPATH}:/path/to/evaluator"
```

### Issue: Out of memory

**Solution:** Reduce batch size:

```bash
python grade_traces.py --input traces.csv --output grades.jsonl --batch-size 20
```

### Issue: Slow evaluation

**Solution:** The evaluator uses LLM calls which can be slow. Consider:
- Using a faster model
- Increasing parallel workers (if evaluator supports it)
- Processing in smaller chunks

## 📝 Example Workflow

```bash
# 1. Set API key
export OPENAI_API_KEY="your-api-key"

# 2. Test with limited data first
python grade_traces.py \
    --input VOX__Metis_100_FullTraces.csv \
    --output test_grades.json \
    --limit 10 \
    --parallel 5

# 3. Check the output
cat test_grades.json | jq '.results[0]'

# 4. Run full evaluation
python grade_traces.py \
    --input VOX__Metis_100_FullTraces.csv \
    --output full_grades.json \
    --parallel 20

# 5. Analyze results
python -c "
import json
data = json.load(open('full_grades.json'))
scores = [r['weighted_score_pct'] for r in data['results']]
print(f'Total tasks: {len(scores)}')
print(f'Average: {sum(scores)/len(scores):.2f}%')
print(f'Min: {min(scores):.2f}%')
print(f'Max: {max(scores):.2f}%')
"
```

## 🔗 Integration with Trace Viewer

To visualize grades in the trace viewer:

1. **Load grades JSONL** into the viewer
2. **Join with traces** by `conversation_id` and `store_id`
3. **Display scores** in store detail modal
4. **Color-code stores** by weighted score

## 📚 Next Steps

1. ✅ Integrate actual `StructuredQueryStoreEvaluator`
2. ✅ Test on sample data
3. ✅ Run full evaluation on 100 traces
4. ✅ Add results visualization to trace viewer
5. ✅ Set up automated evaluation pipeline

## 🤝 Contributing

To extend this pipeline:

1. **Add new normalizations**: Update `normalize_store_fields()`
2. **Support new trace formats**: Update `extract_store_candidates()`
3. **Add new metrics**: Update `GradingResult` dataclass
4. **Improve parsing**: Update `parse_explanation_to_scores()`

---

**Questions?** Check `grading_pipeline.log` for detailed execution logs.
