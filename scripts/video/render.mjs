// Render the updates video's frames straight into ffmpeg (no frame files on disk).
//   node scripts/video/render.mjs <outdir> [16x9|9x16|both] [--stills]
// --stills writes a few sample frames as PNGs instead, for checking the look quickly.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { compositionHtml } from "./composition.mjs";
import { DURATION, FPS } from "./timeline.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[2] ?? "video-out");
const which = process.argv[3] ?? "both";
const stills = process.argv.includes("--stills");
const SHOTS = path.resolve(OUT, "shots");
const FONTS = path.resolve(here, "../../node_modules/@fontsource");
const SEAL = path.resolve(here, "../../public/icons/seal.png");
fs.mkdirSync(OUT, { recursive: true });

const formats = { "16x9": [1920, 1080], "9x16": [1080, 1920] };
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--allow-file-access-from-files"] });
for (const [name, [w, h]] of Object.entries(formats)) {
  if (which !== "both" && which !== name) continue;
  const file = path.join(OUT, `composition-${name}.html`);
  fs.writeFileSync(file, compositionHtml({ w, h, shots: pathToFileURL(SHOTS).href, fonts: pathToFileURL(FONTS).href, seal: pathToFileURL(SEAL).href }));
  const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  await p.goto(pathToFileURL(file).href);
  await p.evaluate(() => window.ready);
  if (stills) {
    for (const t of [0, 2, 6.2, 11.4, 22.5, 27.5, 44, 50, 56, 59.4]) {
      await p.evaluate((x) => window.render(x), t);
      await p.screenshot({ path: path.join(OUT, `still-${name}-${String(t).replace(".", "_")}.png`) });
    }
    console.log("stills", name);
    continue;
  }
  const video = path.join(OUT, `frames-${name}.mp4`);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video], { stdio: ["pipe", "inherit", "inherit"] });
  const total = DURATION * FPS;
  for (let i = 0; i < total; i++) {
    await p.evaluate((x) => window.render(x), i / FPS);
    const buf = await p.screenshot({ type: "jpeg", quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 300 === 0) console.log(name, `${Math.round((100 * i) / total)}%`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on("close", (code) => (code === 0 ? r() : j(new Error(`ffmpeg ${code}`)))));
  console.log("frames done", video);
}
await b.close();
