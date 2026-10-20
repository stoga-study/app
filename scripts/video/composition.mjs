// The updates video as a page that can draw any moment: window.render(t). Brand v2 (BRAND.md): warm neutrals,
// burgundy only for emphasis, Newsreader headlines, Geist text, Geist Mono labels, hairline frames.
import { CHAPTERS, DURATION, LOOP_FADE, OUTRO_START, POINT_AT, TITLE_END, CHAPTER } from "./timeline.mjs";

export function compositionHtml({ w, h, shots, fonts, seal }) {
  const vertical = h > w;
  const font = (family, file, weight, style = "normal") => `@font-face{font-family:"${family}";src:url("${fonts}/${file}") format("woff2");font-weight:${weight};font-style:${style}}`;
  const data = JSON.stringify({ CHAPTERS, DURATION, LOOP_FADE, OUTRO_START, POINT_AT, TITLE_END, CHAPTER, vertical, shots });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${font("Newsreader", "newsreader/files/newsreader-latin-400-normal.woff2", 400)}
${font("Newsreader", "newsreader/files/newsreader-latin-500-normal.woff2", 500)}
${font("Newsreader", "newsreader/files/newsreader-latin-400-italic.woff2", 400, "italic")}
${font("Geist", "geist/files/geist-latin-400-normal.woff2", 400)}
${font("Geist", "geist/files/geist-latin-500-normal.woff2", 500)}
${font("Geist", "geist/files/geist-latin-600-normal.woff2", 600)}
${font("Geist Mono", "geist-mono/files/geist-mono-latin-500-normal.woff2", 500)}
:root{--bg:#F7F6F5;--card:#FFFFFF;--soft:#F1EEED;--line:#E8E4E3;--ink:#1C1718;--ink2:#3E3739;--muted:#6B6466;--brand:#720D19;--tint:#F5E8EA}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:var(--bg);font-synthesis-weight:none}
#stage{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:var(--bg);color:var(--ink);font-family:Geist,system-ui,sans-serif}
.layer{position:absolute;inset:0;will-change:opacity,transform}
.mono{font-family:"Geist Mono",ui-monospace,monospace;font-weight:500;letter-spacing:.08em;text-transform:uppercase}
.serif{font-family:Newsreader,Georgia,serif;font-weight:500;letter-spacing:-.02em}
/* Title and outro */
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:${vertical ? 34 : 28}px}
.wordmark{display:flex;align-items:center;gap:${vertical ? 30 : 26}px}
.wordmark img{width:${vertical ? 132 : 112}px;height:${vertical ? 132 : 112}px;border-radius:50%}
.wordmark span{font-size:${vertical ? 132 : 120}px;line-height:1}
.title-sub{font-family:Newsreader,Georgia,serif;font-style:italic;font-size:${vertical ? 54 : 46}px;color:var(--ink2)}
.title-meta{font-size:${vertical ? 24 : 20}px;color:var(--muted)}
.rule{width:${vertical ? 120 : 96}px;height:2px;background:var(--brand)}
/* Chapters */
.chapter{position:absolute;inset:0}
.text{position:absolute;${vertical ? "left:90px;right:90px;top:150px" : "left:140px;top:0;bottom:0;width:740px;display:flex;flex-direction:column;justify-content:center"}}
.eyebrow{font-size:${vertical ? 26 : 22}px;color:var(--brand);display:flex;gap:18px;align-items:center}
.eyebrow b{font-weight:500;color:var(--muted)}
.headline{margin-top:${vertical ? 26 : 22}px;font-size:${vertical ? 104 : 92}px;line-height:1.02}
.headline .w{display:inline-block;margin-right:.24em}
.points{margin-top:${vertical ? 46 : 40}px;display:flex;flex-direction:column;gap:${vertical ? 22 : 18}px}
.point{display:flex;gap:18px;align-items:baseline;font-size:${vertical ? 40 : 33}px;color:var(--ink2);line-height:1.25}
.point::before{content:"";flex:none;width:${vertical ? 14 : 12}px;height:${vertical ? 14 : 12}px;border-radius:50%;background:var(--brand);transform:translateY(-${vertical ? 6 : 4}px)}
.visual{position:absolute;${vertical ? "left:0;right:0;bottom:170px;height:1080px" : "right:120px;top:0;bottom:0;width:900px"}}
.phone{position:absolute;width:${vertical ? 470 : 400}px;aspect-ratio:390/844;border-radius:${vertical ? 64 : 54}px;padding:${vertical ? 13 : 11}px;background:#16110F;box-shadow:0 0 0 1px #2C2426,0 40px 80px -40px rgba(30,7,11,.45)}
.phone .screen{position:relative;width:100%;height:100%;border-radius:${vertical ? 52 : 44}px;overflow:hidden;background:var(--bg)}
.screen img,.browser .screen img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top}
.browser{position:absolute;width:${vertical ? 900 : 860}px;border-radius:18px;background:var(--card);border:1px solid var(--line);box-shadow:0 40px 80px -46px rgba(30,7,11,.4);overflow:hidden}
.browser .bar{height:44px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--line);font-size:15px;color:var(--muted)}
.browser .screen{position:relative;width:100%;aspect-ratio:1440/900;background:var(--bg)}
/* Progress rail */
.rail{position:absolute;left:${vertical ? 90 : 140}px;right:${vertical ? 90 : 140}px;bottom:${vertical ? 80 : 56}px;display:grid;grid-template-columns:repeat(9,1fr);gap:${vertical ? 10 : 14}px}
.rail div{display:flex;flex-direction:column;gap:10px}
.rail .bar{height:3px;border-radius:3px;background:var(--line);overflow:hidden}
.rail .bar i{display:block;height:100%;width:0;background:var(--brand)}
.rail span{font-size:${vertical ? 18 : 15}px;color:var(--muted)}
.rail .on span{color:var(--ink)}
</style></head><body><div id="stage"></div>
<script>
const D = ${data};
const stage = document.getElementById("stage");
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const out = (x) => 1 - Math.pow(1 - clamp(x), 3);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const img = (name) => \`<img src="\${D.shots}/\${name}.png" alt="">\`;

// Title (also the last frame, for the loop)
const title = el("div", "layer");
title.innerHTML = \`<div class="center"><div class="wordmark"><img src="${seal}" alt=""><span class="serif">Stoga.study</span></div><div class="rule"></div><div class="title-sub">Every update since launch, in one minute.</div><div class="title-meta mono">Versions 1.1 to 1.9 · Made for Conestoga</div></div>\`;
stage.append(title);

// Outro
const outro = el("div", "layer");
outro.innerHTML = \`<div class="center"><div class="title-meta mono">Nine updates. One month. All free.</div><div class="serif" style="font-size:${vertical ? 112 : 104}px;line-height:1.02">Free for every<br>Conestoga student.</div><div class="rule"></div><div class="mono" style="font-size:${vertical ? 34 : 30}px;color:var(--brand)">beta.stoga.study</div></div>\`;
stage.append(outro);

// Chapters
const chapters = D.CHAPTERS.map((c) => {
  const root = el("div", "chapter layer");
  const text = el("div", "text");
  text.append(el("div", "eyebrow mono", \`Version \${c.v} <b>·</b> <b>\${c.label}</b>\`));
  const hl = el("div", "headline serif", c.title.split(" ").map((w) => \`<span class="w">\${w}</span>\`).join(""));
  text.append(hl);
  const pts = el("div", "points");
  c.points.forEach((p) => pts.append(el("div", "point", p)));
  text.append(pts);
  root.append(text);
  const visual = el("div", "visual");
  const phones = c.screens.filter((s) => s.startsWith("p-"));
  const desks = c.screens.filter((s) => s.startsWith("d-"));
  let browser = null, phone = null;
  if (desks.length) {
    browser = el("div", "browser", \`<div class="bar mono">beta.stoga.study</div><div class="screen">\${desks.map(img).join("")}</div>\`);
    visual.append(browser);
  }
  if (phones.length) {
    phone = el("div", "phone", \`<div class="screen">\${phones.map(img).join("")}</div>\`);
    visual.append(phone);
  }
  root.append(visual);
  stage.append(root);
  return { c, root, text, words: [...hl.querySelectorAll(".w")], pts: [...pts.children], phone, browser, phoneImgs: phone ? [...phone.querySelectorAll("img")] : [], deskImgs: browser ? [...browser.querySelectorAll("img")] : [] };
});

// Rail
const rail = el("div", "rail");
const railItems = D.CHAPTERS.map((c) => { const d = el("div", "", \`<div class="bar"><i></i></div><span class="mono">\${c.v}</span>\`); rail.append(d); return d; });
stage.append(rail);

// Layout of the visual area: a phone alone, a browser alone, or a browser with a phone in front.
function placeVisual(ch) {
  const V = D.vertical;
  if (ch.browser && ch.phone) {
    if (V) { ch.browser.style.left = "90px"; ch.browser.style.top = "0px"; ch.phone.style.right = "110px"; ch.phone.style.bottom = "0px"; ch.phone.style.width = "400px"; }
    else { ch.browser.style.right = "0px"; ch.browser.style.top = "190px"; ch.phone.style.left = "0px"; ch.phone.style.bottom = "130px"; ch.phone.style.width = "330px"; }
  } else if (ch.browser) {
    if (V) { ch.browser.style.left = "90px"; ch.browser.style.top = "260px"; }
    else { ch.browser.style.right = "0px"; ch.browser.style.top = "260px"; }
  } else if (ch.phone) {
    if (V) { ch.phone.style.left = "50%"; ch.phone.style.marginLeft = "-235px"; ch.phone.style.top = "0px"; }
    else { ch.phone.style.left = "50%"; ch.phone.style.marginLeft = "-200px"; ch.phone.style.top = "50%"; ch.phone.style.marginTop = "-433px"; }
  }
}
chapters.forEach(placeVisual);

// Crossfade through a list of screens across a chapter.
function cycle(imgs, local, t) {
  const n = imgs.length; if (!n) return;
  const slot = (D.CHAPTER - 0.3) / n;
  imgs.forEach((im, k) => {
    const s = k * slot;
    const vis = k === 0 ? 1 - ease((local - (s + slot - .35)) / .5) : (k === n - 1 ? ease((local - (s - .15)) / .5) : ease((local - (s - .15)) / .5) * (1 - ease((local - (s + slot - .35)) / .5)));
    im.style.opacity = n === 1 ? 1 : clamp(vis);
    const z = 1.035 - .035 * clamp((local - s) / slot);
    im.style.transform = \`scale(\${z})\`;
    im.style.transformOrigin = "50% 0%";
  });
}

window.render = (t) => {
  t = ((t % D.DURATION) + D.DURATION) % D.DURATION;
  // Title: fully on at 0 (and at the very end, for the loop), out by the first chapter.
  const titleOut = ease((t - (D.TITLE_END - .6)) / .6);
  const loopIn = ease((t - (D.DURATION - D.LOOP_FADE)) / D.LOOP_FADE);
  const tOn = t < D.TITLE_END ? 1 - titleOut : loopIn;
  title.style.opacity = tOn;
  title.style.transform = \`translateY(\${t < D.TITLE_END ? -24 * titleOut : 18 * (1 - loopIn)}px)\`;
  // Outro: in after the last chapter, out as the loop returns to the title.
  const oIn = ease((t - D.OUTRO_START) / .7), oOut = ease((t - (D.DURATION - D.LOOP_FADE)) / (D.LOOP_FADE * .8));
  outro.style.opacity = t >= D.OUTRO_START ? oIn * (1 - oOut) : 0;
  outro.style.transform = \`translateY(\${(1 - oIn) * 30 - oOut * 18}px)\`;
  // Chapters
  chapters.forEach((ch, i) => {
    const local = t - ch.c.start;
    const on = local > -0.7 && local < D.CHAPTER + 0.7;
    ch.root.style.display = on ? "block" : "none";
    if (!on) return;
    const inP = out(local / .7), outP = ease((local - (D.CHAPTER - .55)) / .55);
    ch.text.style.opacity = inP * (1 - outP);
    ch.text.style.transform = \`translateY(\${(1 - inP) * 40 - outP * 36}px)\`;
    ch.words.forEach((w, k) => { const p = out((local - .12 - k * .06) / .55); w.style.opacity = p; w.style.transform = \`translateY(\${(1 - p) * 26}px)\`; });
    ch.pts.forEach((pt, k) => { const p = out((local - D.POINT_AT[k]) / .45); pt.style.opacity = p; pt.style.transform = \`translateX(\${(1 - p) * -22}px)\`; });
    const vIn = out((local - .15) / .8), vOut = ease((local - (D.CHAPTER - .5)) / .5);
    const float = Math.sin((t + i) * 1.3) * 6;
    if (ch.phone) { ch.phone.style.opacity = vIn * (1 - vOut); ch.phone.style.transform = \`translateY(\${(1 - vIn) * 70 - vOut * 50 + float}px)\`; }
    if (ch.browser) { ch.browser.style.opacity = vIn * (1 - vOut); ch.browser.style.transform = \`translateY(\${(1 - vIn) * 50 - vOut * 40 - float * .5}px)\`; }
    cycle(ch.phoneImgs, local, t);
    cycle(ch.deskImgs, local, t);
  });
  // Rail: visible during chapters, each segment fills over its chapter.
  const railOn = ease((t - (D.TITLE_END - .3)) / .6) * (1 - ease((t - (D.OUTRO_START - .1)) / .5));
  rail.style.opacity = railOn;
  railItems.forEach((d, i) => {
    const c = D.CHAPTERS[i];
    const f = clamp((t - c.start) / D.CHAPTER);
    d.querySelector("i").style.width = (f * 100) + "%";
    d.classList.toggle("on", t >= c.start && t < c.start + D.CHAPTER);
  });
};
window.ready = Promise.all([document.fonts.ready, ...[...document.images].map((im) => im.complete ? 1 : new Promise((r) => { im.onload = im.onerror = r; }))]);
render(0);
</script></body></html>`;
}
