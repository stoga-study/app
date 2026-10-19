// v1.9.4: testimonials need the student's and a parent's OK, keep the name the student chose, and can be withdrawn.
import path from "node:path";
import { admin, APP, ok, run, SHOTS, until, waitForDeploy } from "./harness.mjs";

if (!APP.startsWith("http://localhost")) await waitForDeploy("A parent or guardian knows and is OK with it too.");
await run("testimonial", async ({ p, uid }) => {
  await p.goto(`${APP}/testimonial`, { waitUntil: "networkidle" });
  await p.getByLabel("What would you tell a friend about it?").fill("The plan for my bio test told me exactly what to do each night.");
  await p.getByRole("radio", { name: /10th grader at Conestoga/ }).check();
  const share = p.getByRole("button", { name: "Share it" });
  await p.getByLabel(/I'm OK with this quote appearing/).check();
  ok("can't share without a parent's OK", await share.isDisabled());
  await p.getByLabel("A parent or guardian knows and is OK with it too.").check();
  await p.screenshot({ path: path.join(SHOTS, "testimonial.png"), fullPage: true });
  await share.click();
  const t = await until(async () => (await admin.from("testimonials").select("id, display, display_name, self_ok, guardian_ok, status").eq("user_id", uid).maybeSingle()).data);
  ok("saved with the chosen name and both OKs, waiting to be checked", t?.display === "grade" && t.display_name === "A 10th grader at Conestoga" && t.self_ok && t.guardian_ok && t.status === "review");
  ok("the name shows no first name", !t?.display_name.includes("Test"));
  await p.getByText("Being checked").waitFor();
  await p.getByRole("button", { name: "Withdraw" }).click();
  ok("withdrawn by the student", !!(await until(async () => (await admin.from("testimonials").select("status").eq("id", t.id).single()).data.status === "withdrawn")));
}, { width: 1280, height: 900 });
