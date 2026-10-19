// v1.9.1: the ideas board. Suggestions are private until approved; then everyone can vote (once); 3 a day; students
// can't approve or restyle requests themselves.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { admin, APP, ok, otherStudent, run, SHOTS, until, waitForDeploy } from "./harness.mjs";

const local = Object.fromEntries(fs.readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
if (!APP.startsWith("http://localhost")) await waitForDeploy("Suggestions show up once the team has checked them");

await run("requests", async ({ p, uid }) => {
  await p.goto(`${APP}/requests`, { waitUntil: "networkidle" });
  await p.getByLabel("Your idea, in a few words").fill("A week view in the calendar");
  await p.getByLabel("Details (optional)").fill("So I can see the whole week at once.");
  await p.getByRole("button", { name: "Suggest", exact: true }).click();
  const req = await until(async () => (await admin.from("feature_requests").select("id, status").eq("user_id", uid).maybeSingle()).data);
  ok("suggestion saved, waiting for review", req?.status === "review");
  await p.getByText("Waiting for review").first().waitFor();
  ok("the author sees it as waiting", true);

  const other = await otherStudent("requests-b", { width: 1280, height: 900 });
  try {
    await other.p.goto(`${APP}/requests`, { waitUntil: "networkidle" });
    await other.p.getByRole("heading", { name: "Ideas board" }).waitFor();
    ok("nobody else sees it before review", (await other.p.getByText("A week view in the calendar").count()) === 0);

    // The team approves it (what the dashboard's Approve does).
    await admin.from("feature_requests").update({ status: "open" }).eq("id", req.id);
    await other.p.reload({ waitUntil: "networkidle" });
    await other.p.getByText("A week view in the calendar").waitFor({ timeout: 10000 });
    ok("approved: everyone sees it, with no name", !(await other.p.locator("main").innerText()).includes("Test"));
    await other.p.getByRole("button", { name: "Vote for A week view in the calendar" }).click();
    ok("a vote counts", !!(await until(async () => (await admin.from("feature_votes").select("user_id").eq("request_id", req.id)).data.length === 1)));
    await other.p.screenshot({ path: path.join(SHOTS, "requests-desktop.png"), fullPage: true });
    await other.p.getByRole("button", { name: "Take back your vote for A week view in the calendar" }).click();
    ok("and can be taken back", !!(await until(async () => (await admin.from("feature_votes").select("user_id").eq("request_id", req.id)).data.length === 0)));

    // A student can't approve or mark things themselves, straight against the database.
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: (await admin.auth.admin.getUserById(other.uid)).data.user.email });
    const db = createClient(local.VITE_SUPABASE_URL, local.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    await db.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
    const forged = await db.from("feature_requests").insert({ title: "Approve me", status: "shipped" });
    const restyle = await db.from("feature_requests").update({ status: "shipped" }).eq("id", req.id).select();
    ok("students can't set a status", !!forged.error && (restyle.error || !restyle.data?.length) && (await admin.from("feature_requests").select("status").eq("id", req.id).single()).data.status === "open");
  } finally {
    await other.cleanup();
  }

  // Three a day.
  for (const t of ["Dark mode for the review pack", "Bigger quiz buttons"]) {
    await p.getByLabel("Your idea, in a few words").fill(t);
    await p.getByRole("button", { name: "Suggest", exact: true }).click();
    await p.waitForTimeout(1200);
  }
  await p.getByLabel("Your idea, in a few words").fill("A fourth idea today");
  await p.getByRole("button", { name: "Suggest", exact: true }).click();
  await p.getByText("That's 3 suggestions today").waitFor({ timeout: 8000 }).then(() => ok("a fourth suggestion in a day is refused", true), () => ok("a fourth suggestion in a day is refused", false));
  // Deleting the test account keeps its suggestions (without a name), so remove them here.
  await admin.from("feature_requests").delete().eq("user_id", uid);
}, { width: 390, height: 844, expectErrors: /status of 400/ }); // the refused fourth suggestion
