"""Read the Conestoga Program of Studies into the app's core-class catalog.

Strict by design: every token on a course's code lines must be understood, every course must land
in a department, and the finished catalog must pass the checks in validate(). Anything unexpected
becomes a problem that stops the update. Reviewed exceptions live in rules.py.
"""
import json
import re

import rules

GRADES_RE = re.compile(r"^Grades?\s+((?:9|10|11|12)\*?(?:\s*,\s*(?:9|10|11|12)\*?)*)")
CODE_LINE = re.compile(r"^\d{4}\b")
# "2150 (H)", "0072(A)*", or a year variant "4070 - 4 (AP)" (AP French Language 4 vs 5).
SECTION_TOKEN = re.compile(r"\b(\d{4})(?:\s*-\s*(\d))?\s*(?:\(\s*(AP|H\*|H|X|A)\s*\))?")
TERM = re.compile(r"\b(?:\d(?:st|nd)\s+)?(?:Year|(Semester|Quarter)(?:\s*(\d)(?!\s*credit))?)\b", re.I)
CREDIT = re.compile(r"[\d.]+\s*credits?\b", re.I)
# "4230 or 4231" under a prerequisite: the prerequisite's own course codes, not sections.
PREREQ_CODES = re.compile(r"^\d{4}(?:\s+or\s+\d{4})+$")
FEE = re.compile(r"\((?:Lab|Course)\s+[Ff]ee[^)]*\)")
AREA_TOKEN = re.compile(r"\*?\b(" + "|".join(sorted(rules.ALL_AREAS)) + r")\b")
AREA_LINE = re.compile(r"^\*?[A-Z]{2}(?:\s*,\s*\*?[A-Z]{2})*$")
NOISE = re.compile(
    r"^(Year|(?:\d(?:st|nd)\s+)?(?:Semester|Quarter)(?:\s*\d)?|[\d.]+\s*credits?|credits?|\*?with .*|\((?:Lab|Course) Fee.*|[\d.]+|"
    r"\*?[A-Z]{2}(\s*,\s*\*?[A-Z]{2})*)$",
    re.I,
)
LEVELS = {"AP", "H*", "H", "X", "A"}


def split_pages(text):
    parts = re.split(r"\n=== PAGE (\d+) ===\n", text)
    return {int(parts[i]): parts[i + 1] for i in range(1, len(parts), 2)}


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def clean_title(t):
    t = re.sub(r"\*+", "", t)
    t = re.sub(r"\[\d+\]", "", t)
    t = re.sub(r"^\d{4}\s+", "", t)
    return norm(t).strip(" -–")


def school_year(pages):
    for p in sorted(pages)[:4]:
        m = re.search(r"(\d{4})\s*-\s*(\d{4})\s*Program\s+Of\s+Studies", pages[p], re.I)
        if m and int(m.group(2)) == int(m.group(1)) + 1:
            return f"{m.group(1)}-{m.group(2)[2:]}"
    return None


def read_code_line(line):
    """Split a code line into sections, credit areas, notes and a term. Leftover is text it did not understand."""
    s = FEE.sub(" ", line)
    term = None
    for kind, num in TERM.findall(s):
        if num:
            term = f"{kind.title()} {num}"
    s = CREDIT.sub(" ", TERM.sub(" ", s))
    codes = [(c, variant or None, lv or None) for c, variant, lv in SECTION_TOKEN.findall(s)]
    s = SECTION_TOKEN.sub(" ", s)
    notes = [norm(n) for n in re.findall(r"\(([^()]*)\)", s)]
    s = re.sub(r"\([^()]*\)", " ", s)
    areas = set(AREA_TOKEN.findall(s))
    s = AREA_TOKEN.sub(" ", s)
    leftover = re.sub(r"[\s,*]+", " ", s).strip()
    return codes, areas, notes, term, leftover


def parse(text):
    """Parse extracted PDF text. Returns (school_year, courses, problems)."""
    pages = split_pages(text)
    problems = []
    year = school_year(pages)
    if not year:
        problems.append("Could not find the school year (e.g. '2026 - 2027 Program Of Studies') on the first pages.")

    courses = []
    dept = None
    for pno in sorted(pages):
        nz = [norm(l) for l in pages[pno].split("\n") if l.strip()]
        header = next((h.lower() for h in nz[1:3] if h.lower() in rules.DEPARTMENT_HEADERS or h.lower() in rules.END_HEADERS), None)
        if header in rules.END_HEADERS:
            break
        if header:
            dept = rules.DEPARTMENT_HEADERS[header]
        if not dept:
            continue

        grade_idx = [k for k, l in enumerate(nz) if GRADES_RE.match(l)]
        consumed = set()
        page_courses = []
        for gi, k in enumerate(grade_idx):
            raw = GRADES_RE.match(nz[k]).group(1)
            grades = sorted({int(g) for g in re.findall(r"\b(9|10|11|12)\b", raw)})
            approval = sorted({int(g) for g in re.findall(r"\b(9|10|11|12)\*", raw)})
            prev_g = grade_idx[gi - 1] if gi else -1
            nxt_g = grade_idx[gi + 1] if gi + 1 < len(grade_idx) else len(nz)

            # Walk back to the title, noting a code line directly above ("Algebra 2" layout).
            code_before = None
            title = None
            title_j = k
            j = k - 1
            while j > prev_g:
                line = nz[j]
                if CODE_LINE.match(line) and code_before is None and j == k - 1:
                    code_before = j
                    j -= 1
                    continue
                if NOISE.match(line) or CODE_LINE.match(line):
                    j -= 1
                    continue
                title = clean_title(line)
                title_j = j
                break
            continuation = title is None and page_courses
            layout = page_courses[-1]["_layout"] if continuation else ("before" if code_before is not None else "after")

            if layout == "before":
                code_lines = [code_before] if code_before is not None else []
            else:
                # Code lines run until the description starts; credit/duration lines may sit between them.
                code_lines = []
                for j in range(k + 1, nxt_g):
                    if PREREQ_CODES.match(nz[j]):
                        break
                    if CODE_LINE.match(nz[j]) or AREA_LINE.match(nz[j]):
                        code_lines.append(j)
                    elif not NOISE.match(nz[j]):
                        break
            window = " ".join(nz[title_j + 1:k + 1] + nz[k + 1:min(nxt_g, k + 6)])
            dur = re.search(r"\b(Year|Semester|Quarter)\b", window)
            cred = re.search(r"(\d*\.?\d+)\s*credits?", window, re.I)

            sections, areas, leftovers = [], set(), []
            for j in code_lines:
                consumed.add(j)
                codes, line_areas, notes, term, leftover = read_code_line(nz[j])
                if term and len(codes) > 1:
                    leftovers.append(f"term '{term}' is shared by several sections in '{nz[j]}'")
                areas |= line_areas
                if leftover:
                    leftovers.append(f"'{leftover}' in code line '{nz[j]}'")
                track = None
                for note in notes:
                    if note not in rules.NOTE_RULES:
                        leftovers.append(f"unknown note '({note})' in code line '{nz[j]}'. Add it to NOTE_RULES")
                    elif len(codes) != 1:
                        leftovers.append(f"note '({note})' is shared by several sections in '{nz[j]}'")
                    else:
                        track = rules.NOTE_RULES[note]
                for code, variant, level in codes:
                    sections.append({"code": code, "variant": variant, "level": level, "track": track,
                                     "term": term if len(codes) == 1 else None, "grades": grades, "approvalGrades": approval})

            meta = {"duration": dur.group(1) if dur else None, "credits": float(cred.group(1)) if cred else None}
            if continuation:
                c = page_courses[-1]
                c["sections"] += sections
                c["areas"] |= areas
                c["_problems"] += leftovers
                continue
            c = {"title": title or "?", "department": dept, "sections": sections, "areas": areas, **meta,
                 "page": pno, "_start": k, "_layout": layout, "_problems": leftovers}
            page_courses.append(c)

        # Description and prerequisite: from each course's last block to the next course's title.
        for ci, c in enumerate(page_courses):
            end = page_courses[ci + 1]["_start"] - 1 if ci + 1 < len(page_courses) else len(nz)
            span = range(c["_start"] + 1, end)
            for j in span:
                if PREREQ_CODES.match(nz[j]):
                    consumed.add(j)
                elif CODE_LINE.match(nz[j]) and j not in consumed:
                    c["_problems"].append(f"code line '{nz[j]}' is not attached to any 'Grades' line")
            body = [nz[j] for j in span if not GRADES_RE.match(nz[j]) and not NOISE.match(nz[j]) and not CODE_LINE.match(nz[j])]
            if ci + 1 < len(page_courses) and body and clean_title(body[-1]) == page_courses[ci + 1]["title"]:
                body = body[:-1]
            txt = norm(" ".join(body)).replace("­ ", "").replace("­", "")
            # Keep everything after "Prerequisite:"; build() splits the course names from the description.
            pm = re.match(r"(?:Prerequisites?|Co-?requisites?):?\s*", txt)
            c["prerequisite"] = txt[pm.end():] if pm else None
            c["description"] = "" if pm else txt
        courses += page_courses

    return year, courses, problems


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def short(text, limit=420):
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = cut.rfind(". ")
    return cut[: end + 1] if end > 120 else cut.rstrip() + "…"


def build(year, courses, problems, source):
    """Keep core courses, apply the reviewed rules, and validate. Returns (catalog, problems)."""
    problems = list(problems)
    known = {c["title"] for c in courses} | {rules.TITLE_FIXES.get(c["title"], c["title"]) for c in courses} | rules.EXTRA_PREREQUISITE_NAMES
    name_re = "(?:" + "|".join(re.escape(t) for t in sorted(known, key=len, reverse=True)) + ")"
    prereq_re = re.compile(rf"^({name_re}(?:\s*(?:,|or|and)\s*{name_re})*)\s*(.*)$")

    out = []
    for c in courses:
        if c["department"] not in rules.CORE_DEPARTMENTS:
            continue
        where = f"{c['title']} (page {c['page']})"
        for s in c["sections"]:
            if not c["areas"] and s["code"] in rules.AREA_OVERRIDES:
                c["areas"] = set(rules.AREA_OVERRIDES[s["code"]])
        core_depts = {rules.CORE_AREAS[a] for a in c["areas"] if a in rules.CORE_AREAS}
        if not c["areas"]:
            problems.append(f"{where}: no credit area on its code line. If the PDF omits it, add AREA_OVERRIDES")
            continue
        if not core_depts:
            continue  # an elective listed in a core department
        if c["department"] not in core_depts:
            problems.append(f"{where}: under the {c['department']} header but earns {', '.join(sorted(core_depts))} credit")
        problems += [f"{where}: {p}" for p in c["_problems"]]
        title = rules.TITLE_FIXES.get(c["title"], c["title"])
        if title == "?" or not re.match(r"^[A-Z0-9]", title) or re.search(r"[*\[\]]|\d{4}", title) or len(title) > 70:
            problems.append(f"{where}: suspicious title '{title}'")

        prereq, desc = c["prerequisite"], c["description"]
        if prereq:
            m = prereq_re.match(prereq)
            if not m:
                problems.append(f"{where}: prerequisite '{prereq[:80]}' does not start with a known course name")
            else:
                prereq, desc = m.group(1).strip(), f"{m.group(2).strip(' .;')} {desc}".strip()
        if len(desc) < 40:
            problems.append(f"{where}: description is missing or too short")

        sections = []
        for s in c["sections"]:
            level = s["level"] or ("AP" if title.startswith("AP ") else None)
            name = rules.SECTION_NAME_FIXES.get(s["code"]) or (
                f"AP {title}" if level == "AP" and not title.startswith("AP ") else title)
            if s["track"]:
                name = f"{title} {s['track']}"
            if s["variant"]:
                vm = re.match(r"^(.*?)\s*\d\s*-\s*\d$", title)  # "AP French Language 4 - 5" → "... 4"
                if vm:
                    name = f"{vm.group(1)} {s['variant']}"
                else:
                    problems.append(f"{where}: section {s['code']} has year variant {s['variant']} but the title has no 'N - M' range")
            sections.append({
                "code": s["code"], "level": level, "track": s["track"],
                "trackNote": rules.TRACK_NOTES.get((title, s["track"])) if s["track"] else None,
                "name": name, "term": s["term"], "grades": s["grades"], "approvalGrades": s["approvalGrades"],
            })
        if not sections:
            problems.append(f"{where}: no course codes found")
        if any(s["level"] for s in sections) and not all(s["level"] for s in sections):
            problems.append(f"{where}: some sections have a level and some do not")
        for s in sections:
            if not s["grades"]:
                problems.append(f"{where}: section {s['code']} has no grades")
            if s["level"] and s["level"] not in LEVELS:
                problems.append(f"{where}: section {s['code']} has unknown level {s['level']}")
            if s["track"] and not s["trackNote"]:
                problems.append(f"{where}: track {s['track']} has no TRACK_NOTES entry")
        seen = {}
        for s in sections:
            key = (s["level"], s["track"], s["name"], s["term"])
            other = seen.get(key)
            if other and set(other["grades"]) & set(s["grades"]) and (title, s["level"]) not in rules.REVIEWED_DUPLICATE_LEVELS:
                problems.append(f"{where}: sections {other['code']} and {s['code']} have the same level ({s['level']}) "
                                "and nothing tells them apart. Find what differs, or add REVIEWED_DUPLICATE_LEVELS")
            seen[key] = s

        out.append({
            "id": slug(title), "title": title, "department": c["department"], "credits": c["credits"],
            "duration": c["duration"], "prerequisite": prereq, "description": short(desc), "page": c["page"],
            "sections": sections,
        })

    out.sort(key=lambda c: rules.CORE_DEPARTMENTS.index(c["department"]))  # stable: keeps PDF order
    ids = [c["id"] for c in out]
    for i in sorted({i for i in ids if ids.count(i) > 1}):
        problems.append(f"Two courses share the id '{i}'")
    codes = [s["code"] for c in out for s in c["sections"]]
    for code in sorted({x for x in codes if codes.count(x) > 1}):
        problems.append(f"Section code {code} appears more than once")
    titles = {c["title"] for c in out}
    for a in rules.ANCHOR_COURSES:
        if a not in titles:
            problems.append(f"Expected course '{a}' is missing. The PDF layout may have changed")

    catalog = {"school": "Conestoga High School", "schoolYear": year, "source": source, "courses": out}
    return catalog, problems


def compare(old, new):
    """A short Markdown summary of what changed between two catalogs."""
    if not old:
        return f"First catalog for {new['schoolYear']}: {len(new['courses'])} core courses."
    o = {c["id"]: c for c in old["courses"]}
    n = {c["id"]: c for c in new["courses"]}
    lines = [f"**{old['schoolYear']} → {new['schoolYear']}**: {len(o)} → {len(n)} core courses."]
    added = [n[i]["title"] for i in n if i not in o]
    removed = [o[i]["title"] for i in o if i not in n]
    if added:
        lines.append("\n**New courses**\n" + "\n".join(f"- {t}" for t in added))
    if removed:
        lines.append("\n**Courses no longer listed** (students keep these subjects, their notes and cards)\n"
                     + "\n".join(f"- {t}" for t in removed))
    changed = []
    for i in n:
        if i not in o:
            continue
        a = {s["code"]: s for s in o[i]["sections"]}
        b = {s["code"]: s for s in n[i]["sections"]}
        diffs = [f"added {c} ({b[c]['level'] or 'no level'})" for c in b if c not in a]
        diffs += [f"removed {c}" for c in a if c not in b]
        for c in a.keys() & b.keys():
            for f in ("level", "track", "grades", "name"):
                if a[c][f] != b[c][f]:
                    diffs.append(f"{c} {f}: {a[c][f]} → {b[c][f]}")
        if o[i]["prerequisite"] != n[i]["prerequisite"]:
            diffs.append(f"prerequisite: {o[i]['prerequisite']} → {n[i]['prerequisite']}")
        if diffs:
            changed.append(f"- {n[i]['title']}: " + "; ".join(diffs))
    if changed:
        lines.append("\n**Changed sections**\n" + "\n".join(changed))
    if not (added or removed or changed):
        lines.append("\nNo course or section changes.")
    return "\n".join(lines)


def dump(catalog, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=1, ensure_ascii=False)
        f.write("\n")
