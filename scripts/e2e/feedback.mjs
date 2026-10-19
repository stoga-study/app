// v1.9.0: feedback from any screen, with where it came from and an optional screenshot (private bucket).
import path from "node:path";
import { admin, APP, ok, run, SHOTS, until, waitForDeploy } from "./harness.mjs";

if (!APP.startsWith("http://localhost")) await waitForDeploy("Include a screenshot of this screen");
await run("feedback", async ({ p, uid }) => {
  await p.goto(`${APP}/calendar`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Send feedback" }).first().click();
  const sheet = p.getByRole("dialog", { name: "Send feedback" });
  await sheet.waitFor();
  await sheet.getByRole("radio", { name: "An idea" }).click();
  await sheet.locator("textarea").fill("Could the calendar show a week view?");
  await sheet.getByLabel(/Include a screenshot of this screen/).click(); // ticks once the picture is ready
  await sheet.getByRole("img", { name: "Screenshot that will be sent" }).waitFor({ timeout: 15000 });
  await sheet.screenshot({ path: path.join(SHOTS, "feedback-sheet.png") });
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  const row = await until(async () => (await admin.from("feedback").select("kind, body, page, build, device, screenshot_path, status").eq("user_id", uid).maybeSingle()).data);
  ok("saved with where it came from", row?.kind === "idea" && row.page === "/calendar" && !!row.build && /×/.test(row.device ?? "") && row.status === "new");
  ok("screenshot stored in the student's own folder", !!row?.screenshot_path && row.screenshot_path.startsWith(`${uid}/`));
  const { data: img } = row?.screenshot_path ? await admin.storage.from("feedback").download(row.screenshot_path) : { data: null };
  ok("the screenshot is a real picture", !!img && img.size > 8000);
  if (img) await import("node:fs").then((fs) => img.arrayBuffer().then((b) => fs.writeFileSync(path.join(SHOTS, "feedback-screenshot.jpg"), Buffer.from(b))));
  await p.getByText("Thanks. It went straight to the people building Stoga.study").waitFor({ timeout: 5000 }).then(() => ok("thanks the student", true), () => ok("thanks the student", false));
  // Clean up the stored picture (the account deletion removes the row).
  if (row?.screenshot_path) await admin.storage.from("feedback").remove([row.screenshot_path]);

  // Desktop: the sidebar opens the same sheet.
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.goto(`${APP}/progress`, { waitUntil: "networkidle" });
  await p.locator("aside").getByRole("button", { name: "Send feedback" }).click();
  ok("desktop sidebar opens it too", await p.getByRole("dialog", { name: "Send feedback" }).isVisible());
}, { width: 390, height: 844 });
