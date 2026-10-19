// v1.8.11: support access. A student makes a private link in Settings; someone without an account sees a read-only
// summary (never notes, files, chats or cards); opens are counted; turning the link off stops it.
import path from "node:path";
import { chromium } from "playwright-core";
import { admin, APP, ok, run, SHOTS, until, waitForDeploy } from "./harness.mjs";
import { seedSample } from "./sample.mjs";

if (!APP.startsWith("http://localhost")) await waitForDeploy("Who is it for?");
await run("support", async ({ p, uid, wh }) => {
  await seedSample(uid, wh);
  await admin.from("student_notes").insert({ id: crypto.randomUUID(), user_id: uid, subject_id: wh.id, title: "Private diary of feelings", body: "secret" });
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP });
  await p.goto(`${APP}/settings#support`, { waitUntil: "networkidle" });
  const box = p.locator("#support");
  await box.getByPlaceholder("e.g. Mom, or Ms. Rivera").fill("Mom");
  await box.getByRole("button", { name: "Make a link" }).click();
  const link = await until(async () => (await admin.from("support_links").select("id, token, views").eq("user_id", uid).maybeSingle()).data);
  ok("link made", !!link);
  await box.getByText("Not opened yet").waitFor();
  await box.screenshot({ path: path.join(SHOTS, "support-settings.png") });

  // Someone without an account opens it, on a phone and on a computer.
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  try {
    for (const [name, w, h] of [["phone", 390, 844], ["desktop", 1280, 900]]) {
      const v = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: name === "phone" ? 2 : 1 })).newPage();
      await v.goto(`${APP}/support/${link.token}`, { waitUntil: "networkidle" });
      await v.getByRole("heading", { name: "How Ava's studying is going" }).waitFor({ timeout: 20000 });
      await v.screenshot({ path: path.join(SHOTS, `support-view-${name}.png`), fullPage: true });
      if (name === "phone") {
        const text = await v.locator("main").innerText();
        ok("shows classes and what's coming up", text.includes("AP Statistics") && text.includes("AP Statistics midterm") && text.includes("Read chapter 7"));
        ok("never shows notes, files or cards", !text.includes("Private diary") && !text.includes("Sampling distributions notes") && !text.includes("central limit theorem"));
        ok("no sign-in needed", !v.url().includes("welcome") && !v.url().includes("sign-in"));
      }
      await v.context().close();
    }
    ok("opens are counted", ((await admin.from("support_links").select("views").eq("id", link.id).single()).data.views) >= 2);

    // Turning it off stops it.
    await p.reload({ waitUntil: "networkidle" });
    await box.getByRole("button", { name: "Turn off" }).first().click();
    await box.getByRole("button", { name: "Turn off" }).last().click();
    ok("turned off", !!(await until(async () => (await admin.from("support_links").select("revoked_at").eq("id", link.id).single()).data.revoked_at)));
    const v = await (await b.newContext()).newPage();
    await v.goto(`${APP}/support/${link.token}`, { waitUntil: "networkidle" });
    ok("a turned-off link stops working", !!(await v.getByRole("heading", { name: "This link doesn't work anymore" }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false)));
  } finally {
    await b.close();
  }
}, { width: 1280, height: 900 });
