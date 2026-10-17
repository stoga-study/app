import { describe, expect, it } from "vitest";
import { parseIcs } from "./ics";
import { ankiLine, csvRow, safeName, toIcs, uniqueNamer } from "./exportFormat";

describe("export formats", () => {
  it("writes CSV that spreadsheets read back", () => {
    expect(csvRow(["a", "b,c", 'say "hi"', "two\nlines", null])).toBe('a,"b,c","say ""hi""","two\nlines",');
  });
  it("writes Anki lines", () => {
    expect(ankiLine("Q\twith tab", "line1\nline2", ["bio", "unit-4"])).toBe("Q with tab\tline1<br>line2\tbio unit-4");
  });
  it("makes safe, unique names", () => {
    expect(safeName('Unit 4: Cells / "notes"?')).toBe("Unit 4 Cells notes");
    expect(safeName("...")).toBe("untitled");
    const n = uniqueNamer();
    expect([n("Notes"), n("notes"), n("Other")]).toEqual(["Notes", "notes (2)", "Other"]);
  });
  it("writes a calendar our own importer reads back", () => {
    const ics = toIcs([
      { id: "e1", title: "Unit 4 test, cells; ch. 7", kind: "test", due_on: "2026-10-20", due_time: null, notes: "Bring\na pencil", className: "Biology" },
      { id: "e2", title: "Lab", kind: "project", due_on: "2026-10-21", due_time: "15:30:00", notes: null },
    ]);
    const back = parseIcs(ics);
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ uid: "e1@stoga.study", title: "Unit 4 test, cells; ch. 7", date: "2026-10-20", time: null, notes: "Bring\na pencil", categories: ["test", "Biology"] });
    expect(back[1]).toMatchObject({ date: "2026-10-21", time: "15:30" });
  });
});
