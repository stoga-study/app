-- v1.8.3: privacy controls. A student can stop their study sets being offered to others who upload the
-- same file (and take back the ones already offered), and delete their tutor conversations.

alter table public.profiles add column share_study_sets boolean not null default true;

-- Who first made each shared study set, so they can take it back. Older sets have no record.
alter table public.shared_sets add column contributor uuid references auth.users (id) on delete set null;
create index shared_sets_contributor_idx on public.shared_sets (contributor) where contributor is not null;

/** Turn sharing of your study sets on or off. Off also removes the ones you already shared; copies other
 * students already made are theirs and stay. */
create or replace function public.set_share_study_sets(p_on boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare removed integer := 0;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update public.profiles set share_study_sets = p_on where user_id = auth.uid();
  if not p_on then
    delete from public.shared_sets where contributor = auth.uid();
    get diagnostics removed = row_count;
  end if;
  return removed;
end;
$$;

/** Delete every tutor conversation (their messages go with them). */
create or replace function public.delete_tutor_chats() returns integer
language sql security invoker set search_path = '' as $$
  with gone as (delete from public.chat_threads where user_id = (select auth.uid()) returning 1)
  select count(*)::int from gone;
$$;

revoke all on function public.set_share_study_sets(boolean), public.delete_tutor_chats() from public, anon;
grant execute on function public.set_share_study_sets(boolean), public.delete_tutor_chats() to authenticated;
