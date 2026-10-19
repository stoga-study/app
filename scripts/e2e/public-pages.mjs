// v1.9.5: /updates and /known-issues are public: they work signed out, on phones and computers, and pass axe.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { admin, APP, ok, SHOTS, waitForDeploy } from "./harness.mjs";

if (!APP.startsWith("http://localhost")) await waitForDeploy("What we know isn't working yet");
const log = JSON.parse(fs.readFileSync(new URL("../../public/changelog.json", import.meta.url), "utf8"));
const latest = log.releases[0];
const axe = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

const open = (await admin.from("known_issues").insert({ title: "E2E: photos from some phones read sideways", body: "Test issue.", workaround: "Rotate the photo before uploading." }).select().single()).data;
const fixed = (await admin.from("known_issues").insert({ title: "E2E: a fixed test issue", status: "fixed", fixed_in: "1.9.4", fixed_at: new Date().toISOString() }).select().single()).data;
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  for (const [name, w, h] of [["phone", 390, 844], ["desktop", 1280, 900]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(`${APP}/updates`, { waitUntil: "networkidle" });
    await p.getByRole("heading", { name: latest.title }).first().waitFor({ timeout: 15000 });
    ok(`${name}: updates work signed out, newest first`, !p.url().includes("welcome") && !p.url().includes("sign-in"));
    await p.screenshot({ path: path.join(SHOTS, `updates-${name}.png`) });
    await p.goto(`${APP}/known-issues`, { waitUntil: "networkidle" });
    await p.getByText("E2E: photos from some phones read sideways").waitFor({ timeout: 15000 });
    const text = await p.locator("main").innerText();
    ok(`${name}: known issues show open ones with the workaround, and recent fixes`, text.includes("Rotate the photo before uploading.") && text.includes("E2E: a fixed test issue") && text.includes("version 1.9.4"));
    await p.screenshot({ path: path.join(SHOTS, `known-issues-${name}.png`), fullPage: true });
    if (name === "desktop") {
      for (const route of ["/updates", "/known-issues"]) {
        await p.goto(`${APP}${route}`, { waitUntil: "networkidle" });
        await p.addScriptTag({ content: axe });
        const bad = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id));
        ok(`${route}: no serious accessibility problems${bad.length ? ` (${bad.join(", ")})` : ""}`, bad.length === 0);
      }
    }
    ok(`${name}: no page errors`, errs.length === 0);
  }
} finally {
  await b.close();
  await admin.from("known_issues").delete().in("id", [open.id, fixed.id]);
}
