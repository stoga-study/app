"""Shape parsed Program of Studies courses into the app's core-class catalog.

Usage (from pwa-app/):
  python3 scripts/program-of-studies/extract_text.py POS.pdf /tmp/pos.txt   # needs pymupdf
  python3 scripts/program-of-studies/parse.py /tmp/pos.txt /tmp/courses.json
  python3 scripts/program-of-studies/build_catalog.py /tmp/courses.json src/data/chs-courses.json

Only core academic courses are kept: anything earning English, history, government/economics,
math, science or world language credit. Elective-only courses are dropped.
"""
import json, re, sys

SCHOOL_YEAR = "2026-27"
SOURCE = "https://resources.finalsite.net/images/v1769441643/tesdnet/nutnldvuymcp7fq1noi5/POS2627Updated.pdf"
CORE_DEPTS = ["English", "Social Studies", "Mathematics", "Science", "World Languages"]
CORE_AREAS = {"LF", "LC", "AV", "EN", "UH", "WH", "GV", "MA", "BI", "SC", "WL"}

# Titles the PDF layout splits or merges oddly.
TITLE_FIXES = {"Economics": "US Government and Politics / Economics"}
SECTION_NAME_FIXES = {"1700": "AP US Government and Politics"}

# Math tracks, summarised from the Algebra 2 and Math Analysis course descriptions.
TRACK_NOTES = {
    ("Algebra 2", "BC"): "Compacted track toward AP Calculus BC",
    ("Algebra 2", "AB"): "Toward Calculus (H) or AP Calculus AB",
    ("Math Analysis", "BC"): "Compacted track toward AP Calculus BC",
    ("Math Analysis", "AB"): "Toward Calculus (H) or AP Calculus AB",
}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def short(text, limit=420):
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = cut.rfind(". ")
    return cut[: end + 1] if end > 120 else cut.rstrip() + "…"


courses = json.load(open(sys.argv[1], encoding="utf-8"))

# A prerequisite is one or more course names joined by "or"; anything after them is description
# text that the PDF layout ran together with the prerequisite line.
KNOWN = sorted({c["title"] for c in courses} | {"AP Physics C: Mechanics", "AP Spanish Language 4-5"}, key=len, reverse=True)
NAME = "(?:" + "|".join(re.escape(t) for t in KNOWN) + ")"
PREREQ = re.compile(rf"^({NAME}(?:\s*(?:,|or|and)\s*{NAME})*)\s*(.*)$")


def split_prereq(prereq, description):
    if not prereq:
        return None, description
    m = PREREQ.match(prereq)
    if not m:
        return prereq, description
    rest = m.group(2).strip()
    return m.group(1).strip(), (rest + " " + description).strip() if rest else description


out = []
for c in courses:
    if c["department"] not in CORE_DEPTS:
        continue
    areas = set(c["areas"])
    if not (areas & CORE_AREAS) and not (not areas and c["department"] == "World Languages"):
        continue
    title = TITLE_FIXES.get(c["title"], c["title"])
    sections = []
    for s in c["sections"]:
        level = s["level"] or ("AP" if title.startswith("AP ") else None)
        name = SECTION_NAME_FIXES.get(s["code"]) or (
            f"AP {title}" if level == "AP" and not title.startswith("AP ") else title
        )
        track = s.get("track")
        if track:
            name = f"{title} {track}"  # "Algebra 2 BC": a separate track, not just a level
        sections.append({"code": s["code"], "level": level, "name": name, "track": track,
                         "trackNote": TRACK_NOTES.get((c["title"], track)),
                         "grades": s["grades"], "approvalGrades": s["approvalGrades"]})
    out.append({
        "id": slug(title), "title": title, "department": c["department"],
        "credits": c["credits"], "duration": c["duration"],
        **dict(zip(("prerequisite", "description"), (lambda p, d: (p, short(d)))(*split_prereq(c["prerequisite"], c["description"] or "")))),
        "page": c["page"], "sections": sections,
    })

out.sort(key=lambda c: CORE_DEPTS.index(c["department"]))  # stable: keeps Program of Studies order
ids = [c["id"] for c in out]
assert len(ids) == len(set(ids)), "duplicate course ids"
json.dump({"school": "Conestoga High School", "schoolYear": SCHOOL_YEAR, "source": SOURCE, "courses": out},
          open(sys.argv[2], "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(f"{len(out)} core courses, {sum(len(c['sections']) for c in out)} sections")
