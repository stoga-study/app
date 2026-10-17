// v1.6.4: keyboard shortcuts: ? help, / search, G then a letter, and a quiz answered from the keyboard.
import { admin, APP, ok, run } from "./harness.mjs";
await run("keys", async ({ p, uid, wh }) => {
  const qz = (await admin.from("quizzes").insert({ user_id: uid, subject_id: wh.id, title: "Cells quiz" }).select().single()).data;
  await admin.from("quiz_questions").insert([0, 1].map((i) => ({ user_id: uid, quiz_id: qz.id, position: i, prompt: `Question ${i}?`, options: ["Wrong", "Right", "No", "Nope"], answer_index: 1, explanation: "x", hint: "Think about it", pages: [1] })));
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.keyboard.press("Shift+Slash");
  ok("? opens the help sheet", await p.getByRole("dialog", { name: "Keyboard shortcuts" }).isVisible());
  await p.keyboard.press("Escape");
  ok("Escape closes it", (await p.getByRole("dialog").count()) === 0);
  await p.keyboard.press("Slash");
  await p.waitForURL(/\/search/);
  ok("/ goes to search", true);
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.keyboard.press("g");
  await p.keyboard.press("c");
  await p.waitForURL(/\/calendar/);
  ok("G then C goes to the calendar", true);
  await p.goto(`${APP}/quiz/${qz.id}`, { waitUntil: "networkidle" });
  await p.getByText("Question 0?").waitFor();
  await p.keyboard.press("h");
  ok("H shows the hint", await p.getByText("Think about it").isVisible());
  await p.keyboard.press("b");
  ok("B picks the second answer", (await p.getByRole("radio", { name: /Right/ }).getAttribute("aria-checked")) === "true");
  await p.keyboard.press("Enter");
  await p.keyboard.press("Enter");
  await p.getByText("Question 1?").waitFor({ timeout: 5000 });
  ok("Enter checks, then continues", true);
  // Typing in a field is left alone.
  await p.goto(`${APP}/coach`, { waitUntil: "networkidle" });
  await p.getByLabel("Message the coach").fill("");
  await p.getByLabel("Message the coach").pressSequentially("go/?");
  ok("shortcuts stay off while typing", (await p.getByLabel("Message the coach").inputValue()) === "go/?" && /\/coach/.test(p.url()));
}, { width: 1280, height: 900 });
