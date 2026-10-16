// Keyboard shortcuts: which key does what, and when to stay out of the way. Pure, unit tested.

/** Typing somewhere (a field, a text area, an editable note, a menu): shortcuts stay off. */
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox'], [role='combobox']");
}

/** "G" then a letter jumps to a page. */
export const GO: Record<string, { path: string; label: string }> = {
  h: { path: "/", label: "Home" },
  c: { path: "/calendar", label: "Calendar" },
  r: { path: "/review", label: "Review" },
  p: { path: "/progress", label: "Progress" },
  u: { path: "/upload", label: "Upload" },
  t: { path: "/tutor", label: "Tutor" },
  o: { path: "/coach", label: "Coach" },
  s: { path: "/settings", label: "Settings" },
};

/** A multiple-choice key (A to D, or 1 to 4) as an option index, or null. */
export function choiceKey(key: string, options: number) {
  const k = key.toLowerCase();
  const i = k >= "a" && k <= "d" && k.length === 1 ? k.charCodeAt(0) - 97 : /^[1-4]$/.test(k) ? Number(k) - 1 : -1;
  return i >= 0 && i < options ? i : null;
}

export const HELP: { area: string; keys: [string, string][] }[] = [
  { area: "Anywhere", keys: [["/", "Search"], ["?", "Show these shortcuts"], ...Object.entries(GO).map(([k, v]) => [`G then ${k.toUpperCase()}`, v.label] as [string, string])] },
  { area: "Reviewing cards", keys: [["Space", "Flip the card"], ["1 to 4", "Again, Hard, Good, Easy"]] },
  { area: "Quizzes", keys: [["A to D or 1 to 4", "Choose an answer"], ["Enter", "Check, then continue"], ["H", "Show a hint"]] },
  { area: "Practice tests", keys: [["A to D", "Choose an answer"], ["← →", "Previous and next question"]] },
];
