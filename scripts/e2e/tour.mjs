// v1.9.2: the tour for new students: once on Home after setup, never again unless replayed from Settings.
import path from "node:path";
import { admin, APP, ok, run, SHOTS, until, waitForDeploy } from "./harness.mjs";

if (!APP.startsWith("http://localhost")) await waitForDeploy("Skip the tour");
for (const [name, w, h] of [["phone", 390, 844], ["desktop", 1280, 860]]) {
  await run(`tour-${name}`, async ({ p, uid }) => {
    await admin.from("profiles").update({ tour_seen_at: null }).eq("user_id", uid);
    await p.goto(`${APP}/`, { waitUntil: "networkidle" });
    const tour = p.getByRole("dialog", { name: "Your Conestoga classes are already here" });
    await tour.waitFor({ timeout: 15000 });
    await p.screenshot({ path: path.join(SHOTS, `tour-${name}.png`) });
    ok(`${name}: the tour opens on Home after setup`, true);
    if (name === "desktop") return;
    for (const t of ["Plans around your real test dates", "Answers from your own notes", "It's a beta, and you shape it"]) {
      await p.getByRole("button", { name: "Next" }).click();
      await p.getByRole("heading", { name: t }).waitFor();
    }
    await p.getByRole("button", { name: "Start studying" }).click();
    ok("finishing marks it seen", !!(await until(async () => (await admin.from("profiles").select("tour_seen_at").eq("user_id", uid).single()).data.tour_seen_at)));
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    ok("it doesn't come back", (await p.getByRole("dialog").count()) === 0);
    await p.goto(`${APP}/settings`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Take the tour again" }).click();
    await p.getByRole("dialog", { name: "Your Conestoga classes are already here" }).waitFor();
    await p.getByRole("button", { name: "Skip the tour" }).click();
    ok("replay from Settings, and skip", (await p.getByRole("dialog").count()) === 0);
  }, { width: w, height: h });
}
