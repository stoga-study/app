-- v1.5.4: phone notifications. A device's push subscription, the student's notification settings,
-- and a log so each kind goes out at most once a day. A schedule calls send-reminders every 15
-- minutes; the function decides who (if anyone) gets what, so calling it more often sends nothing extra.

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "owner can do everything" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- { study: bool, tests: bool, time: "HH:MM", quiet_start: "HH:MM", quiet_end: "HH:MM", tz: "America/New_York" }
alter table public.profiles
  add column notify jsonb check (notify is null or (jsonb_typeof(notify) = 'object' and pg_column_size(notify) < 1000));
grant update (notify) on public.profiles to authenticated;

-- Written only by the server.
create table public.notification_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  kind     text not null,
  day      date not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind, day)
);
alter table public.notification_log enable row level security;
create policy "owner reads" on public.notification_log for select to authenticated using (user_id = (select auth.uid()));

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule(
  'send-reminders',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://sqjggemcqpnejhkfqcev.supabase.co/functions/v1/send-reminders',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 55000
     ) $$
);
