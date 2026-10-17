// v1.8.0: the allowance meters show real usage.
import { admin, APP, ok, run } from "./harness.mjs";
await run("allow", async ({ p, uid }) => {
  await admin.from("ai_usage").insert(Array.from({ length: 3 }, () => ({ user_id: uid, feature: "ocr_page", model: "test", input_tokens: 10, output_tokens: 10 })));
  await admin.from("ai_usage").insert({ user_id: uid, feature: "grade_answer", model: "test", input_tokens: 10, output_tokens: 10 });
  await p.goto(`${APP}/settings#allowance`, { waitUntil: "networkidle" });
  const box = p.locator("#allowance");
  await box.getByText("Scanned pages, last 24 hours").waitFor();
  const t = await box.innerText();
  ok("scanned pages: 3 of 150", /Scanned pages, last 24 hours\s*3 of 150/.test(t));
  ok("answer checks: 1 of 150", /Answer checks today\s*1 of 150/.test(t));
  ok("tutor and study set meters", /Tutor and coach messages today\s*0 of \d+/.test(t) && /Study sets this month\s*0 of \d+/.test(t));
  ok("per-file limits", /\d+ flashcards · \d+ quiz questions · \d+ study guide sections/.test(t));
  await p.goto(`${APP}/plans`, { waitUntil: "networkidle" });
  ok("Plans shows them too", await p.getByText("Scanned pages, last 24 hours").isVisible());
});
