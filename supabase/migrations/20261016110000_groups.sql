-- v1.7.1: invite-only study groups. Join with a code or link, at most 40 members, first names only,
-- and no chat between students (they are minors). Members share study sets into the group; anyone in
-- it can add a private copy (through the share function). The owner can remove people; anyone can
-- leave; when the owner leaves, the longest-standing member takes over, and an empty group goes away.

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  code        text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id      uuid not null references public.groups (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 40),
  joined_at     timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.group_sets (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  source_id   uuid not null references public.sources (id) on delete cascade,
  shared_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (group_id, source_id)
);
create index group_sets_group_idx on public.group_sets (group_id, created_at desc);

alter table public.sources add column copied_from_set uuid references public.group_sets (id) on delete set null;

-- Membership checks without recursive policies.
create or replace function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = auth.uid());
$$;
revoke all on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_sets enable row level security;

create policy "members see the group" on public.groups for select to authenticated using (public.is_group_member(id));
create policy "owner renames" on public.groups for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke update on public.groups from authenticated;
grant update (name) on public.groups to authenticated;

create policy "members see members" on public.group_members for select to authenticated using (public.is_group_member(group_id));
-- Leave yourself, or (as owner) remove someone.
create policy "leave or remove" on public.group_members for delete to authenticated using (
  user_id = (select auth.uid()) or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid()))
);

create policy "members see sets" on public.group_sets for select to authenticated using (public.is_group_member(group_id));
-- Share your own file into a group you're in.
create policy "members share their own" on public.group_sets for insert to authenticated with check (
  shared_by = (select auth.uid()) and public.is_group_member(group_id)
  and exists (select 1 from public.sources s where s.id = source_id and s.user_id = (select auth.uid()))
);
-- Unshare your own, or (as owner) take any set down.
create policy "unshare" on public.group_sets for delete to authenticated using (
  shared_by = (select auth.uid()) or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid()))
);

/** A readable, unambiguous code (no 0/O, 1/I). */
create or replace function public.new_group_code() returns text language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 8);
$$;

/** Make a group, with you as owner and first member. Up to 10 groups owned each. */
create or replace function public.create_group(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  gid uuid;
  nm text := left(coalesce((select split_part(trim(first_name), ' ', 1) from public.profiles where user_id = me), ''), 40);
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if (select count(*) from public.groups where owner_id = me) >= 10 then raise exception 'group_limit'; end if;
  insert into public.groups (owner_id, name, code) values (me, left(trim(p_name), 60), public.new_group_code()) returning id into gid;
  insert into public.group_members (group_id, user_id, display_name) values (gid, me, coalesce(nullif(nm, ''), 'Student'));
  return gid;
end;
$$;

/** Join with a code. At most 40 members. */
create or replace function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  g public.groups;
  nm text := left(coalesce((select split_part(trim(first_name), ' ', 1) from public.profiles where user_id = me), ''), 40);
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into g from public.groups where code = upper(trim(p_code));
  if not found then raise exception 'no_group'; end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = me) then return g.id; end if;
  if (select count(*) from public.group_members where group_id = g.id) >= 40 then raise exception 'group_full'; end if;
  insert into public.group_members (group_id, user_id, display_name) values (g.id, me, coalesce(nullif(nm, ''), 'Student'));
  return g.id;
end;
$$;

/** The name and size of a group behind a code, for the join screen (nothing else about it). */
create or replace function public.peek_group(p_code text) returns table (name text, members integer, joined boolean)
language sql stable security definer set search_path = '' as $$
  select g.name, (select count(*)::int from public.group_members m where m.group_id = g.id),
         exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid())
    from public.groups g where g.code = upper(trim(p_code));
$$;

/** When the owner leaves, the longest-standing member takes over; an empty group is removed. */
create or replace function public.group_after_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
declare heir uuid;
begin
  if not exists (select 1 from public.group_members where group_id = old.group_id) then
    delete from public.groups where id = old.group_id;
  elsif exists (select 1 from public.groups where id = old.group_id and owner_id = old.user_id) then
    select user_id into heir from public.group_members where group_id = old.group_id order by joined_at limit 1;
    update public.groups set owner_id = heir where id = old.group_id;
  end if;
  -- Sets they shared leave with them.
  delete from public.group_sets where group_id = old.group_id and shared_by = old.user_id;
  return null;
end;
$$;
create trigger group_after_leave after delete on public.group_members for each row execute function public.group_after_leave();

/** A new code (owner only), so an old link stops working. */
create or replace function public.reset_group_code(p_group uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare c text := public.new_group_code();
begin
  update public.groups set code = c where id = p_group and owner_id = auth.uid();
  if not found then raise exception 'not_owner'; end if;
  return c;
end;
$$;

revoke all on function public.create_group(text), public.join_group(text), public.peek_group(text), public.reset_group_code(uuid), public.new_group_code() from public, anon;
grant execute on function public.create_group(text), public.join_group(text), public.peek_group(text), public.reset_group_code(uuid) to authenticated;
