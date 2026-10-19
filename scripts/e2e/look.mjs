// Screenshots of chosen screens with the example student, light and dark, for design work.
//   E2E_APP=http://localhost:5199 node scripts/e2e/look.mjs <outdir> [phone|desktop] [screen,screen,...]
// Screens: home, class, review, quiz, calendar, progress, settings, tutor, coach, cards, upload, plans, exam, source, search, groups
import fs from "node:fs";
import path from "node:path";
import { APP, run } from "./harness.mjs";
import { seedSample } from "./sample.mjs";

const OUT = process.argv[2] ?? "look";
const desktop = process.argv[3] === "desktop";
const pick = (process.argv[4] ?? "home,class,review,quiz,calendar").split(",");
fs.mkdirSync(OUT, { recursive: true });

await run("look", async ({ p, uid, wh }) => {
  const s = await seedSample(uid, wh);
  const routes = {
    home: "/", class: `/subjects/${wh.id}`, review: `/review/session?subject=${wh.id}`, quiz: `/quiz/${s.qz.id}`, calendar: "/calendar",
    progress: "/progress", settings: "/settings", tutor: "/tutor", coach: "/coach", cards: `/subjects/${wh.id}/cards`, upload: "/upload",
    plans: "/plans", whatsnew: "/whats-new", donate: "/donate", changelog: "/changelog", exam: `/exam/${s.ev[0].id}`, source: `/sources/${s.src.id}`, search: "/search?q=sampling", groups: "/groups", review_home: "/review",
  };
  for (const scheme of ["light", "dark"]) {
    await p.emulateMedia({ colorScheme: scheme });
    for (const name of pick) {
      await p.goto(APP + routes[name], { waitUntil: "networkidle" });
      await p.waitForTimeout(1000);
      if (name === "review") await p.getByRole("button", { name: "Show answer" }).click().catch(() => {});
      if (name === "quiz") {
        await p.getByRole("button", { name: /^B\s*6/ }).first().click().catch(() => {});
        await p.getByRole("button", { name: "Check answer" }).click().catch(() => {});
      }
      await p.waitForTimeout(500);
      await p.screenshot({ path: path.join(OUT, `${name}-${scheme}.png`), fullPage: !desktop });
    }
  }
  console.log("shots in", OUT);
}, desktop ? { width: 1440, height: 900 } : { width: 390, height: 844, scale: 2 });
