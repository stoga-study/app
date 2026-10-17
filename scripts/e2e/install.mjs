// v1.6.3: on iPhone Safari, Home offers the Add to Home Screen steps once a study set is ready.
import { admin, APP, ok, run } from "./harness.mjs";
await run("install", async ({ p, uid, wh }) => {
  await p.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  });
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  ok("no offer before a study set exists", (await p.getByRole("region", { name: "Install the app" }).count()) === 0);
  await admin.from("sources").insert({ user_id: uid, subject_id: wh.id, filename: "Cells", kind: "text", bytes: 1, page_count: 1, status: "ready" });
  await p.waitForTimeout(31000);
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  const card = p.getByRole("region", { name: "Install the app" });
  await card.waitFor({ timeout: 15000 });
  await card.getByRole("button", { name: "Show me how" }).click();
  ok("iPhone steps shown", await card.getByText("Add to Home Screen").isVisible());
  await card.getByRole("button", { name: "Not now" }).click();
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  ok("snoozed after closing", (await p.getByRole("region", { name: "Install the app" }).count()) === 0);
  await p.goto(`${APP}/settings#install`, { waitUntil: "networkidle" });
  ok("Settings still offers it", await p.locator("#install").getByRole("button", { name: "Show me how" }).isVisible());
});
