import json
from datetime import datetime

# Load JSONL results
results = []
with open('fuzzy_query_grades_all.jsonl', 'r') as f:
    for line in f:
        if line.strip():
            results.append(json.loads(line))

# Create output format matching the expected structure
output = {
    "metadata": {
        "total_tasks": len(results),
        "timestamp": datetime.now().isoformat(),
        "grading_type": "fuzzy_query_llm",
        "judge_model": "gpt-4o-mini",
        "score_mapping": {
            "relevance_format": 10,
            "serendipity": 10,
            "weighted": 10
        }
    },
    "results": []
}

# Convert each result with all required fields
for r in results:
    # Extract trace_index and carousel_index from rewrite_id (format: trace_X_rewrite_Y)
    rewrite_id = r.get("rewrite_id", "")
    parts = rewrite_id.split('_')
    trace_index = int(parts[1]) if len(parts) >= 4 else 0
    carousel_index = int(parts[3]) if len(parts) >= 4 else 0

    # Get judge result and verified scores
    judge = r.get("judge_result", {})
    verified = r.get("verified_scores", {})

    # Extract relevance and serendipity checks
    rel_checks = judge.get("relevance_checks", {})
    ser_checks = judge.get("serendipity_checks", {})

    output["results"].append({
        "conversation_id": r["conversation_id"],
        "consumer_id": r["consumer_id"],
        "trace_index": trace_index,
        "rewrite_id": r["rewrite_id"],
        "carousel_index": carousel_index,  # Add carousel_index
        "query": r["query"],
        "recommendation": r["recommendation_original"],
        "normalized_query": r["normalized_query"],
        "normalized_recommendation": r["recommendation_normalized"],

        # Fuzzy scores
        "fuzzy_query_to_rec": r["fuzzy_scores"]["query_to_rec"],
        "fuzzy_rec_to_top_item": r["fuzzy_scores"]["rec_to_top_item"],
        "fuzzy_max_item_similarity": r["fuzzy_scores"]["max_item_similarity"],
        "fuzzy_passed": r["fuzzy_passed"],

        # LLM scores (use verified scores if available)
        "relevance_format_score": verified.get("relevance_format_score", judge.get("relevance_format_score", 0)),
        "serendipity_score": verified.get("serendipity_score", judge.get("serendipity_score", 0)),
        "weighted_score": verified.get("weighted_score", judge.get("weighted_score", 0)),
        "weighted_score_pct": verified.get("weighted_score", judge.get("weighted_score", 0)) * 10,

        # Detailed checks
        "relevance_checks": rel_checks,
        "serendipity_checks": ser_checks,

        # Reasoning
        "relevance_format_reasoning": judge.get("relevance_format_reasoning", ""),
        "serendipity_reasoning": judge.get("serendipity_reasoning", ""),
        "overall_reasoning": judge.get("overall_reasoning", ""),

        # Metadata
        "judge_model": r["judge_model"],
        "elapsed_ms": r.get("elapsed_ms", 0),
        "status": r["status"],
        "error": r.get("error")
    })

# Write to output file
with open('trace-viewer/public/VOX_Metis_100_fuzzy_grades.json', 'w') as f:
    json.dump(output, f, indent=2)

# Print statistics
successes = sum(1 for r in output["results"] if r["status"] == "success")
print(f"✓ Converted {len(output['results'])} results to JSON")
print(f"✓ Saved to: trace-viewer/public/VOX_Metis_100_fuzzy_grades.json")
print(f"✓ Success rate: {successes}/{len(output['results'])} ({successes/len(output['results'])*100:.1f}%)")

# Calculate average scores for successful results
successful_results = [r for r in output["results"] if r["status"] == "success"]
if successful_results:
    avg_weighted = sum(r["weighted_score"] for r in successful_results) / len(successful_results)
    print(f"✓ Average weighted score: {avg_weighted:.2f}/10")
