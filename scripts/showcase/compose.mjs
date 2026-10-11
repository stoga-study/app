import { chromium } from "playwright-core";
import fs from "node:fs";
// Composes the App Store images from capture.mjs output.
// Usage: node scripts/showcase/compose.mjs <work dir> [output dir, default marketing/app-store]
import { fileURLToPath } from "node:url";
const N = process.argv[2];
const app = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const out = process.argv[3] ?? `${app}/marketing/app-store`;
const F = `${app}/node_modules/@fontsource`;
const R = `file://${N}/raw`;
fs.mkdirSync(out, { recursive: true });

// Paper grain, like printed stock.
const grain = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}")`;

const slides = [
  { file: "01-study-from-your-notes", bg: "#F7EAEC", ink: "#1F1B1C", sub: "#4A2A30", sticker: "Free for every student",
    title: "Study from<br>your own notes", subtitle: "Every class, every upload,<br>in one calm place", screen: "home",
    circles: [["#E8C9CF", 1500, -520, -620], ["#BA0846", 130, 1120, 1180]], curve: "#720D19" },
  { file: "02-drop-in-any-pdf", bg: "#720D19", ink: "#FFFFFF", sub: "#F7EAEC",
    title: "Drop in<br>any PDF", subtitle: "Notes, slides and readings,<br>read page by page", screen: "upload-saving",
    float: { src: "el-file", w: 980, left: 156, top: 1560, rot: -2 },
    circles: [["#9C103D", 1400, 480, -700], ["#BA0846", 150, 40, 1060]], curve: "#F2A8BA" },
  { file: "03-every-page-kept", bg: "#F4F4F5", ink: "#1F1B1C", sub: "#4A4546",
    title: "Every page,<br>kept in order", subtitle: "Open any page, or the original<br>file, whenever you need it", screen: "source",
    float: { src: "el-page8", w: 900, left: 300, top: 2080, rot: 2.5 },
    circles: [["#E4E4E7", 1300, -560, -560], ["#BA0846", 130, 1130, 1070]], curve: "#720D19" },
  { file: "04-your-exact-classes", bg: "#1E070B", ink: "#FFFFFF", sub: "#C7A9AF",
    title: "Your exact<br>classes", subtitle: "Straight from the Conestoga<br>Program of Studies, down to AB or BC", screen: "classes-algebra",
    float: { src: "el-grade", w: 880, left: 60, top: 2330, rot: -2.5 },
    circles: [["#720D19", 1500, 420, -760], ["#BA0846", 140, 30, 1060]], curve: "#F2A8BA" },
  { file: "05-no-password", bg: "#9C103D", ink: "#FFFFFF", sub: "#F7EAEC",
    title: "No password<br>to remember", subtitle: "Sign in with a link,<br>or a 6-digit code", screen: "signin-code",
    notification: true,
    circles: [["#BA0846", 1400, -600, -640], ["#F2A8BA", 120, 1130, 1060]], curve: "#FFFFFF" },
];

const html = (s) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Bricolage"; font-weight: 800; src: url("file://${F}/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2"); }
@font-face { font-family: "Atkinson"; font-weight: 400; src: url("file://${F}/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2"); }
@font-face { font-family: "Atkinson"; font-weight: 700; src: url("file://${F}/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2"); }
* { margin: 0; box-sizing: border-box; }
body { width: 1290px; height: 2796px; overflow: hidden; position: relative; background: ${s.bg}; }
.grain { position: absolute; inset: 0; background: ${grain}; opacity: .10; mix-blend-mode: multiply; z-index: 6; pointer-events: none; }
.circle { position: absolute; border-radius: 50%; z-index: 0; }
.curve { position: absolute; inset: 0; z-index: 1; }
.text { position: absolute; top: 210px; left: 0; right: 0; text-align: center; z-index: 2; color: ${s.ink}; }
h1 { font-family: "Bricolage"; font-weight: 800; font-size: 156px; line-height: .98; letter-spacing: -0.045em; }
p.sub { margin-top: 56px; font-family: "Atkinson"; font-size: 54px; line-height: 1.32; color: ${s.sub}; }
.sticker { display: inline-block; margin-bottom: 64px; padding: 24px 46px; border-radius: 999px; background: #FFFFFF; color: #1F1B1C; font-family: "Bricolage"; font-weight: 800; font-size: 46px; letter-spacing: -0.02em; box-shadow: 0 12px 0 #E8C9CF; transform: rotate(-3deg); }
.phone { position: absolute; left: 50%; top: ${s.sticker ? 1250 : 1120}px; width: 1010px; transform: translateX(-50%); z-index: 3;
  background: #141012; border-radius: 150px; padding: 26px; box-shadow: 0 60px 120px -30px rgba(30,7,11,.55), inset 0 0 0 4px rgba(255,255,255,.07); }
.screen { position: relative; border-radius: 126px; overflow: hidden; background: #F4F4F5; height: 2200px; }
.status { position: relative; height: 128px; display: flex; align-items: center; justify-content: space-between; padding: 0 88px 0 100px; font-family: -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif; font-weight: 600; font-size: 46px; color: #1F1B1C; background: #F4F4F5; }
.island { position: absolute; left: 50%; top: 26px; width: 300px; height: 88px; transform: translateX(-50%); background: #000; border-radius: 60px; }
.icons { display: flex; gap: 14px; align-items: center; }
.screen img { display: block; width: 100%; }
.float { position: absolute; z-index: 4; filter: drop-shadow(0 40px 50px rgba(30,7,11,.35)); }
.notif { position: absolute; z-index: 4; left: 90px; right: 90px; top: 2330px; transform: rotate(-2deg); background: rgba(255,255,255,.96); border-radius: 64px; padding: 44px 50px; display: flex; gap: 36px; align-items: center; font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif; box-shadow: 0 40px 70px -10px rgba(30,7,11,.45); }
.notif img { width: 110px; height: 110px; border-radius: 26px; background: #fff; }
.notif .app { font-size: 38px; color: #6b6b70; display: flex; justify-content: space-between; }
.notif .t { font-size: 44px; font-weight: 600; color: #111; margin-top: 6px; }
.notif .b { font-size: 40px; color: #333; margin-top: 4px; }
</style></head><body>
${s.circles.map(([c, d, x, y]) => `<div class="circle" style="background:${c};width:${d}px;height:${d}px;left:${x}px;top:${y}px"></div>`).join("")}
<svg class="curve" viewBox="0 0 1290 2796"><path d="M -40 980 C 260 860, 380 1180, 640 1060 S 1080 820, 1340 1010" fill="none" stroke="${s.curve}" stroke-width="5" stroke-linecap="round" opacity=".55"/></svg>
<div class="text">${s.sticker ? `<span class="sticker">${s.sticker}</span>` : ""}<h1>${s.title}</h1><p class="sub">${s.subtitle}</p></div>
<div class="phone"><div class="screen">
  <div class="status"><span>9:41</span><div class="island"></div><span class="icons">
    <svg width="58" height="36" viewBox="0 0 58 36"><rect x="0" y="24" width="10" height="12" rx="2"/><rect x="16" y="16" width="10" height="20" rx="2"/><rect x="32" y="8" width="10" height="28" rx="2"/><rect x="48" y="0" width="10" height="36" rx="2"/></svg>
    <svg width="52" height="38" viewBox="0 0 52 38"><path d="M26 38 18 29a12 12 0 0 1 16 0zM10 21a23 23 0 0 1 32 0l-5 5a16 16 0 0 0-22 0zM2 13a35 35 0 0 1 48 0l-5 5a28 28 0 0 0-38 0z"/></svg>
    <svg width="92" height="42" viewBox="0 0 92 42"><rect x="2" y="2" width="78" height="38" rx="12" fill="none" stroke="#1F1B1C" stroke-width="4" opacity=".45"/><rect x="8" y="8" width="62" height="26" rx="7"/><rect x="84" y="14" width="6" height="14" rx="3" opacity=".45"/></svg>
  </span></div>
  <img src="${R}/${s.screen}.png">
</div></div>
${s.float ? `<img class="float" src="${R}/${s.float.src}.png" style="width:${s.float.w}px;left:${s.float.left}px;top:${s.float.top}px;transform:rotate(${s.float.rot}deg)">` : ""}
${s.notification ? `<div class="notif"><img src="file://${app}/public/icons/apple-touch-icon.png"><div style="flex:1"><div class="app"><span>MAIL</span><span>now</span></div><div class="t">Stoga.study</div><div class="b">Your Stoga.study sign-in code: 482913</div></div></div>` : ""}
<div class="grain"></div>
</body></html>`;

const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: 1290, height: 2796 }, deviceScaleFactor: 1 });
for (const s of slides) {
  const path = `${N}/show/${s.file}.html`;
  fs.mkdirSync(`${N}/show`, { recursive: true });
  fs.writeFileSync(path, html(s));
  await p.goto(`file://${path}`, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/${s.file}.png` });
  console.log("wrote", s.file);
}
await b.close();
