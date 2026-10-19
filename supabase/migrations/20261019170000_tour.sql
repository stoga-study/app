-- v1.9.2: the short tour for new students. Students who joined before it are marked as having seen it.
alter table public.profiles add column tour_seen_at timestamptz;
update public.profiles set tour_seen_at = now() where tour_seen_at is null;
grant update (tour_seen_at) on public.profiles to authenticated;
