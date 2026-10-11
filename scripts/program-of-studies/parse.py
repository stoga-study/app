import json, re, sys

text = open(sys.argv[1], encoding="utf-8").read()
parts = re.split(r"\n=== PAGE (\d+) ===\n", text)
pages = {int(parts[i]): parts[i + 1] for i in range(1, len(parts), 2)}
DEPTS = [
    (15, 18, "Experiential Learning"), (19, 19, "Individualized Learning"), (20, 20, "Student Services"),
    (21, 21, "AP Capstone"), (22, 26, "English"), (27, 30, "Social Studies"), (31, 34, "Mathematics"),
    (35, 37, "Science"), (38, 45, "World Languages"), (46, 48, "Wellness/Fitness"),
    (49, 50, "Family and Consumer Sciences"), (51, 52, "Business"), (53, 56, "Technology/Engineering"),
    (57, 63, "Visual and Performing Arts"),
]
dept_for = lambda p: next((d for a, b, d in DEPTS if a <= p <= b), None)

GRADES_RE = re.compile(r"^Grades?\s+((?:9|10|11|12)\*?(?:\s*,\s*(?:9|10|11|12)\*?)*)")
CODE_LINE = re.compile(r"^(\d{4})\b(?:\s*\(\s*(AP|H\*|H|X|A)\s*\))?")
CODE_ANY = re.compile(r"\b(\d{4})\s*\(\s*(AP|H\*|H|X|A)\s*\)")
NOISE = re.compile(r"^(Year|(?:Semester|Quarter)(?:\s*\d)?|[\d.]+\s*credits?|\*?with .*|\((?:Lab|Course) Fee.*|[\d.]+|\*?[A-Z]{2}(\s*,\s*\*?[A-Z]{2})*)$", re.I)
AREAS = {"LC","LF","MA","PE","SC","TE","UH","VP","WH","WL","AH","AV","BI","BU","CC","EL","EN","FC","PF","GV","HF"}

def clean_title(t):
    t = re.sub(r"\*+", "", t); t = re.sub(r"\[\d+\]", "", t); t = re.sub(r"^\d{4}\s+", "", t)
    return re.sub(r"\s+", " ", t).strip(" -–\t")

def is_code(l): return bool(CODE_LINE.match(l))

courses = []
for pno in sorted(pages):
    dept = dept_for(pno)
    if not dept: continue
    nz = [l.strip() for l in pages[pno].split("\n") if l.strip()]
    grade_idx = [k for k, l in enumerate(nz) if GRADES_RE.match(l)]
    for gi, k in enumerate(grade_idx):
        raw = GRADES_RE.match(nz[k]).group(1)
        grades = sorted({int(g) for g in re.findall(r"\b(9|10|11|12)\b", raw)})
        approval = sorted({int(g) for g in re.findall(r"\b(9|10|11|12)\*", raw)})
        prev_g = grade_idx[gi - 1] if gi else -1
        nxt_g = grade_idx[gi + 1] if gi + 1 < len(grade_idx) else len(nz)
        # Walk back to the title, noting a code line directly above (code-before layout).
        code_before = None; title = None; title_j = k; j = k - 1
        while j > prev_g:
            l = nz[j]
            if is_code(l) and code_before is None and j == k - 1:
                code_before = l; j -= 1; continue
            if NOISE.match(l) or is_code(l): j -= 1; continue
            title = clean_title(l); title_j = j; break
        continuation = title is None and courses and courses[-1]["_page"] == pno
        # A course keeps one layout: codes above each "Grades" line (Algebra 2) or below it (Psychology).
        layout = courses[-1]["_layout"] if continuation else ("before" if code_before else "after")
        if layout == "after":
            code_before = None
        # Section details from the lines after "Grades", up to the next course's block.
        after = nz[k + 1:min(nxt_g, k + 6)]
        window = " ".join(nz[title_j + 1:k] + [nz[k]] + after)
        dur = re.search(r"\b(Year|Semester|Quarter)\b", window)
        cred = re.search(r"(\d*\.?\d+)\s*credits?", window, re.I)
        track = None
        if code_before:
            m = CODE_LINE.match(code_before); codes = [(m.group(1), m.group(2))]
            tm = re.search(r"\(Pre-(AB|BC) Calculus\)", code_before)
            track = tm.group(1) if tm else None
        else:
            codes = CODE_ANY.findall(" ".join(after[:4]))
            if not codes:
                codes = [(CODE_LINE.match(l).group(1), CODE_LINE.match(l).group(2)) for l in after[:4] if is_code(l)][:1]
        area_src = " ".join([code_before or ""] + [l for l in after[:4] if is_code(l) or re.fullmatch(r"\*?[A-Z]{2}(\s*,\s*\*?[A-Z]{2})*", l)])
        areas = sorted({a for a in re.findall(r"\b([A-Z]{2})\b", area_src) if a in AREAS})
        sections = [{"code": c, "level": (lv or None), "track": track, "grades": grades, "approvalGrades": approval} for c, lv in codes] or \
                   [{"code": None, "level": None, "grades": grades, "approvalGrades": approval}]
        sec_meta = {"duration": dur.group(1) if dur else None, "credits": float(cred.group(1)) if cred else None}
        if continuation:
            c = courses[-1]
            c["sections"] += sections; c["areas"] = sorted(set(c["areas"]) | set(areas))
            c["_end"] = nxt_g
            continue
        courses.append({"title": title or "?", "department": dept, "sections": sections, "areas": areas,
                        **sec_meta, "_page": pno, "_start": k, "_end": nxt_g, "_layout": layout})
    # Description + prerequisite for this page's courses: from the course's last block to the next title.
    page_courses = [c for c in courses if c["_page"] == pno]
    for ci, c in enumerate(page_courses):
        start = c["_start"] + 1
        end = page_courses[ci + 1]["_start"] - 1 if ci + 1 < len(page_courses) else len(nz)
        body = [l for l in nz[start:end] if not GRADES_RE.match(l) and not NOISE.match(l) and not is_code(l)]
        if ci + 1 < len(page_courses) and body and clean_title(body[-1]) == page_courses[ci + 1]["title"]:
            body = body[:-1]
        txt = re.sub(r"\s+", " ", " ".join(body)).replace("­ ", "").replace("­", "").strip()
        prereq = None
        pm = re.match(r"(?:Prerequisites?|Co-?requisites?):?\s*(.+?)\s+(?=(?:These|This|The|Students|In this|All|Through|Upon|Course|Using|Building|Designed)\b|[A-Z][a-z]+ [a-z])", txt)
        if pm:
            prereq = pm.group(1).strip(" .;"); txt = txt[pm.end():].strip()
        c["prerequisite"] = prereq; c["description"] = txt[:700]

out = []
for c in courses:
    grades = sorted({g for s in c["sections"] for g in s["grades"]})
    out.append({k: v for k, v in c.items() if not k.startswith("_")} | {"grades": grades, "page": c["_page"]})
json.dump(out, open(sys.argv[2], "w"), indent=1, ensure_ascii=False)
print("courses:", len(out), "| sections:", sum(len(c["sections"]) for c in out))
for c in out:
    f = []
    if c["title"] == "?" or len(c["title"]) > 60 or c["title"][:1].islower() or c["title"][:1] == "(": f.append("TITLE")
    if not any(s["code"] for s in c["sections"]): f.append("NO-CODE")
    if not c["duration"]: f.append("NO-DUR")
    if c["credits"] is None: f.append("NO-CRED")
    if f: print(c["page"], "|", c["title"][:60], "|", ",".join(f))
