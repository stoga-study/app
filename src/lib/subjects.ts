// Common classes to pick from during onboarding. Students can add their own name too.
export const SUBJECT_PRESETS: { name: string; area: string }[] = [
  { name: "AP Statistics", area: "Math" },
  { name: "AP Calculus AB", area: "Math" },
  { name: "Honors Algebra 2", area: "Math" },
  { name: "Honors Anatomy", area: "Science" },
  { name: "AP Biology", area: "Science" },
  { name: "Honors Chemistry", area: "Science" },
  { name: "Physics", area: "Science" },
  { name: "English 10", area: "English" },
  { name: "AP Language", area: "English" },
  { name: "AP US History", area: "History" },
  { name: "World History", area: "History" },
  { name: "Spanish 3", area: "World language" },
  { name: "French 2", area: "World language" },
  { name: "Intro to Computer Science", area: "Tech" },
];

// Subject tones: burgundy shades only (Brand Guidelines p. 6). Index matches subjects.color_index.
export const SUBJECT_TILE = ["", "t2", "t3", "t4"] as const;
