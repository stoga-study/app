// Everything a student has, as one zip they can keep: readable files (Markdown, CSV, Anki, a calendar)
// and a complete data.json that Restore (Settings) can bring back. Read as the student, so only their
// own rows are ever included.
import { supabase } from "./supabase";
import { ankiLine, csvRow, safeName, toIcs, uniqueNamer } from "./exportFormat";

export const EXPORT_FORMAT = "stoga-study-export";
export const EXPORT_VERSION = 1;

type Row = Record<string, unknown>;

/** Every row of a table the student can see, a thousand at a time. */
async function all(table: string, columns = "*"): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table as never).select(columns).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

export type ExportData = {
  format: typeof EXPORT_FORMAT;
  version: number;
  exported_at: string;
  profile: Row | null;
  subjects: Row[]; units: Row[]; sources: Row[]; pages: Row[];
  notes_sections: Row[]; guide_sections: Row[]; key_terms: Row[]; summaries: Row[];
  cards: Row[]; quizzes: Row[]; quiz_questions: Row[];
  student_notes: Row[]; events: Row[]; event_units: Row[]; goals: Row[];
  /** Which file in the zip's files/ folder is each source's original (when included). */
  files?: Record<string, string>;
};

export async function collectData(onStep: (s: string) => void): Promise<ExportData> {
  onStep("Your classes and files");
  const [profile, subjects, units, sources] = await Promise.all([
    supabase.from("profiles").select("first_name, graduation_year, review_retention, tutor_depth").maybeSingle(),
    all("subjects"), all("units"), all("sources", "id, subject_id, unit_id, filename, original_filename, kind, page_count, status, tags, archived, lesson, storage_path, created_at"),
  ]);
  onStep("Pages and study sets");
  const [pages, notes_sections, guide_sections, key_terms, summaries] = await Promise.all([
    all("source_pages", "source_id, page_no, text"), all("notes_sections", "id, source_id, position, title, body_md, pages, hidden"),
    all("guide_sections", "id, source_id, position, title, body_md, minutes, pages, hidden"), all("key_terms", "id, source_id, position, term, definition, pages, hidden"),
    all("summaries", "id, source_id, body_md, hidden"),
  ]);
  onStep("Flashcards and quizzes");
  const [cards, quizzes, quiz_questions] = await Promise.all([
    all("cards", "id, subject_id, source_id, front, back, tags, pages, quote, hidden, archived, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, created_at"),
    all("quizzes", "id, subject_id, source_id, title, created_at"), all("quiz_questions", "id, quiz_id, position, prompt, options, answer_index, hint, explanation, topic, pages, quote, hidden"),
  ]);
  onStep("Your notes and calendar");
  const [student_notes, events, event_units, goals] = await Promise.all([
    all("student_notes", "id, subject_id, unit_id, source_id, title, body, created_at, updated_at"), all("events", "id, subject_id, kind, title, due_on, due_time, notes, done_at"),
    all("event_units", "event_id, unit_id"), all("goals", "id, kind, target, label, subject_id"),
  ]);
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exported_at: new Date().toISOString(), profile: profile.data, subjects, units, sources, pages, notes_sections, guide_sections, key_terms, summaries, cards, quizzes, quiz_questions, student_notes, events, event_units, goals };
}

const s = (v: unknown) => (v == null ? "" : String(v));

/** The zip: readable files per class, the calendar, optional original files, and data.json. */
export async function buildExport(opts: { includeFiles: boolean; onStep: (s: string) => void }): Promise<Blob> {
  const d = await collectData(opts.onStep);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  opts.onStep("Writing your files");
  const classNamer = uniqueNamer();
  const classDir = new Map<string, string>();
  for (const c of d.subjects) classDir.set(s(c.id), `classes/${classNamer(safeName(s(c.name), "Class"))}`);
  const dirOf = (subjectId: unknown) => classDir.get(s(subjectId)) ?? "classes/Other";
  const bySource = <T extends Row>(rows: T[], id: unknown) => rows.filter((r) => r.source_id === id && !r.hidden).sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));

  // Your own notes.
  const noteNamer = uniqueNamer();
  for (const n of d.student_notes) zip.file(`${dirOf(n.subject_id)}/my-notes/${noteNamer(safeName(s(n.title), "Untitled note"))}.md`, `# ${s(n.title) || "Untitled note"}\n\n${s(n.body)}\n`);

  // Each study set.
  const setNamer = uniqueNamer();
  for (const src of d.sources) {
    const dir = `${dirOf(src.subject_id)}/study-sets/${setNamer(safeName(s(src.filename), "File"))}`;
    const notes = bySource(d.notes_sections, src.id), guide = bySource(d.guide_sections, src.id), terms = bySource(d.key_terms, src.id);
    const summary = d.summaries.find((x) => x.source_id === src.id && !x.hidden);
    if (notes.length) zip.file(`${dir}/notes.md`, `# ${s(src.filename)}\n\n${notes.map((n) => `## ${s(n.title)}\n\n${s(n.body_md)}`).join("\n\n")}\n`);
    if (guide.length) zip.file(`${dir}/study-guide.md`, `# Study guide: ${s(src.filename)}\n\n${guide.map((g) => `## ${s(g.title)}${g.minutes ? ` (${g.minutes} min)` : ""}\n\n${s(g.body_md)}`).join("\n\n")}\n`);
    if (terms.length) zip.file(`${dir}/key-terms.md`, `# Key terms: ${s(src.filename)}\n\n${terms.map((t) => `- **${s(t.term)}**: ${s(t.definition)}`).join("\n")}\n`);
    if (summary) zip.file(`${dir}/summary.md`, `# Summary: ${s(src.filename)}\n\n${s(summary.body_md)}\n`);
    const quizzes = d.quizzes.filter((q) => q.source_id === src.id);
    if (quizzes.length) {
      zip.file(`${dir}/quizzes.json`, JSON.stringify(quizzes.map((q) => ({
        title: q.title,
        questions: d.quiz_questions.filter((x) => x.quiz_id === q.id && !x.hidden).sort((a, b) => Number(a.position) - Number(b.position))
          .map((x) => ({ question: x.prompt, options: x.options, answer: (x.options as string[])?.[Number(x.answer_index)], explanation: x.explanation, topic: x.topic, pages: x.pages })),
      })), null, 2));
    }
    const text = d.pages.filter((p) => p.source_id === src.id).sort((a, b) => Number(a.page_no) - Number(b.page_no));
    if (text.length) zip.file(`${dir}/text.md`, text.map((p) => `## Page ${p.page_no}\n\n${s(p.text)}`).join("\n\n") + "\n");
  }

  // Flashcards per class: a spreadsheet and an Anki import.
  const fileName = new Map(d.sources.map((x) => [s(x.id), s(x.filename)]));
  for (const c of d.subjects) {
    const cards = d.cards.filter((x) => x.subject_id === c.id && !x.hidden);
    if (!cards.length) continue;
    zip.file(`${dirOf(c.id)}/flashcards.csv`, [csvRow(["front", "back", "tags", "file"]), ...cards.map((x) => csvRow([x.front, x.back, ((x.tags as string[]) ?? []).join(" "), fileName.get(s(x.source_id)) ?? ""]))].join("\n") + "\n");
    zip.file(`${dirOf(c.id)}/flashcards-anki.txt`, ["#separator:tab", "#html:true", "#tags column:3", ...cards.map((x) => ankiLine(s(x.front), s(x.back), (x.tags as string[]) ?? []))].join("\n") + "\n");
  }

  // The calendar.
  if (d.events.length) {
    const className = new Map(d.subjects.map((c) => [s(c.id), s(c.name)]));
    zip.file("calendar.ics", toIcs(d.events.map((e) => ({ id: s(e.id), title: s(e.title), kind: s(e.kind), due_on: s(e.due_on), due_time: (e.due_time as string) ?? null, notes: (e.notes as string) ?? null, className: className.get(s(e.subject_id)) ?? null }))));
  }

  // The original files, if asked for.
  if (opts.includeFiles) {
    const withFiles = d.sources.filter((x) => x.storage_path);
    const namer = uniqueNamer();
    d.files = {};
    for (let i = 0; i < withFiles.length; i++) {
      const x = withFiles[i];
      opts.onStep(`Original files (${i + 1} of ${withFiles.length})`);
      const { data } = await supabase.storage.from("sources").download(s(x.storage_path));
      if (!data) continue;
      const name = `files/${namer(safeName(s(x.original_filename) || s(x.filename), "file"))}`;
      zip.file(name, data);
      d.files[s(x.id)] = name;
    }
  }

  zip.file("data.json", JSON.stringify(d));
  zip.file("README.txt", `Your Stoga.study data, exported ${new Date().toLocaleString()}.\n\nclasses/: for each class, your own notes, each study set (notes, study guide, key terms, summary, quizzes, the text of each page), and your flashcards as a spreadsheet (flashcards.csv) and for Anki (flashcards-anki.txt: in Anki, File > Import).\ncalendar.ics: your tests, quizzes and homework; import it into Google Calendar, Apple Calendar or Outlook.\nfiles/: your original files, if you chose to include them.\ndata.json: everything above in one file. In Stoga.study, Settings > Your data > Restore brings it back.\n`);
  opts.onStep("Zipping");
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
