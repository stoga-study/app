// v1.6.5: axe accessibility checks over every main screen, light and dark. Lists serious and critical problems.
import { admin, APP, ok, run } from "./harness.mjs";
import fs from "node:fs";
import { createRequire } from "node:module";
const axeSource = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

await run("a11y", async ({ p, uid, wh }) => {
  const src = (await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, filename: "Cells", kind: "text", bytes: 1, page_count: 1, status: "ready" }).select().single()).data;
  await admin.from("source_pages").insert({ user_id: uid, source_id: src.id, page_no: 1, text: "Cells make ATP." });
  await admin.from("cards").insert({ user_id: uid, subject_id: wh.id, source_id: src.id, front: "What makes ATP?", back: "Mitochondria" });
  const qz = (await admin.from("quizzes").insert({ user_id: uid, source_id: src.id, subject_id: wh.id, title: "Cells quiz" }).select().single()).data;
  await admin.from("quiz_questions").insert({ user_id: uid, quiz_id: qz.id, position: 0, prompt: "What makes ATP?", options: ["Mitochondria", "Nucleus", "Ribosome", "Wall"], answer_index: 0, explanation: "x", pages: [1] });
  const ev = (await admin.from("events").insert({ user_id: uid, subject_id: wh.id, kind: "test", title: "Cells test", due_on: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10) }).select().single()).data;
  const g = (await admin.from("groups").insert({ owner_id: uid, name: "AP Bio", code: "AXTEST" + "ABCDEFGH"[Date.now() % 8] + "Z" }).select().single()).data;
  await admin.from("group_members").insert({ group_id: g.id, user_id: uid, display_name: "Test" });
  const gs = (await admin.from("group_sets").insert({ group_id: g.id, source_id: src.id, shared_by: uid }).select().single()).data;
  const link = (await admin.from("share_links").insert({ user_id: uid, source_id: src.id, token: `axtest${Date.now()}abcdefghijk` }).select().single()).data;
  const screens = ["/groups", `/groups/${g.id}`, `/groups/${g.id}/sets/${gs.id}`, `/s/${link.token}`, "/", "/subjects", `/subjects/${wh.id}`, `/sources/${src.id}`, "/calendar", "/calendar?view=plan", `/exam/${ev.id}`, "/coach", "/coach/customize", "/progress", "/review", `/quiz/${qz.id}`, "/upload", "/search?q=cells", "/settings", "/changelog", "/tutor", "/privacy"];
  const all = new Map();
  for (const theme of ["light", "dark"]) {
    await p.evaluate((t) => localStorage.setItem("stoga-theme", t), theme);
    for (const path of screens) {
      await p.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      await p.waitForTimeout(800);
      await p.addScriptTag({ content: axeSource });
      const res = await p.evaluate(async () => {
        const r = await axe.run(document, { resultTypes: ["violations"] });
        return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} :: ${(n.failureSummary || "").split("\n").slice(1, 2).join(" ").slice(0, 160)}`) }));
      });
      for (const v of res) {
        const key = `${v.id}`;
        const entry = all.get(key) ?? { ...v, where: new Set() };
        entry.where.add(`${theme} ${path}`);
        all.set(key, entry);
      }
    }
  }
  for (const v of all.values()) console.log(`\n[${v.impact}] ${v.id}: ${v.help}\n  on: ${[...v.where].slice(0, 6).join(", ")}${v.where.size > 6 ? ` (+${v.where.size - 6})` : ""}\n  ${v.nodes.join("\n  ")}`);
  ok(`no serious or critical problems (${all.size} kinds found)`, all.size === 0);
  // The Motion switch: on, it marks the page so every animation stops.
  await p.goto(`${APP}/settings`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Reduce motion" }).click();
  await p.reload({ waitUntil: "networkidle" });
  ok("Reduce motion holds after a reload", (await p.evaluate(() => document.documentElement.dataset.motion)) === "reduce");
}, { width: 390, height: 844 });
