"""Build a catalog from a Program of Studies PDF (or extracted text) and report what changed.

  python3 scripts/program-of-studies/update_catalog.py --pdf POS.pdf --source URL
  python3 scripts/program-of-studies/update_catalog.py --text pos.txt --source URL --check   # validate only

Writes src/data/catalogs/<school year>.json. Exits 2 with a list of problems if anything in the PDF
could not be accounted for; nothing is written in that case.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import pos_lib  # noqa: E402

CATALOG_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "src", "data", "catalogs")


def extract(pdf):
    import pymupdf

    doc = pymupdf.open(pdf)
    return "".join(f"\n=== PAGE {i + 1} ===\n" + page.get_text() for i, page in enumerate(doc))


def existing_catalogs(directory=CATALOG_DIR):
    out = {}
    for name in sorted(os.listdir(directory)) if os.path.isdir(directory) else []:
        if name.endswith(".json"):
            with open(os.path.join(directory, name), encoding="utf-8") as f:
                out[name[:-5]] = json.load(f)
    return out


def run(text, source, check=False, directory=CATALOG_DIR):
    """Returns (status, report). status: 'ok', 'unchanged' or 'problems'."""
    year, courses, problems = pos_lib.parse(text)
    catalog, problems = pos_lib.build(year, courses, problems, source)
    if problems:
        report = "The Program of Studies could not be read cleanly. Nothing was changed.\n\n" + \
                 "\n".join(f"- {p}" for p in problems)
        return "problems", report
    catalogs = existing_catalogs(directory)
    previous = catalogs.get(year) or next((catalogs[y] for y in sorted(catalogs, reverse=True) if y < year), None)
    report = pos_lib.compare(previous, catalog)
    if previous and previous.get("courses") == catalog["courses"] and previous.get("source") == source:
        return "unchanged", report
    if not check:
        os.makedirs(directory, exist_ok=True)
        pos_lib.dump(catalog, os.path.join(directory, f"{year}.json"))
    return "ok", f"Catalog {year}: {len(catalog['courses'])} core courses, " \
                 f"{sum(len(c['sections']) for c in catalog['courses'])} sections.\n\n{report}"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--pdf")
    src.add_argument("--text")
    ap.add_argument("--source", required=True, help="URL of the PDF, recorded in the catalog")
    ap.add_argument("--check", action="store_true", help="validate only; do not write")
    a = ap.parse_args()
    text = extract(a.pdf) if a.pdf else open(a.text, encoding="utf-8").read()
    status, report = run(text, a.source, a.check)
    print(report)
    sys.exit(2 if status == "problems" else 0)
