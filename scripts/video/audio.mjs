// The updates video's soundtrack, synthesized from scratch (no samples, nothing licensed): a warm 96 BPM bed
// (pad, plucked arpeggio, sub bass, soft kick and shaker) plus a chime, whoosh or tick on every cue in timeline.mjs.
//   node scripts/video/audio.mjs <out.wav>
// 96 BPM makes 60 s exactly 24 bars, and everything that rings past 60 s wraps onto the start, so it loops cleanly.
import fs from "node:fs";
import { cues, DURATION } from "./timeline.mjs";

const SR = 48000;
const TAIL = 3; // seconds rendered past the end, then folded onto the start
const N = (DURATION + TAIL) * SR;
const L = new Float32Array(N);
const R = new Float32Array(N);
const BEAT = 60 / 96;
const BAR = 4 * BEAT;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const TAU = Math.PI * 2;

// D major: Dmaj9, Bm9, Gmaj7(9), A(add9), two bars each, three times round.
const CHORDS = [
  { pad: [62, 66, 69, 73, 76], bass: 38 },
  { pad: [59, 62, 66, 69, 73], bass: 35 },
  { pad: [55, 59, 62, 66, 69], bass: 43 },
  { pad: [57, 61, 64, 69, 71], bass: 33 },
];
const chordAt = (bar) => CHORDS[Math.floor(bar / 2) % 4];
// The drums play under the chapters only: from the whoosh into 1.1 (beat 6) to the outro (beat 84).
const DRUMS_FROM = 6 * BEAT;
const DRUMS_TO = 84 * BEAT;

function add(buf, start, fn, len, gain = 1) {
  const s0 = Math.max(0, Math.round(start * SR));
  const n = Math.min(Math.round(len * SR), N - s0);
  for (let i = 0; i < n; i++) buf[s0 + i] += gain * fn(i / SR);
}
const both = (start, fn, len, gain = 1, pan = 0) => {
  add(L, start, fn, len, gain * Math.cos((pan + 1) * Math.PI / 4));
  add(R, start, fn, len, gain * Math.sin((pan + 1) * Math.PI / 4));
};

// Pad: soft saw-ish voices (six harmonics), detuned left and right, slow swell, overlapping the next chord.
for (let c = 0; c < 12; c++) {
  const ch = CHORDS[c % 4];
  const start = c * 2 * BAR;
  const len = 2 * BAR + 1.6;
  for (const m of ch.pad) {
    for (const [buf, det] of [[L, 0.9985], [R, 1.0015]]) {
      const f = hz(m) * det;
      const ph = Math.random() * TAU;
      add(buf, start, (t) => {
        const env = Math.min(1, t / 0.9) * Math.min(1, Math.max(0, (len - t) / 1.6));
        let s = 0;
        for (let h = 1; h <= 6; h++) s += Math.sin(TAU * f * h * t + ph * h) / (h * h);
        return env * s;
      }, len, 0.022);
    }
  }
}

// Plucked arpeggio, an octave up, eighth notes, ping-ponged.
const pluck = (f) => (t) => Math.exp(-t * 5.5) * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t) * Math.exp(-t * 9));
const ORDER = [0, 2, 4, 3, 1, 3, 2, 4];
for (let e = 0; e < 24 * 8; e++) {
  const bar = Math.floor(e / 8);
  const t = e * BEAT / 2;
  const m = chordAt(bar).pad[ORDER[e % 8]] + 12;
  const soft = t < DRUMS_FROM || t >= DRUMS_TO ? 0.7 : 1;
  both(t, pluck(hz(m)), 1.4, 0.05 * soft * (e % 2 ? 0.75 : 1), e % 2 ? 0.35 : -0.35);
}

// Sub bass on beats 1 and 3, with a little second harmonic so phone speakers can hear it.
for (let b = 0; b < 24 * 4; b += 2) {
  const t = b * BEAT;
  const f = hz(chordAt(Math.floor(b / 4)).bass);
  const g = t >= DRUMS_FROM && t < DRUMS_TO ? 0.16 : 0.08;
  both(t, (x) => Math.min(1, x / 0.01) * Math.exp(-x * 2.2) * (Math.sin(TAU * f * x) + 0.3 * Math.sin(TAU * 2 * f * x)), 2 * BEAT, g);
}

// Soft kick on every beat, shaker on the off-beats.
let seed = 7;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (let b = 6; b < 84; b++) {
  const t = b * BEAT;
  both(t, (x) => Math.exp(-x * 14) * Math.sin(TAU * (45 * x + (75 / 30) * (1 - Math.exp(-x * 30)))), 0.35, b % 2 ? 0.16 : 0.22);
  let prev = 0;
  both(t + BEAT / 2, (x) => { const n = noise(); const hp = n - prev; prev = n; return Math.exp(-x * 40) * hp; }, 0.12, 0.022, b % 4 < 2 ? 0.4 : -0.4);
}

// Sound effects.
const SFX = {
  // A soft bell: D6 and A6 with a slightly inharmonic shimmer.
  chime: (t0) => {
    for (const [m, g, p] of [[86, 0.12, -0.2], [93, 0.08, 0.2], [98, 0.035, 0]]) {
      const f = hz(m);
      both(t0, (t) => Math.min(1, t / 0.004) * Math.exp(-t * 2.2) * (Math.sin(TAU * f * t) + 0.2 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 6)), 2.6, g, p);
    }
  },
  // Air: noise through a band-pass sweeping up then settling, left to right.
  whoosh: (t0) => {
    const len = 0.7;
    let low = 0, band = 0;
    const fn = (t) => {
      const x = t / len;
      const fc = 400 + 3600 * Math.sin(Math.PI * Math.min(1, x * 1.15));
      const f = 2 * Math.sin(Math.PI * fc / SR);
      const high = noise() - low - 0.7 * band;
      band += f * high;
      low += f * band;
      return Math.sin(Math.PI * x) ** 2 * band;
    };
    const buf = Array.from({ length: Math.round(len * SR) }, (_, i) => fn(i / SR));
    add(L, t0, (t) => (buf[Math.round(t * SR)] ?? 0) * (1 - 0.5 * t / len), len, 0.09);
    add(R, t0, (t) => (buf[Math.round(t * SR)] ?? 0) * (0.5 + 0.5 * t / len), len, 0.09);
  },
  // A tiny wooden tick.
  tick: (t0) => both(t0, (t) => Math.exp(-t * 90) * Math.sin(TAU * 1900 * t) + Math.exp(-t * 200) * 0.5 * Math.sin(TAU * 3400 * t), 0.06, 0.05),
};
for (const c of cues()) SFX[c.kind](c.t);

// A short stereo echo for space (dotted eighth, low-passed feedback).
const D = Math.round(BEAT * 0.75 * SR);
for (const [a, b] of [[L, R], [R, L]]) {
  let lp = 0;
  for (let i = D; i < N; i++) {
    lp += 0.35 * (b[i - D] - lp);
    a[i] += 0.18 * lp;
  }
}

// Fold the tail onto the start so whatever rings past 60 s carries into the loop.
const OUT = DURATION * SR;
for (let i = 0; i < TAIL * SR; i++) { L[i] += L[OUT + i]; R[i] += R[OUT + i]; }

// Normalize to about -1 dBFS through a gentle soft clip.
let peak = 0;
for (let i = 0; i < OUT; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const k = 1.1 / peak;
const wav = Buffer.alloc(44 + OUT * 4);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + OUT * 4, 4); wav.write("WAVE", 8);
wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(OUT * 4, 40);
for (let i = 0; i < OUT; i++) {
  wav.writeInt16LE(Math.round(Math.tanh(L[i] * k) * 0.89 * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(Math.tanh(R[i] * k) * 0.89 * 32767), 46 + i * 4);
}
fs.writeFileSync(process.argv[2] ?? "audio.wav", wav);
console.log("audio", process.argv[2] ?? "audio.wav", `${DURATION}s`, `peak ${peak.toFixed(2)}`);
