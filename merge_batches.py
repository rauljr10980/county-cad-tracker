import pandas as pd
import os
from pathlib import Path

# Path to the excel_batches folder
batches_folder = r"C:\Users\Raulm\OneDrive\Documents\Raul Medina\Abstract data from Tax collector, to then feed it to my software\excel_batches"

# Output file path (in the same directory as the script)
output_file = "finishedscraperdata.xlsx"

print("Starting to merge batch files...")

# List to store all dataframes
all_data = []

# Read all batch files (batch_01 to batch_20)
for i in range(1, 21):
    batch_name = f"batch_{i:02d}.xlsx"
    batch_path = os.path.join(batches_folder, batch_name)

    if os.path.exists(batch_path):
        print(f"Reading {batch_name}...")
        df = pd.read_excel(batch_path)
        all_data.append(df)
        print(f"  - Rows: {len(df)}")
    else:
        print(f"Warning: {batch_name} not found, skipping...")

# Merge all dataframes
if all_data:
    print("\nMerging all data...")
    merged_df = pd.concat(all_data, ignore_index=True)

    print(f"\nTotal rows in merged data: {len(merged_df)}")
    print(f"Total columns: {len(merged_df.columns)}")

    # Save to Excel
    print(f"\nSaving to {output_file}...")
    merged_df.to_excel(output_file, index=False, engine='openpyxl')

    print(f"\n✅ Successfully merged {len(all_data)} batch files!")
    print(f"📁 Output file: {os.path.abspath(output_file)}")
    print(f"📊 Total records: {len(merged_df):,}")
else:
    print("❌ No batch files found to merge!")
