"""Reviewed rules for reading the Conestoga Program of Studies.

Every exception to the normal layout lives here, with the reason. The parser fails on anything it
cannot account for, so a new quirk in next year's PDF stops the update until a person adds a rule
for it. Nothing is silently dropped or guessed.
"""

# Department headers at the top of pages. Pages without a header continue the previous department.
DEPARTMENT_HEADERS = {
    "english": "English",
    "social studies": "Social Studies",
    "mathematics": "Mathematics",
    "science": "Science",
    "world languages": "World Languages",
    "wellness/fitness": "Wellness/Fitness",
    "business": "Business",
    "technology/engineering": "Technology/Engineering",
    "technology/engineering/": "Technology/Engineering",
    "visual and performing arts": "Visual and Performing Arts",
    "visual & performing arts": "Visual and Performing Arts",
    "individualized learning": "Individualized Learning",
    "experiential learning": "Experiential Learning",
    "experiential learning opportunities": "Experiential Learning",
}
# Course pages end here; later pages are clubs and the planning sheet.
END_HEADERS = {"extracurricular activities"}

CORE_DEPARTMENTS = ["English", "Social Studies", "Mathematics", "Science", "World Languages"]

# Credit areas from the glossary that count toward a core requirement, and the department they belong to.
CORE_AREAS = {
    "LF": "English", "LC": "English", "AV": "English", "EN": "English",
    "UH": "Social Studies", "WH": "Social Studies", "GV": "Social Studies",
    "MA": "Mathematics",
    "BI": "Science", "SC": "Science",
    "WL": "World Languages",
}
ALL_AREAS = set(CORE_AREAS) | {"PE", "TE", "VP", "AH", "BU", "CC", "EL", "FC", "PF", "HF"}

# Parenthetical notes on a section's code line, e.g. "2050 (H*) MA (Pre-BC Calculus)".
# Value: the track the note means, or None if it is informational. Unknown notes fail the build.
NOTE_RULES = {
    "Pre-BC Calculus": "BC",
    "Pre-AB Calculus": "AB",
    "Pre-Calculus": None,  # Math Analysis Accelerated: the standard (non-track) version
}

# What each track leads to, summarised from the Algebra 2 and Math Analysis descriptions.
TRACK_NOTES = {
    ("Algebra 2", "BC"): "Compacted track toward AP Calculus BC",
    ("Algebra 2", "AB"): "Toward Calculus (H) or AP Calculus AB",
    ("Math Analysis", "BC"): "Compacted track toward AP Calculus BC",
    ("Math Analysis", "AB"): "Toward Calculus (H) or AP Calculus AB",
}

# Courses that list two sections at the same level and track without saying how they differ.
# Students pick the code on their schedule; the app says so. Key: (course title, level).
REVIEWED_DUPLICATE_LEVELS = {
    ("Literary Foundations", "X"): "0301 and 0311, both Accelerated; the PDF does not distinguish them",
    ("American Voices", "X"): "0321 and 0331, both Accelerated; the PDF does not distinguish them",
}

# Sections whose code line has no credit area in the PDF. Key: section code.
AREA_OVERRIDES = {
    "4250": ["WL", "EL"],  # AP Latin 4: the PDF omits the area; same as the other Latin courses
}

# Titles the PDF layout splits or merges oddly.
TITLE_FIXES = {"Economics": "US Government and Politics / Economics"}
SECTION_NAME_FIXES = {"1700": "AP US Government and Politics"}

# Prerequisites must name real courses; these names appear in prerequisites but not as course titles.
EXTRA_PREREQUISITE_NAMES = {"AP Physics C: Mechanics", "AP Spanish Language 4-5"}

# Courses every Program of Studies is expected to have. If one goes missing the layout has probably
# changed, so the update stops instead of publishing a catalog without, say, Biology.
ANCHOR_COURSES = [
    "Literary Foundations", "American Voices", "Language and Composition", "World History",
    "United States History", "US Government and Politics / Economics", "Algebra 1", "Geometry",
    "Algebra 2", "Biology", "Chemistry 1", "Physics", "Spanish 1", "French 1",
]
