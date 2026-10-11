import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import fs from "node:fs";
// Captures real app screens for the App Store showcase with a throwaway demo student.
// Usage (from pwa-app/, with `npm run build && npx vite preview --port 4173` running):
//   SUPABASE_SECRET_KEY=sb_secret_... node scripts/showcase/capture.mjs <work dir>
// The work dir needs demo/Week 5 Sampling.pdf and demo/Unit 3 Stoichiometry.pdf (make_demo_pdfs.py).
// The demo student and their files are deleted at the end.
import { fileURLToPath } from "node:url";
const N = process.argv[2];
const appDir = fileURLToPath(new URL("../..", import.meta.url));
const { createClient } = createRequire(appDir + "/package.json")("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://sqjggemcqpnejhkfqcev.supabase.co";
if (!process.env.SUPABASE_SECRET_KEY) throw new Error("Set SUPABASE_SECRET_KEY (Supabase dashboard, Settings, API Keys).");
const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const R = `${N}/raw`;
fs.mkdirSync(R, { recursive: true });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: `demo-${Date.now()}@example.com`, options: { redirectTo: "http://localhost:4173/" } });
const uid = link.user.id;
await admin.from("profiles").update({ onboarded: true, graduation_year: 2029, first_name: "Aarav" }).eq("user_id", uid);
const row = (name, area, catalog_id, course_code, level, color_index) => ({ user_id: uid, name, area, catalog_id, course_code, level, color_index, school_year: "2026-27" });
const { data: subs } = await admin.from("subjects").insert([
  row("American Voices", "English", "american-voices", "0320", "H", 0),
  row("Algebra 2 BC", "Mathematics", "algebra-2", "2050", "H*", 2),
  row("AP Statistics", "Mathematics", "ap-statistics", "2240", "AP", 2),
  row("Chemistry 1", "Science", "chemistry-1", "3210", "H", 3),
  row("Spanish 3", "World Languages", "spanish-3", "4330", "H", 0),
]).select();
const id = (n) => subs.find((s) => s.name === n).id;
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--disable-features=AsyncDns,DnsOverHttps"] });
const errs = [];
try {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, colorScheme: "light", reducedMotion: "reduce", isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(link.properties.action_link, { waitUntil: "networkidle" });
  await p.waitForURL((u) => u.pathname === "/");
  const clear = () => p.addStyleTag({ content: "html,body,main{background:transparent!important}" });
  const shot = async (name) => { await p.waitForTimeout(400); await p.screenshot({ path: `${R}/${name}.png` }); };

  // Chemistry upload through the real flow.
  await p.goto(`http://localhost:4173/upload?subject=${id("Chemistry 1")}`, { waitUntil: "networkidle" });
  await p.locator("input[type=file]").setInputFiles(`${N}/demo/Unit 3 Stoichiometry.pdf`);
  await p.waitForURL("**/sources/**");
  // Pasted notes for Algebra.
  await p.goto(`http://localhost:4173/upload?subject=${id("Algebra 2 BC")}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Paste text" }).click();
  await p.getByLabel("Title (optional)").fill("Logarithm rules");
  await p.getByRole("textbox", { name: "Notes", exact: true }).fill("The product rule: log(xy) = log x + log y. The quotient rule: log(x/y) = log x - log y. The power rule: log(x^n) = n log x. Change of base: log_b x = log x / log b.");
  await p.getByRole("button", { name: "Add these notes" }).click();
  await p.waitForURL("**/sources/**");

  // Stats upload, held at "Saving" for the shot.
  let release;
  const held = new Promise((r) => (release = r));
  await p.route("**/storage/v1/object/sources/**", async (route) => { await held; await route.continue(); });
  await p.goto(`http://localhost:4173/upload?subject=${id("AP Statistics")}`, { waitUntil: "networkidle" });
  await shot("upload-choose");
  await p.locator("input[type=file]").setInputFiles(`${N}/demo/Week 5 Sampling.pdf`);
  await p.getByText("Saving to your account").waitFor();
  await p.waitForTimeout(300);
  await shot("upload-saving");
  await clear();
  await p.locator(".card", { hasText: "Week 5 Sampling.pdf" }).first().screenshot({ path: `${R}/el-file.png`, omitBackground: true });
  release();
  await p.waitForURL("**/sources/**");
  await p.unroute("**/storage/v1/object/sources/**");
  await shot("source");
  await p.locator("details", { hasText: "Page 8" }).first().locator("summary").click();
  await clear();
  await p.locator("details", { hasText: "Page 8" }).first().screenshot({ path: `${R}/el-page8.png`, omitBackground: true });

  await p.goto("http://localhost:4173/", { waitUntil: "networkidle" }); await shot("home");
  await p.goto("http://localhost:4173/subjects", { waitUntil: "networkidle" }); await shot("subjects");
  await p.goto(`http://localhost:4173/subjects/${id("AP Statistics")}`, { waitUntil: "networkidle" }); await shot("subject");

  await p.goto("http://localhost:4173/classes", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Change grade" }).click();
  // Capture the card with padding so its hard bottom edge survives, with neighbours hidden and
  // every background behind it cleared so its rounded corners stay transparent.
  const grade = p.getByRole("radio", { name: /Sophomore/ });
  await grade.evaluate((node) => {
    for (const sib of node.parentElement.children) if (sib !== node) sib.style.visibility = "hidden";
    for (let a = node.parentElement; a; a = a.parentElement) { a.style.background = "transparent"; a.style.boxShadow = "none"; a.style.borderColor = "transparent"; }
  });
  const gb = await grade.boundingBox();
  await p.screenshot({ path: `${R}/el-grade.png`, omitBackground: true, clip: { x: gb.x - 10, y: gb.y - 10, width: gb.width + 20, height: gb.height + 20 } });
  await p.reload({ waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Change grade" }).click();
  await p.getByRole("radio", { name: /Sophomore/ }).click();
  await p.getByRole("button", { name: /^Algebra 2/ }).first().evaluate((el) => el.closest("li").scrollIntoView({ block: "start" }));
  await p.evaluate(() => window.scrollBy(0, -90));
  await shot("classes-algebra");
  await clear();
  await p.locator("li.card", { hasText: "Compacted track" }).first().screenshot({ path: `${R}/el-versions.png`, omitBackground: true });
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot("classes-top");

  // Signed-out sign-in with code.
  const c2 = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, colorScheme: "light", reducedMotion: "reduce" });
  await c2.route("**/auth/v1/otp**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const q = await c2.newPage();
  await q.goto("http://localhost:4173/welcome", { waitUntil: "networkidle" });
  await q.waitForTimeout(400); await q.screenshot({ path: `${R}/welcome.png` });
  await q.goto("http://localhost:4173/sign-in", { waitUntil: "networkidle" });
  await q.getByLabel("Email").fill("aarav@stoga.study");
  await q.getByRole("button", { name: "Email me a sign-in link" }).click();
  await q.getByLabel("6-digit code").fill("482913");
  await q.waitForTimeout(400); await q.screenshot({ path: `${R}/signin-code.png` });
} finally {
  const { data: files } = await admin.storage.from("sources").list(uid);
  for (const f of files ?? []) {
    const { data: inner } = await admin.storage.from("sources").list(`${uid}/${f.name}`);
    if (inner?.length) await admin.storage.from("sources").remove(inner.map((x) => `${uid}/${f.name}/${x.name}`));
  }
  await admin.auth.admin.deleteUser(uid);
  console.log("demo user removed | errors:", errs);
  await b.close();
}
