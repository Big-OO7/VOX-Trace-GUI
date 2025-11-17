#!/usr/bin/env python3
"""
Wrapper script to run the grading notebook programmatically.
Uses papermill to execute the notebook with custom parameters.
"""

import argparse
import subprocess
import sys
import json
from pathlib import Path


def run_grading_notebook(traces_file, output_file, max_parallel=100):
    """Run the grading notebook using papermill."""
    
    print(f"\n{'='*100}")
    print(f"📊 Running Grading Notebook")
    print(f"{'='*100}\n")
    print(f"Input: {traces_file}")
    print(f"Output: {output_file}")
    print(f"Max Parallel: {max_parallel}\n")
    
    try:
        # Try using papermill first
        cmd = [
            'papermill',
            'grade_converted_traces_output.ipynb',
            '/tmp/grading_output.ipynb',
            '-p', 'TRACES_FILE', str(traces_file),
            '-p', 'OUTPUT_FILE', str(output_file),
            '-p', 'MAX_PARALLEL_GRADES', str(max_parallel),
            '--log-output',  # Show cell outputs in real-time
            '--progress-bar'  # Show progress bar
        ]
        
        # Run with real-time output (don't capture)
        print("📓 Executing grading notebook with real-time output...\n")
        result = subprocess.run(cmd, capture_output=False, text=True)
        
        if result.returncode == 0:
            print("\n✅ Grading completed successfully")
            return True
        else:
            print("\n⚠️  Papermill failed")
            print("   Attempting alternative method...")
            
    except FileNotFoundError:
        print("⚠️  Papermill not installed")
        pass
    
    # Alternative: Use nbconvert to execute the notebook
    print("\nAttempting to run using jupyter nbconvert...")
    
    # Create a temporary notebook with modified parameters
    import nbformat
    from nbformat.v4 import new_notebook, new_code_cell
    
    try:
        # Read the original notebook
        with open('grade_converted_traces_output.ipynb', 'r') as f:
            nb = nbformat.read(f, as_version=4)
        
        # Modify the configuration cell (cell 1)
        for cell in nb.cells:
            if 'TRACES_FILE' in cell.source and 'OUTPUT_FILE' in cell.source:
                # Replace the configuration values
                cell.source = cell.source.replace(
                    "TRACES_FILE = 'vercel-deploy/traces.json'",
                    f"TRACES_FILE = '{traces_file}'"
                ).replace(
                    "OUTPUT_FILE = 'vercel-deploy/new_graded_results.json'",
                    f"OUTPUT_FILE = '{output_file}'"
                ).replace(
                    "MAX_PARALLEL_GRADES = 100",
                    f"MAX_PARALLEL_GRADES = {max_parallel}"
                )
                break
        
        # Save modified notebook
        temp_nb = '/tmp/grade_temp.ipynb'
        with open(temp_nb, 'w') as f:
            nbformat.write(nb, f)
        
        # Execute the notebook
        cmd = [
            'jupyter', 'nbconvert',
            '--to', 'notebook',
            '--execute',
            '--inplace',
            temp_nb
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Grading completed successfully")
            return True
        else:
            print(f"❌ Error executing notebook: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Grade traces using the grading notebook')
    parser.add_argument('--traces', required=True, help='Path to traces.json')
    parser.add_argument('--output', required=True, help='Path to output graded results')
    parser.add_argument('--parallel', type=int, default=100, help='Max parallel workers')
    
    args = parser.parse_args()
    
    # Check if input file exists
    if not Path(args.traces).exists():
        print(f"❌ Error: Traces file not found: {args.traces}")
        sys.exit(1)
    
    success = run_grading_notebook(args.traces, args.output, args.parallel)
    
    if not success:
        print("\n" + "="*100)
        print("⚠️  Automatic grading failed. Manual steps required:")
        print("="*100)
        print(f"\n1. Open grade_converted_traces_output.ipynb in Jupyter")
        print(f"2. Update these values in the configuration cell:")
        print(f"   TRACES_FILE = '{args.traces}'")
        print(f"   OUTPUT_FILE = '{args.output}'")
        print(f"   MAX_PARALLEL_GRADES = {args.parallel}")
        print(f"3. Run all cells")
        print(f"4. Verify output at: {args.output}\n")
        sys.exit(1)
    
    # Verify output was created
    if not Path(args.output).exists():
        print(f"❌ Error: Output file not created: {args.output}")
        sys.exit(1)
    
    # Print summary
    with open(args.output, 'r') as f:
        results = json.load(f)
    
    print(f"\n✅ Graded {len(results)} traces")
    print(f"   Output: {args.output}\n")


if __name__ == '__main__':
    main()

