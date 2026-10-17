// v1.8.3: delete tutor conversations (one, then all), clear the coach chat, turn off sharing study sets
// (which removes the ones already shared), and the How we use your data page.
import { admin, APP, ok, run, until, waitForDeploy } from "./harness.mjs";

await waitForDeploy("Let classmates with the same file use my study sets");
await run("privacy", async ({ p, uid, wh }) => {
  const threads = (await admin.from("chat_threads").insert([{ user_id: uid, subject_id: wh.id, title: "Photosynthesis help" }, { user_id: uid, subject_id: wh.id, title: "Cell division" }]).select()).data;
  await admin.from("chat_messages").insert(threads.map((t) => ({ user_id: uid, thread_id: t.id, role: "user", content: "secret question" })));
  await admin.from("profiles").update({ coach_chat: [{ role: "user", content: "hi coach" }], coach_chat_at: new Date().toISOString() }).eq("user_id", uid);
  const hash = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const seeded = await admin.from("shared_sets").insert({ content_hash: hash, gen_version: 1, options_key: "e2e", kind: "text", page_count: 1, payload: {}, contributor: uid });
  ok("seeded a shared set", !seeded.error);

  // One conversation, from the tutor.
  await p.goto(`${APP}/tutor`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Delete conversation: Photosynthesis help" }).click();
  await p.getByRole("button", { name: "Delete", exact: true }).click();
  ok("one conversation deleted, its messages too", !!(await until(async () => (await admin.from("chat_threads").select("id").eq("user_id", uid)).data.length === 1)) && (await admin.from("chat_messages").select("id").eq("user_id", uid)).data.length === 1);
  ok("gone from the list", await p.getByText("Photosynthesis help").count() === 0 && await p.getByText("Cell division").isVisible());

  // The rest, from Settings.
  await p.goto(`${APP}/settings#privacy`, { waitUntil: "networkidle" });
  const box = p.locator("#privacy");
  await box.getByText("You have 1 conversation.").waitFor();
  await box.getByRole("button", { name: "Delete all tutor conversations" }).click();
  await box.getByRole("button", { name: "Delete all", exact: true }).click();
  ok("all conversations deleted", !!(await until(async () => (await admin.from("chat_threads").select("id").eq("user_id", uid)).data.length === 0)));
  await box.getByText("You have no saved conversations.").waitFor();

  await box.getByRole("button", { name: "Clear coach conversation" }).click();
  ok("coach conversation cleared everywhere", !!(await until(async () => { const c = (await admin.from("profiles").select("coach_chat").eq("user_id", uid).single()).data.coach_chat; return Array.isArray(c) && c.length === 0; })));

  const toggle = box.getByRole("checkbox", { name: /Let classmates with the same file use my study sets/ });
  ok("sharing is on by default", await toggle.isChecked());
  await toggle.click();
  await box.getByRole("button", { name: "Turn off" }).click();
  const said = await p.locator("[data-sonner-toast]").filter({ hasText: "Turned off" }).first().innerText({ timeout: 8000 }).catch(() => "");
  console.log("   toast:", said);
  ok("and says so", /1 study set you shared was removed/.test(said));
  ok("turned off", !!(await until(async () => (await admin.from("profiles").select("share_study_sets").eq("user_id", uid).single()).data.share_study_sets === false)));
  ok("the set they shared is removed", !(await admin.from("shared_sets").select("content_hash").eq("content_hash", hash).maybeSingle()).data);
  await p.reload({ waitUntil: "networkidle" });
  ok("stays off after a reload", !(await p.locator("#privacy").getByRole("checkbox", { name: /Let classmates/ }).isChecked()));
  await p.locator("#privacy").getByRole("checkbox", { name: /Let classmates/ }).click();
  ok("back on", !!(await until(async () => (await admin.from("profiles").select("share_study_sets").eq("user_id", uid).single()).data.share_study_sets === true)));

  await p.locator("#privacy").getByRole("link", { name: /How Stoga.study uses your data/ }).click();
  await p.waitForURL(/\/privacy$/);
  await p.getByRole("heading", { name: "What the AI sees, and when" }).waitFor({ timeout: 10000 }).catch(() => {});
  console.log("   headings:", (await p.locator("h1, h2").allInnerTexts()).join(" | "));
  ok("the data page", await p.getByRole("heading", { name: "What the AI sees, and when" }).isVisible() && (await p.locator("main").innerText()).includes("never sold"));

  // Nobody else can read the opt-out flag or call it for someone else: it's only ever the caller's own row.
  await admin.from("shared_sets").delete().eq("content_hash", hash);
});
