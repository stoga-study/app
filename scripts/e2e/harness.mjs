// Live tests against beta.stoga.study, as throwaway @example.com students that are always deleted.
//
//   node scripts/e2e/<name>.mjs
//
// Needs system Chrome, and the Supabase secret key from the local admin dashboard's .env (never
// committed, never printed). Screenshots go to $E2E_SHOTS, or a temp folder.
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const env = Object.fromEntries(fs.readFileSync(new URL("../../../admin-dashboard/.env", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const APP = "https://beta.stoga.study";
export const FUNCTIONS = `${env.SUPABASE_URL}/functions/v1`;
export const SHOTS = process.env.E2E_SHOTS ?? fs.mkdtempSync(path.join(os.tmpdir(), "stoga-shots-"));
fs.mkdirSync(SHOTS, { recursive: true });
export const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
export const ok = (label, v) => console.log(`${v ? "OK  " : "FAIL"} ${label}`);
export const until = async (fn, ms = 15000) => { for (let t = 0; t < ms; t += 500) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 500)); } return null; };

/**
 * Run `body({ p, uid, wh, errs })` as a fresh student with a Biology class; always cleans up.
 * `persistent: true` uses a normal (not incognito) browser profile, which Chrome needs for push.
 */
export async function run(name, body, { width = 390, height = 844, persistent = false } = {}) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: `e2e-${name}-${Date.now()}@example.com`, options: { redirectTo: APP + "/" } });
  if (error) throw error;
  const uid = data.user.id;
  const profileDir = persistent ? fs.mkdtempSync(path.join(os.tmpdir(), "stoga-chrome-")) : null;
  const ctx = persistent
    ? await chromium.launchPersistentContext(profileDir, { executablePath: CHROME, viewport: { width, height } })
    : await (await chromium.launch({ executablePath: CHROME })).newContext({ viewport: { width, height } });
  const errs = [];
  try {
    await admin.from("profiles").update({ onboarded: true, graduation_year: 2029, first_name: "Test", last_seen_version: "9.9.9" }).eq("user_id", uid);
    const wh = (await admin.from("subjects").insert({ user_id: uid, name: "Biology", area: "Science", school_year: "2026-27", color_index: 1 }).select().single()).data;
    const p = ctx.pages()[0] ?? (await ctx.newPage());
    p.on("pageerror", (e) => errs.push(String(e)));
    p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("cloudflareinsights")) errs.push("console: " + m.text().slice(0, 500)); });
    await p.goto(data.properties.action_link, { waitUntil: "networkidle" });
    await p.waitForURL((u) => !u.pathname.includes("verify") && !u.pathname.includes("welcome"));
    await body({ p, uid, wh, errs });
    ok("no page errors", errs.length === 0);
    if (errs.length) console.log(errs);
  } catch (e) {
    console.log("ERROR", e.message.split("\n").slice(0, 8).join(" | "));
  } finally {
    await (ctx.browser() ?? ctx).close();
    if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
    await admin.auth.admin.deleteUser(uid);
    console.log("cleaned up", uid);
  }
}

/** Wait until the live app's bundle contains `text` (a new deploy has gone out). */
export async function waitForDeploy(text, ms = 600000) {
  for (let t = 0; t < ms; t += 10000) {
    const html = await (await fetch(APP + "/")).text();
    const js = /assets\/index-[^"]*\.js/.exec(html)?.[0];
    if (js && (await (await fetch(`${APP}/${js}`)).text()).includes(text)) return true;
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error(`deploy with "${text}" not live after ${ms / 1000}s`);
}
