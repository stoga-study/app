// v1.6.0: an upload survives a dropped connection while its pages are saving.
import { admin, APP, ok, run, until, waitForDeploy } from "./harness.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
await waitForDeploy("Update ready");
await run("retry", async ({ p, uid }) => {
  const file = path.join(os.tmpdir(), "retry-notes.txt");
  fs.writeFileSync(file, "Cell structure. The mitochondria makes ATP. The nucleus holds DNA. Ribosomes build proteins.");
  // The first two attempts to save pages fail as if the Wi-Fi dropped; the third goes through.
  let failures = 0;
  await p.route("**/rest/v1/source_pages*", (route) => {
    if (route.request().method() === "POST" && failures < 2) {
      failures++;
      return route.abort("internetdisconnected");
    }
    return route.continue();
  });
  await p.goto(`${APP}/upload`, { waitUntil: "networkidle" });
  await p.locator("input[type=file]").first().setInputFiles(file);
  await p.getByRole("radio", { name: /No unit/ }).click().catch(() => {});
  await p.getByText(/Read \d+ (page|part)/i).first().waitFor({ timeout: 30000 });
  await p.getByRole("button", { name: /Just save it/ }).click();
  const src = await until(async () => (await admin.from("sources").select("id, status").eq("user_id", uid).eq("status", "ready_text").maybeSingle()).data, 30000);
  ok(`saved after ${failures} dropped attempts`, !!src && failures === 2);
  const pages = src ? (await admin.from("source_pages").select("page_no").eq("source_id", src.id)).data : [];
  ok("pages saved once each", pages.length >= 1 && new Set(pages.map((x) => x.page_no)).size === pages.length);
}, { expectErrors: /ERR_INTERNET_DISCONNECTED/ });
