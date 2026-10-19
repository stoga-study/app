// Sends the evening reminders, called by a schedule every 15 minutes (pg_cron, see the push migration).
//
// POST {}  → { checked, sent }
// For each student with a phone subscribed: in their own time zone, at the time they chose, outside
// quiet hours, at most once a day per kind: a test tomorrow, homework due tomorrow, or due cards if they
// haven't studied today. Each run also tells group members when a classmate shared a set (at most once a day
// per group, first names only).
// Anyone can call it, but it only ever sends what is due, once (the log has a unique key per day), so
// calling it more often sends nothing extra.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { eveningMessage, groupMessage, inWindow, isQuiet, localNow, minutesOf, toPrefs, type Kind, type Sent } from "../_lib/notify.ts";
import { notifyStudent, pushTo, type Payload, type Sub } from "../_lib/push.ts";
import { corsHeaders, json } from "../_lib/cors.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const push = (subs: Sub[], payload: Payload) => pushTo(admin, subs, payload);

/** Sets shared into groups since the last run (runs are 15 minutes apart; the log stops repeats): tell the other members. */
async function groupActivity() {
  const since = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data: shared } = await admin.from("group_sets").select("id, group_id, shared_by, source_id, created_at, hidden_at").gte("created_at", since).is("hidden_at", null).order("created_at");
  let sent = 0;
  for (const g of shared ?? []) {
    const [{ data: group }, { data: members }, { data: src }] = await Promise.all([
      admin.from("groups").select("name").eq("id", g.group_id).maybeSingle(),
      admin.from("group_members").select("user_id, display_name").eq("group_id", g.group_id),
      admin.from("sources").select("filename").eq("id", g.source_id).maybeSingle(),
    ]);
    if (!group || !src) continue;
    const who = members?.find((m) => m.user_id === g.shared_by)?.display_name ?? "A classmate";
    for (const m of members ?? []) {
      if (m.user_id === g.shared_by) continue;
      sent += await notifyStudent(admin, m.user_id, "groups", `group:${g.group_id}`, groupMessage(who, src.filename, group.name, g.group_id));
    }
  }
  return sent;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** When the student last studied (real studying only), as an instant, or null. */
async function lastStudied(userId: string) {
  const [r, q, t] = await Promise.all([
    admin.from("card_reviews").select("reviewed_at").eq("user_id", userId).order("reviewed_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("quiz_attempts").select("created_at").eq("user_id", userId).neq("answers", "[]").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("practice_tests").select("finished_at").eq("user_id", userId).order("finished_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const all = [r.data?.reviewed_at, q.data?.created_at, t.data?.finished_at].filter((x): x is string => !!x).sort();
  return all.at(-1) ?? null;
}

/** The lowest quiz or practice-test score since the student's day began, as a percentage. */
async function worstScoreSince(userId: string, since: string) {
  const [q, t] = await Promise.all([
    admin.from("quiz_attempts").select("correct, total").eq("user_id", userId).gte("finished_at", since).gte("total", 5),
    admin.from("practice_tests").select("pct").eq("user_id", userId).gte("finished_at", since),
  ]);
  const scores = [...(q.data ?? []).map((a) => Math.round((100 * a.correct) / a.total)), ...(t.data ?? []).map((x) => x.pct)];
  return scores.length ? Math.min(...scores) : null;
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

  const groupsSent = await groupActivity().catch((e) => { console.error("group activity", e instanceof Error ? e.message : e); return 0; });
  const { data: subs, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (error) return Response.json({ error: "unavailable" }, { status: 503 });
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  if (!byUser.size) return Response.json({ checked: 0, sent: groupsSent });
  const { data: profiles } = await admin.from("profiles").select("user_id, first_name, notify, coach").in("user_id", [...byUser.keys()]);

  let sent = 0;
  for (const p of profiles ?? []) {
    try {
      const prefs = toPrefs(p.notify);
      if (!prefs.study && !prefs.tests && !prefs.homework && !prefs.checkins) continue;
      const local = localNow(prefs.tz);
      if (isQuiet(local.minutes, minutesOf(prefs.quiet_start), minutesOf(prefs.quiet_end))) continue;
      if (!inWindow(local.minutes, minutesOf(prefs.time))) continue;
      // Once an evening: claim today's slot first, so two overlapping runs can't both send.
      const { error: claimed } = await admin.from("notification_log").insert({ user_id: p.user_id, kind: "evening", day: local.date });
      if (claimed) continue;
      const tomorrow = new Date(Date.parse(`${local.date}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
      const [due, test, homework, soon, last, worst, log] = await Promise.all([
        admin.from("cards").select("id", { count: "exact", head: true }).eq("user_id", p.user_id).eq("hidden", false).eq("archived", false).lte("due", new Date().toISOString()),
        admin.from("events").select("id, title").eq("user_id", p.user_id).in("kind", ["test", "quiz"]).eq("due_on", tomorrow).limit(1).maybeSingle(),
        admin.from("events").select("title").eq("user_id", p.user_id).in("kind", ["homework", "project"]).eq("due_on", tomorrow).is("done_at", null).order("created_at").limit(10),
        admin.from("events").select("id, title, due_on").eq("user_id", p.user_id).in("kind", ["test", "quiz"]).gt("due_on", tomorrow).lte("due_on", addDay(local.date, 5)).order("due_on").limit(1).maybeSingle(),
        lastStudied(p.user_id),
        worstScoreSince(p.user_id, local.dayStart.toISOString()),
        admin.from("notification_log").select("kind, day, variant").eq("user_id", p.user_id).gte("day", addDay(local.date, -14)).neq("kind", "evening").order("day", { ascending: false }),
      ]);
      const sentBefore: Sent = {};
      for (const l of log.data ?? []) sentBefore[l.kind as Kind] ??= { daysAgo: dayDiff(l.day, local.date), variant: l.variant };
      const lastDay = last ? localNow(prefs.tz, new Date(last)).date : null;
      const coach = p.coach && typeof p.coach === "object" && typeof (p.coach as { name?: unknown }).name === "string" ? String((p.coach as { name: string }).name).slice(0, 24) : "Coach";
      const msg = eveningMessage({
        firstName: p.first_name,
        coachName: coach,
        due: due.count ?? 0,
        testTomorrow: test.data,
        homeworkTomorrow: homework.data?.length ? { title: homework.data[0].title, count: homework.data.length } : null,
        testSoon: soon.data ? { id: soon.data.id, title: soon.data.title, when: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${soon.data.due_on}T12:00:00Z`)) } : null,
        studiedToday: lastDay === local.date,
        daysSinceStudy: lastDay ? dayDiff(lastDay, local.date) : null,
        worstScoreToday: worst,
        sent: sentBefore,
        prefs,
      });
      if (!msg) continue;
      await admin.from("notification_log").insert({ user_id: p.user_id, kind: msg.kind, day: local.date, variant: msg.variant });
      sent += await push(byUser.get(p.user_id)!, { title: msg.title, body: msg.body, url: msg.url, tag: msg.kind });
    } catch (e) {
      console.error("reminder", p.user_id, e instanceof Error ? e.message : e);
    }
  }
  return Response.json({ checked: profiles?.length ?? 0, sent: sent + groupsSent });
});
