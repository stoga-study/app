-- What's new: each student sees a release's changelog once, and can get a short email about it.

alter table public.profiles
  add column last_seen_version text check (char_length(last_seen_version) <= 20),
  add column email_updates boolean not null default true;
-- Everyone already here has used v1.0, so they see what is new in the next release.
update public.profiles set last_seen_version = '1.0.0';
grant update (last_seen_version, email_updates) on public.profiles to authenticated;

-- Which students were emailed about which release, so a send never repeats. Server only.
create table public.release_emails (
  version  text not null,
  user_id  uuid not null references auth.users (id) on delete cascade,
  sent_at  timestamptz not null default now(),
  primary key (version, user_id)
);
alter table public.release_emails enable row level security;
revoke all on public.release_emails from anon, authenticated;
