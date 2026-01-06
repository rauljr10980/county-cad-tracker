"""
Excel File Analyzer for County CAD Tracker
Analyzes Excel file structure and maps columns to PostgreSQL schema
"""

import sys
import pandas as pd
from pathlib import Path

def analyze_excel(file_path):
    """Analyze Excel file and show column mapping"""

    print(f"\n{'='*80}")
    print(f"ANALYZING: {file_path}")
    print(f"{'='*80}\n")

    try:
        # Read Excel file
        df = pd.read_excel(file_path)

        print(f"📊 Total Rows: {len(df)}")
        print(f"📋 Total Columns: {len(df.columns)}\n")

        print("COLUMNS FOUND:")
        print("-" * 80)
        for i, col in enumerate(df.columns, 1):
            print(f"{i:2d}. {col}")

        print(f"\n{'='*80}")
        print("FIRST 3 ROWS (Sample Data):")
        print(f"{'='*80}\n")
        print(df.head(3).to_string())

        print(f"\n\n{'='*80}")
        print("COLUMN MAPPING TO POSTGRESQL:")
        print(f"{'='*80}\n")

        # Expected PostgreSQL columns
        expected_mapping = {
            'accountNumber': ['Account Number', 'ACCOUNT NUMBER', 'Account #', 'ACCOUNT #'],
            'ownerName': ['Owner Name', 'OWNER NAME', 'Owner', 'OWNER'],
            'propertyAddress': ['Property Address', 'PROPERTY ADDRESS', 'Address', 'ADDRESS', 'Property Addr'],
            'mailingAddress': ['Mailing Address', 'MAILING ADDRESS', 'Mail Address'],
            'totalDue': ['Total Due', 'TOTAL DUE', 'Amount Due', 'AMOUNT DUE', 'Total Amount'],
            'percentageDue': ['Percentage Due', 'PERCENTAGE DUE', 'Percent', 'PERCENT', '%'],
            'status': ['Status', 'STATUS'],
            'taxYear': ['Tax Year', 'TAX YEAR', 'Year'],
            'legalDescription': ['Legal Description', 'LEGAL DESCRIPTION', 'Legal Desc']
        }

        mapped = {}
        unmapped = list(df.columns)

        for db_field, possible_names in expected_mapping.items():
            found = False
            for col in df.columns:
                if col in possible_names:
                    mapped[db_field] = col
                    if col in unmapped:
                        unmapped.remove(col)
                    found = True
                    print(f"✅ {db_field:20s} → '{col}'")
                    break

            if not found:
                print(f"❌ {db_field:20s} → NOT FOUND (tried: {', '.join(possible_names[:3])})")

        if unmapped:
            print(f"\n⚠️  UNMAPPED COLUMNS (will be ignored):")
            for col in unmapped:
                print(f"   - {col}")

        print(f"\n\n{'='*80}")
        print("RECOMMENDED ACTION:")
        print(f"{'='*80}\n")

        missing_critical = []
        for field in ['accountNumber', 'ownerName', 'propertyAddress', 'totalDue']:
            if field not in mapped:
                missing_critical.append(field)

        if missing_critical:
            print(f"❌ CRITICAL FIELDS MISSING: {', '.join(missing_critical)}")
            print(f"\nYou need to either:")
            print(f"  1. Rename columns in Excel to match expected names, OR")
            print(f"  2. Update backend code to recognize your column names")
            print(f"\nYour columns: {list(df.columns)}")
        else:
            print(f"✅ All critical fields found! Upload should work.")
            print(f"\nMapped columns:")
            for db_field, excel_col in mapped.items():
                print(f"  {db_field:20s} ← '{excel_col}'")

        return df, mapped

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        return None, None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\nUsage: python analyze_excel.py <path_to_excel_file>")
        print("\nExample:")
        print("  python analyze_excel.py data.xlsx")
        print("  python analyze_excel.py 'C:\\Users\\Name\\Downloads\\tax-delinquent.xlsx'")
        sys.exit(1)

    file_path = sys.argv[1]

    if not Path(file_path).exists():
        print(f"\n❌ ERROR: File not found: {file_path}")
        sys.exit(1)

    df, mapped = analyze_excel(file_path)

    if df is not None:
        print(f"\n\n💡 TIP: To see more rows, use Excel or:")
        print(f"   python -c \"import pandas as pd; print(pd.read_excel('{file_path}').head(10))\"")
