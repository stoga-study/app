// v1.8.10: Plans and Donate show the real ledger; donating stays switched off until there's a link.
import { APP, ok, run, waitForDeploy } from "./harness.mjs";
await waitForDeploy("Donations open soon");
await run("ledger", async ({ p }) => {
  await p.goto(`${APP}/plans`, { waitUntil: "networkidle" });
  await p.getByRole("heading", { name: "Costs and funding" }).waitFor();
  const month = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());
  ok("Plans shows this month's real costs", await p.getByText(`${month} so far`).first().isVisible() && await p.getByRole("table").isVisible());
  ok("no sample figures left", (await p.getByText("Sample figures").count()) === 0);
  await p.getByRole("link", { name: "About donating" }).first().click();
  await p.waitForURL(/\/donate$/);
  ok("donating is switched off until payments are set up", await p.getByRole("button", { name: "Donations open soon" }).isDisabled());
  ok("the ledger is on the donate page too", await p.getByRole("heading", { name: "Where the money goes" }).isVisible());
}, { width: 1280, height: 900 });
