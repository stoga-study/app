// v1.9.3: an optional survey card on Home after a test has passed; answering or "Not now" hides it for good.
// (The first-week survey needs a week-old account; when it's due is unit tested.)
import path from "node:path";
import { admin, APP, ok, run, SHOTS, until, waitForDeploy } from "./harness.mjs";

if (!APP.startsWith("http://localhost")) await waitForDeploy("Did Stoga.study help you prepare?");
await run("surveys", async ({ p, uid, wh }) => {
  const twoDaysAgo = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() - 2 * 86400_000));
  await admin.from("events").insert({ user_id: uid, subject_id: wh.id, kind: "test", title: "Unit 3 test", due_on: twoDaysAgo });
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  const card = p.getByRole("region", { name: /How did Unit 3 test go/ });
  await card.waitFor({ timeout: 15000 });
  ok("a survey about the test appears on Home, by name", true);
  await card.getByRole("button", { name: "Answer" }).click();
  await card.getByRole("radio", { name: "4" }).click();
  await card.getByRole("radio", { name: "A little" }).click();
  await card.screenshot({ path: path.join(SHOTS, "survey-card.png") });
  await card.getByRole("button", { name: "Send" }).click();
  const row = await until(async () => (await admin.from("survey_responses").select("answers, dismissed").eq("user_id", uid).eq("survey_id", "first-test").maybeSingle()).data);
  ok("answers saved", row?.answers?.ready === 4 && row.answers.helped === "A little" && row.dismissed === false);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  ok("and it's gone", (await p.getByRole("region", { name: /How did Unit 3 test go/ }).count()) === 0);

  // "Not now" hides it for good too.
  await admin.from("survey_responses").delete().eq("user_id", uid);
  await p.reload({ waitUntil: "networkidle" });
  await p.getByRole("region", { name: /How did Unit 3 test go/ }).getByRole("button", { name: "Not now" }).click();
  ok("Not now is remembered", !!(await until(async () => (await admin.from("survey_responses").select("dismissed").eq("user_id", uid).eq("survey_id", "first-test").maybeSingle()).data?.dismissed)));
}, { width: 390, height: 844 });
