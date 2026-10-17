// /preview/brand: both looks show five screens in the app's light or dark mode, and a vote saves (and can change).
import path from "node:path";
import { admin, APP, ok, run, SHOTS, until } from "./harness.mjs";

await run("brandvote", async ({ p, uid }) => {
  for (const scheme of ["light", "dark"]) {
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto(`${APP}/preview/brand`, { waitUntil: "networkidle" });
    await p.getByRole("heading", { name: /Help pick/ }).waitFor();
    const imgs = p.locator(".bp-phone img");
    ok(`${scheme}: five screenshots of today's look`, (await imgs.count()) === 5 && (await imgs.first().getAttribute("src")).endsWith(`-${scheme}.jpg`));
    ok(`${scheme}: the screenshots load`, await imgs.first().evaluate((i) => i.complete && i.naturalWidth > 0) || !!(await until(() => imgs.first().evaluate((i) => i.complete && i.naturalWidth > 0), 8000)));
    await p.locator(".bp-phone").first().screenshot({ path: path.join(SHOTS, `brand-current-${scheme}.png`) });
    await p.getByRole("button", { name: "New look" }).click();
    ok(`${scheme}: five screens of the new look`, (await p.locator(".bp-phone .bpn").count()) === 5);
    await p.waitForTimeout(500);
    const strip = p.locator("[role=list]");
    await strip.evaluate((el) => { el.style.overflow = "visible"; el.style.flexWrap = "wrap"; });
    await strip.screenshot({ path: path.join(SHOTS, `brand-new-${scheme}.png`) });
    ok(`${scheme}: serif loaded`, await p.evaluate(() => document.fonts.check('500 24px "Newsreader"')));
  }
  await p.emulateMedia({ colorScheme: "light" });
  await p.reload({ waitUntil: "networkidle" });
  await p.getByLabel(/The new look/).check();
  await p.getByLabel("What do you like or dislike? (optional)").fill("Easier to read");
  await p.getByRole("button", { name: "Send my vote" }).click();
  const row = await until(async () => (await admin.from("brand_votes").select("choice, comment, survey").eq("user_id", uid).maybeSingle()).data);
  ok("vote saved", row?.choice === "new" && row.comment === "Easier to read" && row.survey === "look-2026-10");
  await p.reload({ waitUntil: "networkidle" });
  await p.getByText("You voted for the new look").waitFor({ timeout: 10000 }).then(() => ok("remembered after a reload", true), () => ok("remembered after a reload", false));
  await p.getByLabel(/No preference/).check();
  await p.getByRole("button", { name: "Update my vote" }).click();
  ok("vote can change, still one row", !!(await until(async () => { const r = (await admin.from("brand_votes").select("choice").eq("user_id", uid)).data; return r.length === 1 && r[0].choice === "none"; })));
  console.log("shots in", SHOTS);
}, { width: 1280, height: 900 });
