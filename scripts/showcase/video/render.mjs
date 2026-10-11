// Renders promo.html to a 30 s, 30 fps, 720x1560 MP4 that loops cleanly.
// Usage (from pwa-app/, after `npm run build`):
//   node scripts/showcase/video/render.mjs [out.mp4] [--frames 0,120,...]   (needs ffmpeg and Chrome)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const out = path.resolve(args.find((a) => a.endsWith(".mp4")) ?? `${app}/marketing/video/stoga-promo.mp4`);
const only = args.includes("--frames") ? args[args.indexOf("--frames") + 1].split(",").map(Number) : null;
const FPS = 30, SECONDS = 30, FRAMES = FPS * SECONDS;

const css = fs.readdirSync(`${app}/dist/assets`).find((f) => f.startsWith("index-") && f.endsWith(".css"));
if (!css) throw new Error("Run `npm run build` first: the video uses the app's compiled CSS.");
const html = fs.readFileSync(`${here}/promo.html`, "utf8")
  .replace('id="appcss">', `id="appcss" href="file://${app}/dist/assets/${css}">`)
  .replaceAll('src="SEAL"', `src="file://${app}/public/icons/seal.png"`);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "stoga-promo-"));
fs.writeFileSync(`${work}/promo.html`, html);

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 720, height: 1560 }, deviceScaleFactor: 1 });
await page.goto(`file://${work}/promo.html`, { waitUntil: "load" });
await page.evaluate(() => window.ready);
const frames = only ?? Array.from({ length: FRAMES }, (_, i) => i);
for (const f of frames) {
  await page.evaluate((t) => window.render(t), f / FPS);
  await page.screenshot({ path: `${work}/f${String(f).padStart(4, "0")}.png` });
  if (f % 150 === 0) process.stdout.write(`frame ${f}\n`);
}
await browser.close();
if (only) { console.log("frames in", work); process.exit(0); }

fs.mkdirSync(path.dirname(out), { recursive: true });
// H.264, constant quality, fast start for the web, no audio. CRF 26 keeps it small and sharp for flat UI.
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", `${work}/f%04d.png`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out], { stdio: "inherit" });
fs.rmSync(work, { recursive: true, force: true });
console.log("wrote", out, `${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
