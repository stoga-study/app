// Bring back an export (Settings > Your data). The server adds what's missing and never changes or
// removes anything already in the account (see supabase/functions/restore).
import { EXPORT_FORMAT, type ExportData } from "./exportData";
import { STORAGE_TYPES } from "./queries/sources";
import { supabase } from "./supabase";

type Row = Record<string, unknown>;
export type Backup = { data: ExportData; files: Map<string, Blob> };
export type BackupSummary = { exportedAt: string; classes: number; files: number; originals: number; cards: number; notes: number; events: number };

export class BackupError extends Error {}

/** Read a backup: the zip from Download my data, or its data.json on its own. */
export async function readBackup(file: File): Promise<Backup> {
  let data: unknown;
  const files = new Map<string, Blob>();
  if (/\.zip$/i.test(file.name) || file.type.includes("zip")) {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(file).catch(() => { throw new BackupError("That zip couldn't be opened."); });
    const json = zip.file("data.json");
    if (!json) throw new BackupError("This zip isn't a Stoga.study backup (it has no data.json).");
    data = JSON.parse(await json.async("string"));
    const d = data as ExportData;
    for (const [id, name] of Object.entries(d.files ?? {})) {
      const f = zip.file(name);
      if (f) files.set(id, await f.async("blob"));
    }
  } else {
    try { data = JSON.parse(await file.text()); } catch { throw new BackupError("That file isn't a Stoga.study backup."); }
  }
  const d = data as ExportData;
  if (!d || d.format !== EXPORT_FORMAT) throw new BackupError("That file isn't a Stoga.study backup.");
  if (d.version > 1) throw new BackupError("This backup is from a newer version of Stoga.study. Reload the app and try again.");
  for (const k of ["subjects", "units", "sources", "pages", "notes_sections", "guide_sections", "key_terms", "summaries", "cards", "quizzes", "quiz_questions", "student_notes", "events", "event_units", "goals"] as const) {
    if (!Array.isArray(d[k])) (d as Record<string, unknown>)[k] = [];
  }
  return { data: d, files };
}

export function summarize(b: Backup): BackupSummary {
  const d = b.data;
  return { exportedAt: d.exported_at, classes: d.subjects.length, files: d.sources.length, originals: b.files.size, cards: d.cards.filter((c) => !c.hidden).length, notes: d.student_notes.length, events: d.events.length };
}

async function call<T>(body: Row): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("restore", { body });
  if (error || !data) throw error ?? new Error("restore_failed");
  return data;
}

const storageName = (name: string) => name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-120) || "file";

/** Restore a backup, step by step. Returns how many things were added and how many couldn't be. */
export async function restoreBackup(b: Backup, userId: string, onStep: (s: string) => void): Promise<{ added: number; skipped: number; existed: number }> {
  const d = b.data;
  let added = 0, skipped = 0, existed = 0;
  onStep("Your classes");
  const cls = await call<{ subjects: Record<string, string>; units: Record<string, string>; added: number; skipped: number }>({ action: "classes", subjects: d.subjects, units: d.units, goals: d.goals });
  added += cls.added; skipped += cls.skipped;

  const sources: Record<string, string> = {};
  const of = <T extends Row>(rows: T[], id: unknown) => rows.filter((r) => r.source_id === id);
  for (let i = 0; i < d.sources.length; i++) {
    const src = d.sources[i];
    const subjectId = cls.subjects[String(src.subject_id)];
    if (!subjectId) { skipped++; continue; }
    onStep(`Files (${i + 1} of ${d.sources.length})`);
    const quizzes = of(d.quizzes, src.id);
    const quizIds = new Set(quizzes.map((q) => q.id));
    const r = await call<{ source_id: string | null; existed: boolean; added: number; skipped: number }>({
      action: "source", source: src, subject_id: subjectId, unit_id: src.unit_id ? cls.units[String(src.unit_id)] ?? null : null,
      pages: of(d.pages, src.id), notes_sections: of(d.notes_sections, src.id), guide_sections: of(d.guide_sections, src.id),
      key_terms: of(d.key_terms, src.id), summaries: of(d.summaries, src.id), cards: of(d.cards, src.id), quizzes,
      quiz_questions: d.quiz_questions.filter((q) => quizIds.has(q.quiz_id)),
    });
    if (r.source_id) sources[String(src.id)] = r.source_id;
    if (r.existed) { existed++; continue; }
    added += r.added; skipped += r.skipped;
    // The original file, if the backup has it.
    const blob = b.files.get(String(src.id));
    if (blob && r.source_id) {
      const path = `${userId}/${r.source_id}/${storageName(String(src.original_filename || src.filename || "file"))}`;
      // Files come out of the zip without a type, and an upload takes the type from the file itself;
      // the store only accepts the kinds the app reads.
      const type = STORAGE_TYPES[src.kind as keyof typeof STORAGE_TYPES] ?? "text/plain";
      const up = await supabase.storage.from("sources").upload(path, new Blob([blob], { type }), { upsert: true, contentType: type });
      if (!up.error) await supabase.from("sources").update({ storage_path: path }).eq("id", r.source_id);
      else skipped++;
    }
  }

  onStep("Your notes, cards and calendar");
  const loose = d.cards.filter((c) => !c.source_id || !sources[String(c.source_id)]);
  const rest = await call<{ added: number; skipped: number }>({ action: "rest", subjects: cls.subjects, units: cls.units, sources, cards: loose, student_notes: d.student_notes, events: d.events, event_units: d.event_units });
  added += rest.added; skipped += rest.skipped;
  return { added, skipped, existed };
}
