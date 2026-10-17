-- v1.8.4: support access. A student can give a parent, guardian, tutor or counselor a private, read-only
-- link to how studying is going, what's coming up and how ready they are. Never notes, chats or files.
-- The link needs no account; it expires, the student can turn it off any time, and sees when it was opened.

create table public.support_links (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token           text not null unique check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  label           text not null check (char_length(label) between 1 and 40),
  relation        text not null check (relation in ('parent', 'guardian', 'tutor', 'counselor', 'other')),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '90 days',
  revoked_at      timestamptz,
  last_viewed_at  timestamptz,
  views           integer not null default 0
);
create index support_links_user_idx on public.support_links (user_id, created_at desc);

alter table public.support_links enable row level security;
-- The student sees their own links. Making and turning off go through the functions below.
create policy "owner reads" on public.support_links for select to authenticated using (user_id = (select auth.uid()));

/** A new link (at most 5 working at once). */
create or replace function public.create_support_link(p_label text, p_relation text) returns public.support_links
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  row public.support_links;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if (select count(*) from public.support_links where user_id = me and revoked_at is null and expires_at > now()) >= 5 then raise exception 'too_many'; end if;
  insert into public.support_links (user_id, token, label, relation)
  values (me, translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_'), left(trim(p_label), 40), p_relation)
  returning * into row;
  return row;
end;
$$;

/** Turn a link off for good. */
create or replace function public.revoke_support_link(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.support_links set revoked_at = now() where id = p_id and user_id = auth.uid() and revoked_at is null;
  if not found then raise exception 'not_found'; end if;
end;
$$;

revoke all on function public.create_support_link(text, text), public.revoke_support_link(uuid) from public, anon;
grant execute on function public.create_support_link(text, text), public.revoke_support_link(uuid) to authenticated;
