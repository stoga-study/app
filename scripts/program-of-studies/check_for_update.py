"""Look for a new Conestoga Program of Studies and build its catalog. Run weekly by GitHub Actions.

Writes a Markdown report and sets the step output `status`:
  none      - no new PDF on the school site
  unchanged - a new upload, but the core classes are the same
  new       - src/data/catalogs/<year>.json was written; open a pull request
  problems  - something could not be read; open an issue (nothing was written)
"""
import argparse
import os
import re
import sys
import tempfile
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from update_catalog import existing_catalogs, extract, run  # noqa: E402

PAGE = "https://stoga.tesd.net/academics/program-of-studies"
PDF_LINK = re.compile(r"https://resources\.finalsite\.net/images/v(\d+)/tesdnet/[A-Za-z0-9]+/([^\"'\s/?]+\.pdf)")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "stoga.study catalog updater (github.com/stoga-study/app)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def newest_pdf(html):
    found = {(int(v), m.group(0)) for m in PDF_LINK.finditer(html) for v in [m.group(1)]
             if re.search(r"POS|program", m.group(2), re.I)}
    return max(found)[1] if found else None


def output(**kv):
    path = os.environ.get("GITHUB_OUTPUT")
    for k, v in kv.items():
        print(f"{k}={v}")
        if path:
            with open(path, "a") as f:
                f.write(f"{k}={v}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", default="report.md")
    a = ap.parse_args()

    def finish(status, report, year=""):
        with open(a.report, "w", encoding="utf-8") as f:
            f.write(report.rstrip() + "\n")
        output(status=status, year=year)

    try:
        html = fetch(PAGE).decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return finish("problems", f"Could not open {PAGE}: {e}\n\nIf the school moved the page, update PAGE in "
                                  "scripts/program-of-studies/check_for_update.py.")
    url = newest_pdf(html)
    if not url:
        return finish("problems", f"No Program of Studies PDF link was found on {PAGE}. The page may have changed.")
    if url in {c.get("source") for c in existing_catalogs().values()}:
        return finish("none", f"No new Program of Studies. Latest is already in the app:\n{url}")

    with tempfile.TemporaryDirectory() as tmp:
        pdf = os.path.join(tmp, "pos.pdf")
        with open(pdf, "wb") as f:
            f.write(fetch(url))
        text = extract(pdf)
    status, report = run(text, url)
    year = re.search(r"Catalog (\d{4}-\d{2})", report)
    header = f"Source: {url}\n\n"
    if status == "problems":
        return finish("problems", header + report + "\n\nFix the parser or add a reviewed rule in "
                      "`scripts/program-of-studies/rules.py`, then run the workflow again.")
    finish("new" if status == "ok" else "unchanged", header + report, year.group(1) if year else "")


if __name__ == "__main__":
    main()
