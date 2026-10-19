// Feedback from any screen: where it came from, the build and device, and an optional screenshot.
import { supabase } from "./supabase";

export type FeedbackKind = "bug" | "idea" | "testimonial";

/** Open the feedback sheet from anywhere (FeedbackHost, mounted in the shell, listens). */
export const openFeedback = (kind: FeedbackKind = "bug") => window.dispatchEvent(new CustomEvent("stoga:feedback", { detail: { kind } }));

/** Which build is running: the main script's hashed name is unique to each deploy. */
export function buildId() {
  const src = [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((s) => s.src).find((s) => /\/assets\/index-/.test(s));
  return src ? src.split("/").pop()!.replace(/\.js$/, "").slice(0, 60) : "dev";
}

/** A short, readable description of the device (no fingerprinting: browser family, OS family, window size). */
export function deviceSummary() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "ChromeOS" : "other";
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "other";
  const installed = window.matchMedia("(display-mode: standalone)").matches ? ", installed" : "";
  return `${browser} on ${os}${installed}, ${window.innerWidth}×${window.innerHeight}`;
}

/** A picture of what's on screen right now, leaving out anything marked data-feedback-exclude (the sheet itself). */
export async function captureScreen(): Promise<Blob | null> {
  try {
    // toBlob draws straight to a file: no data: URL to fetch, which the site's security policy would block.
    const { toBlob } = await import("html-to-image");
    const node = document.getElementById("root") ?? document.body;
    const bg = getComputedStyle(document.body).backgroundColor;
    return await toBlob(node, {
      type: "image/jpeg",
      quality: 0.72,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      backgroundColor: bg,
      width: window.innerWidth,
      height: window.innerHeight,
      style: { transform: `translateY(-${window.scrollY}px)` },
      filter: (el) => !(el instanceof HTMLElement && el.dataset.feedbackExclude !== undefined),
    });
  } catch (e) {
    console.warn("screenshot failed", e);
    return null;
  }
}

/** Send feedback, with the screenshot (if any) in the student's own private folder. */
export async function sendFeedback(f: { kind: FeedbackKind; body: string; page: string; consent?: boolean; screenshot?: Blob | null }) {
  const { data: { user } } = await supabase.auth.getUser();
  let screenshot_path: string | null = null;
  if (f.screenshot && user) {
    const path = `${user.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("feedback").upload(path, new Blob([f.screenshot], { type: "image/jpeg" }), { contentType: "image/jpeg" });
    if (!error) screenshot_path = path;
  }
  const { error } = await supabase.from("feedback").insert({
    kind: f.kind, body: f.body.trim().slice(0, 4000), page: f.page.slice(0, 200), consent_to_publish: !!f.consent,
    screenshot_path, build: buildId(), device: deviceSummary().slice(0, 160),
  });
  if (error) throw error;
}
