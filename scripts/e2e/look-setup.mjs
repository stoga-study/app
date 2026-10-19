// Screenshots of getting started (welcome, sign-in, onboarding) at phone, tablet and desktop sizes.
//   E2E_APP=http://localhost:5199 node scripts/e2e/look-setup.mjs <outdir>
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { admin, APP, run } from "./harness.mjs";

const OUT = process.argv[2] ?? "look-setup";
fs.mkdirSync(OUT, { recursive: true });
const SIZES = [["phone", 390, 844], ["ipad", 820, 1180], ["desktop", 1440, 900]];

// Signed out: welcome and sign-in.
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
for (const [n, w, h] of SIZES) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  for (const r of ["welcome", "sign-in"]) {
    await p.goto(`${APP}/${r}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, `${r}-${n}.png`) });
  }
}
await b.close();

// Signed in, not set up yet: each onboarding step.
for (const [n, w, h] of SIZES) {
  await run(`setup-${n}`, async ({ p, uid }) => {
    await admin.from("subjects").delete().eq("user_id", uid);
    await admin.from("profiles").update({ onboarded: false, graduation_year: null, first_name: null }).eq("user_id", uid);
    await p.goto(`${APP}/onboarding`, { waitUntil: "networkidle" });
    await p.getByLabel("First name").fill("Ava");
    await p.screenshot({ path: path.join(OUT, `1-name-${n}.png`) });
    await p.getByRole("button", { name: "Continue" }).click();
    await p.getByRole("radio").nth(1).click();
    await p.screenshot({ path: path.join(OUT, `2-grade-${n}.png`) });
    await p.getByRole("button", { name: /Continue as/ }).click();
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, `3-classes-${n}.png`) });
  }, { width: w, height: h });
}
console.log("shots in", OUT);
