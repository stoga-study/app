// Sends the evening reminders, called by a schedule every 15 minutes (pg_cron, see the push migration).
//
// POST {}  → { checked, sent }
// For each student with a phone subscribed: in their own time zone, at the time they chose, outside
// quiet hours, at most once a day per kind: a test tomorrow, or due cards if they haven't studied today.
// Anyone can call it, but it only ever sends what is due, once (the log has a unique key per day), so
// calling it more often sends nothing extra.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import webpush from "npm:web-push@3.6.7";
import { eveningMessage, inWindow, isQuiet, localNow, minutesOf, toPrefs } from "../_lib/notify.ts";
import { corsHeaders, json } from "../_lib/cors.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "https://beta.stoga.study", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

/** Push to every device a student has; drop subscriptions the push service says are gone. */
async function push(subs: Sub[], payload: unknown) {
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

/** Did the student study at all since their day began? Real studying only. */
async function studiedSince(userId: string, since: string) {
  const checks = await Promise.all([
    admin.from("card_reviews").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("reviewed_at", since),
    admin.from("quiz_attempts").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since).neq("answers", "[]"),
    admin.from("practice_tests").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("finished_at", since),
  ]);
  return checks.some((c) => (c.count ?? 0) > 0);
}

Deno.serve(async (req) => {
  // The app calls this for a test send, so it answers the browser's CORS check.
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  // A test send for one's own devices: { test: true } with the student's sign-in.
  const body = await req.json().catch(() => ({}));
  if (body.test === true) {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    const { data: user } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    if (!user?.user) return json(req, { error: "not_signed_in" }, 401);
    const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", user.user.id);
    const sent = await push((subs ?? []) as Sub[], { title: "Notifications are on", body: "This is how Stoga.study reminders will look.", url: "/settings#notifications", tag: "test" });
    return json(req, { sent });
  }

  const { data: subs, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (error) return Response.json({ error: "unavailable" }, { status: 503 });
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  if (!byUser.size) return Response.json({ checked: 0, sent: 0 });
  const { data: profiles } = await admin.from("profiles").select("user_id, first_name, notify").in("user_id", [...byUser.keys()]);

  let sent = 0;
  for (const p of profiles ?? []) {
    try {
      const prefs = toPrefs(p.notify);
      if (!prefs.study && !prefs.tests) continue;
      const local = localNow(prefs.tz);
      if (isQuiet(local.minutes, minutesOf(prefs.quiet_start), minutesOf(prefs.quiet_end))) continue;
      if (!inWindow(local.minutes, minutesOf(prefs.time))) continue;
      // Once an evening: claim today's slot first, so two overlapping runs can't both send.
      const { error: claimed } = await admin.from("notification_log").insert({ user_id: p.user_id, kind: "evening", day: local.date });
      if (claimed) continue;
      const tomorrow = new Date(Date.parse(`${local.date}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
      const [due, test, studied] = await Promise.all([
        admin.from("cards").select("id", { count: "exact", head: true }).eq("user_id", p.user_id).eq("hidden", false).eq("archived", false).lte("due", new Date().toISOString()),
        admin.from("events").select("id, title").eq("user_id", p.user_id).in("kind", ["test", "quiz"]).eq("due_on", tomorrow).limit(1).maybeSingle(),
        studiedSince(p.user_id, local.dayStart.toISOString()),
      ]);
      const msg = eveningMessage({ firstName: p.first_name, due: due.count ?? 0, testTomorrow: test.data, studiedToday: studied, prefs });
      if (!msg) continue;
      sent += await push(byUser.get(p.user_id)!, { title: msg.title, body: msg.body, url: msg.url, tag: msg.kind });
    } catch (e) {
      console.error("reminder", p.user_id, e instanceof Error ? e.message : e);
    }
  }
  return Response.json({ checked: profiles?.length ?? 0, sent });
});
