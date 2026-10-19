// Sending phone notifications from any function: to every device a student has, only if their switch for that
// kind is on, outside their quiet hours, and once per kind per day (the notification_log key).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import webpush from "npm:web-push@3.6.7";
import { isQuiet, localNow, minutesOf, toPrefs, type NotifyPrefs } from "./notify.ts";

export type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
export type Payload = { title: string; body: string; url: string; tag: string };

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "https://beta.stoga.study", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
  configured = true;
}

/** Push to each device; drop subscriptions the push service says are gone. Returns how many were delivered. */
export async function pushTo(admin: SupabaseClient, subs: Sub[], payload: Payload) {
  configure();
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3 * 3600, urgency: "normal" });
      delivered++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push", status, (e as Error).message?.slice(0, 200));
    }
  }
  return delivered;
}

/**
 * One notification for one student, if they want this kind (`pref`), it isn't quiet hours for them, and `kind`
 * hasn't been sent to them today. Never throws: a notification must not break the work that triggered it.
 */
export async function notifyStudent(admin: SupabaseClient, userId: string, pref: keyof NotifyPrefs, kind: string, payload: Payload) {
  try {
    const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").eq("user_id", userId);
    if (!subs?.length) return 0;
    const { data: profile } = await admin.from("profiles").select("notify").eq("user_id", userId).maybeSingle();
    if (!profile?.notify) return 0;
    const prefs = toPrefs(profile.notify);
    if (!prefs[pref]) return 0;
    const local = localNow(prefs.tz);
    if (isQuiet(local.minutes, minutesOf(prefs.quiet_start), minutesOf(prefs.quiet_end))) return 0;
    const { error: already } = await admin.from("notification_log").insert({ user_id: userId, kind, day: local.date });
    if (already) return 0;
    return await pushTo(admin, subs as Sub[], payload);
  } catch (e) {
    console.error("notify", kind, e instanceof Error ? e.message : e);
    return 0;
  }
}
