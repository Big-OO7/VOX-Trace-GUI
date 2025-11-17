#!/usr/bin/env python3
"""
Convert CSV trace files to JSON format and split into chunks for efficient loading.
"""

import json
import pandas as pd
from pathlib import Path


def convert_and_chunk(input_csv: str, output_dir: str, chunk_size: int = 10):
    """Convert a CSV file to JSON and split into chunks."""

    print(f"Loading CSV from {input_csv}...")
    df = pd.read_csv(input_csv)

    print(f"Found {len(df)} conversations")

    # Parse each conversation's JSON
    conversations = []
    for idx, row in df.iterrows():
        conversation_id = row.get("CONVERSATION_ID", f"conv_{idx}")
        conversation_json = row.get("CONVERSATION_JSON", "{}")

        try:
            conversation_data = json.loads(conversation_json)
            conversations.append({
                "conversation_id": conversation_id,
                "trace_count": row.get("TRACE_COUNT", 0),
                "data": conversation_data
            })
        except json.JSONDecodeError as e:
            print(f"Warning: Failed to parse JSON for {conversation_id}: {e}")
            continue

    print(f"Successfully parsed {len(conversations)} conversations")

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Create a manifest with conversation metadata (without full data)
    manifest = {
        "total_conversations": len(conversations),
        "chunk_size": chunk_size,
        "chunks": [],
        "conversations": []
    }

    # Split into chunks
    num_chunks = (len(conversations) + chunk_size - 1) // chunk_size

    for i in range(num_chunks):
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, len(conversations))
        chunk_data = conversations[start_idx:end_idx]

        chunk_filename = f"traces_chunk_{i}.json"
        chunk_path = output_path / chunk_filename

        with open(chunk_path, 'w') as f:
            json.dump(chunk_data, f)

        chunk_size_mb = chunk_path.stat().st_size / 1024 / 1024
        print(f"Chunk {i}: {len(chunk_data)} conversations, {chunk_size_mb:.2f} MB")

        manifest["chunks"].append({
            "index": i,
            "filename": chunk_filename,
            "start": start_idx,
            "end": end_idx,
            "count": len(chunk_data)
        })

        # Add conversation metadata to manifest
        for conv in chunk_data:
            manifest["conversations"].append({
                "conversation_id": conv["conversation_id"],
                "trace_count": conv["trace_count"],
                "chunk_index": i
            })

    # Save manifest
    manifest_path = output_path / "traces_manifest.json"
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"\nSaved manifest to {manifest_path}")
    print(f"Total chunks: {num_chunks}")
    print(f"Manifest size: {manifest_path.stat().st_size / 1024:.2f} KB")


if __name__ == "__main__":
    # Convert VOX__Metis_100_FullTraces.csv to chunks
    convert_and_chunk(
        "VOX__Metis_100_FullTraces.csv",
        "trace-viewer/public/data/traces",
        chunk_size=10  # 10 conversations per chunk
    )
