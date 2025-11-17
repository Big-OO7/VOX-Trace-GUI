#!/usr/bin/env python3
"""
Convert CSV trace files to JSON format for the trace viewer.
"""

import argparse
import json
import pandas as pd
from pathlib import Path


def convert_csv_to_json(input_csv: str, output_json: str):
    """Convert a CSV file with CONVERSATION_JSON column to a JSON file."""

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

    # Save to JSON
    output_path = Path(output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(conversations, f, indent=2)

    print(f"Saved to {output_json}")
    print(f"File size: {output_path.stat().st_size / 1024 / 1024:.2f} MB")


def main():
    parser = argparse.ArgumentParser(description="Convert CSV traces to JSON")
    parser.add_argument(
        "--input",
        required=True,
        help="Path to input CSV file"
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to output JSON file"
    )

    args = parser.parse_args()

    if not Path(args.input).exists():
        print(f"Error: Input file not found: {args.input}")
        return

    convert_csv_to_json(args.input, args.output)


if __name__ == "__main__":
    main()
