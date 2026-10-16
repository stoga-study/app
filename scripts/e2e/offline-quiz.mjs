// v1.6.1: take a quiz with no connection, then reconnect: the attempt and mistakes sync.
import { admin, APP, ok, run, until, waitForDeploy } from "./harness.mjs";
await waitForDeploy("changes will sync");
await run("offline", async ({ p, uid, wh }) => {
  const src = (await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, filename: "Cells", kind: "text", bytes: 1, page_count: 1, status: "ready" }).select().single()).data;
  const qz = (await admin.from("quizzes").insert({ user_id: uid, source_id: src.id, subject_id: wh.id, title: "Cells quiz" }).select().single()).data;
  const qs = (await admin.from("quiz_questions").insert([0, 1, 2].map((i) => ({ user_id: uid, quiz_id: qz.id, position: i, prompt: `Question ${i}?`, options: ["Right", "Wrong", "No", "Nope"], answer_index: 0, explanation: "x", pages: [1] }))).select("id")).data;
  // Online first: Home, so the app saves recent quizzes ahead of time, without opening this one.
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(8000);
  await p.context().setOffline(true);
  await p.evaluate((id) => { history.pushState({}, "", `/quiz/${id}`); dispatchEvent(new PopStateEvent("popstate")); }, qz.id);
  await p.getByText("Question 0?").waitFor({ timeout: 15000 });
  for (let i = 0; i < 3; i++) {
    await p.getByRole("radio", { name: i === 0 ? /Wrong/ : /Right/ }).click();
    await p.getByRole("button", { name: "Check answer" }).click();
    await p.getByRole("button", { name: i < 2 ? "Continue" : "See results" }).click();
  }
  ok("finished the quiz offline", await p.getByText(/2\s*\/\s*3|2 of 3|67%/).first().isVisible().catch(() => false));
  ok("offline banner counts what's waiting", await p.getByText(/will sync when you reconnect/).isVisible());
  ok("nothing reached the server yet", (await admin.from("quiz_attempts").select("id").eq("user_id", uid)).data.length === 0);
  await p.context().setOffline(false);
  await p.evaluate(() => dispatchEvent(new Event("online")));
  const att = await until(async () => (await admin.from("quiz_attempts").select("correct, total, finished_at").eq("user_id", uid).maybeSingle()).data?.finished_at ? (await admin.from("quiz_attempts").select("correct, total, finished_at").eq("user_id", uid).single()).data : null, 30000);
  ok(`synced on reconnect (${att?.correct}/${att?.total})`, !!att && att.correct === 2 && att.total === 3);
  const mist = (await admin.from("mistakes").select("question_id").eq("user_id", uid).is("resolved_at", null)).data;
  ok("the wrong answer is in mistake review", mist.length === 1 && qs.some((q) => q.id === mist[0].question_id));
}, { expectErrors: /ERR_INTERNET_DISCONNECTED|Failed to fetch|Load failed/ });
