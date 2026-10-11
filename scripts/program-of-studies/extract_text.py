"""Extract the Program of Studies PDF to text, one marker per page. Requires: pip install pymupdf"""
import sys
import pymupdf

doc = pymupdf.open(sys.argv[1])
with open(sys.argv[2], "w", encoding="utf-8") as f:
    for i, page in enumerate(doc):
        f.write(f"\n=== PAGE {i + 1} ===\n" + page.get_text())
