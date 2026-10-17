import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));
const { readBackup, summarize, BackupError } = await import("./restoreData");

const data = { format: "stoga-study-export", version: 1, exported_at: "2026-10-16T12:00:00Z", subjects: [{ id: "s" }], sources: [{ id: "a" }], cards: [{ hidden: false }, { hidden: true }], events: [] };

describe("readBackup", () => {
  it("reads data.json on its own, filling anything missing", async () => {
    const b = await readBackup(new File([JSON.stringify(data)], "data.json", { type: "application/json" }));
    expect(b.data.goals).toEqual([]);
    expect(summarize(b)).toMatchObject({ classes: 1, files: 1, cards: 1, notes: 0, originals: 0 });
  });

  it("reads the zip, with the original files", async () => {
    const zip = new JSZip();
    zip.file("data.json", JSON.stringify({ ...data, files: { a: "files/cells.txt" } }));
    zip.file("files/cells.txt", "Cells make ATP.");
    const blob = await zip.generateAsync({ type: "arraybuffer" });
    const b = await readBackup(new File([blob], "stoga-study-2026-10-16.zip", { type: "application/zip" }));
    expect(await b.files.get("a")?.text()).toBe("Cells make ATP.");
  });

  it("refuses other files and newer versions", async () => {
    await expect(readBackup(new File(["{}"], "x.json"))).rejects.toBeInstanceOf(BackupError);
    await expect(readBackup(new File(["not json"], "x.json"))).rejects.toBeInstanceOf(BackupError);
    await expect(readBackup(new File([JSON.stringify({ ...data, version: 2 })], "x.json"))).rejects.toThrow(/newer version/);
    const zip = await new JSZip().file("notes.md", "x").generateAsync({ type: "arraybuffer" });
    await expect(readBackup(new File([zip], "x.zip"))).rejects.toThrow(/no data.json/);
  });
});
