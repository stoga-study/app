// v1.6.2: Continue studying and the coach conversation follow the student to another device.
import { admin, APP, ok, run, secondDevice, until } from "./harness.mjs";
await run("continuity", async ({ p, uid, wh }) => {
  const src = (await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, filename: "Cell structure notes", kind: "text", bytes: 1, page_count: 1, status: "ready_text" }).select().single()).data;
  await admin.from("source_pages").insert({ user_id: uid, source_id: src.id, page_no: 1, text: "Cells." });
  // Phone: open a file, and chat with the coach.
  await p.goto(`${APP}/sources/${src.id}`, { waitUntil: "networkidle" });
  ok("profile remembers the file", !!(await until(async () => (await admin.from("profiles").select("recent").eq("user_id", uid).single()).data.recent?.href === `/sources/${src.id}`)));
  await p.goto(`${APP}/coach`, { waitUntil: "networkidle" });
  await p.getByLabel("Message the coach").fill("hi! just saying hello from my phone");
  await p.getByRole("button", { name: "Send" }).click();
  await p.getByRole("button", { name: "Send" }).waitFor({ timeout: 90000 });
  ok("conversation saved to the profile", !!(await until(async () => ((await admin.from("profiles").select("coach_chat").eq("user_id", uid).single()).data.coach_chat ?? []).length === 2, 20000)));
  // Laptop: Home offers the file; the coach shows the conversation.
  const laptop = await secondDevice(uid);
  try {
    await laptop.p.goto(`${APP}/`, { waitUntil: "networkidle" });
    await laptop.p.getByText("Continue studying", { exact: false }).first().waitFor({ timeout: 15000 });
    ok("laptop: Continue studying offers the phone's file", await laptop.p.getByText("Cell structure notes").first().isVisible());
    await laptop.p.goto(`${APP}/coach`, { waitUntil: "networkidle" });
    await laptop.p.getByText("hi! just saying hello from my phone").waitFor({ timeout: 15000 });
    ok("laptop: the coach conversation is there", true);
  } finally {
    await laptop.close();
  }
});
