-- v1.7.3: reporting shared content, and moderation. Anyone who can see a shared set (a group member,
-- or someone holding a working link) can report it once. After 3 different students report the same
-- thing, it is hidden (a group set leaves the library; a link stops working) until a person reviews it
-- in the admin dashboard. Group owners can still take things down, and restore what was hidden.

alter table public.group_sets add column hidden_at timestamptz;

create table public.share_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_type  text not null check (target_type in ('group_set', 'share_link')),
  target_id    uuid not null,
  reason       text not null check (reason in ('inappropriate', 'bullying', 'personal_info', 'wrong', 'spam', 'other')),
  details      text check (char_length(details) <= 500),
  status       text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  unique (reporter_id, target_type, target_id)
);
create index share_reports_target_idx on public.share_reports (target_type, target_id, status);
alter table public.share_reports enable row level security;
create policy "reporter reads own" on public.share_reports for select to authenticated using (reporter_id = (select auth.uid()));

/** Report a group set or share link you can see. Returns whether it is now hidden. */
create or replace function public.report_shared(p_type text, p_target uuid, p_reason text, p_details text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  n integer;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_type = 'group_set' then
    if not exists (select 1 from public.group_sets s join public.group_members m on m.group_id = s.group_id and m.user_id = me where s.id = p_target) then raise exception 'not_found'; end if;
  elsif p_type = 'share_link' then
    if not exists (select 1 from public.share_links where id = p_target and revoked_at is null and expires_at > now()) then raise exception 'not_found'; end if;
  else
    raise exception 'bad_type';
  end if;
  insert into public.share_reports (reporter_id, target_type, target_id, reason, details)
    values (me, p_type, p_target, p_reason, nullif(left(trim(coalesce(p_details, '')), 500), ''))
    on conflict (reporter_id, target_type, target_id) do update set reason = excluded.reason, details = excluded.details, status = 'open', created_at = now();
  select count(distinct reporter_id) into n from public.share_reports where target_type = p_type and target_id = p_target and status = 'open';
  if n >= 3 then
    if p_type = 'group_set' then update public.group_sets set hidden_at = coalesce(hidden_at, now()) where id = p_target;
    else update public.share_links set revoked_at = coalesce(revoked_at, now()) where id = p_target;
    end if;
    return true;
  end if;
  return false;
end;
$$;
revoke all on function public.report_shared(text, uuid, text, text) from public, anon;
grant execute on function public.report_shared(text, uuid, text, text) to authenticated;

/** A group owner restores a set that reports hid. */
create or replace function public.restore_group_set(p_set uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.group_sets s set hidden_at = null
   where s.id = p_set and exists (select 1 from public.groups g where g.id = s.group_id and g.owner_id = auth.uid());
  if not found then raise exception 'not_owner'; end if;
end;
$$;
revoke all on function public.restore_group_set(uuid) from public, anon;
grant execute on function public.restore_group_set(uuid) to authenticated;
