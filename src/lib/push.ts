// Phone notifications on this device: support, permission, subscribing and a test send.
import { supabase } from "./supabase";

/** The server's public push key (VAPID). Public by design; its private half lives only in the server's secrets. */
const PUBLIC_KEY = "BDuIutiK7b7MFfl504ZxUNVkI5poSmJpJYPPLJVQJGM9z2AAgZaueINs-gqT97OMCLCx5SLIITXBQ9Etslr8RtM";

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
/** On iPhone, notifications only work in the app added to the Home Screen. */
export const needsHomeScreen = () => isIOS() && !isStandalone();

const toBytes = (b64: string) => {
  const raw = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Ask permission, subscribe this device and save it. Returns "on", "denied" or "unsupported". */
export async function turnOn(): Promise<"on" | "denied" | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(PUBLIC_KEY) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await supabase.from("push_subscriptions").delete().eq("endpoint", json.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
  if (error) throw error;
  return "on";
}

/** Stop notifications on this device. */
export async function turnOff() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

export async function sendTest() {
  const { data, error } = await supabase.functions.invoke<{ sent: number }>("send-reminders", { body: { test: true } });
  if (error) throw error;
  return data?.sent ?? 0;
}
