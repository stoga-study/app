-- Count copies made from a share link (called by the share function, with server rights).
create or replace function public.increment_share_copies(p_link uuid) returns void
language sql security definer set search_path = '' as $$
  update public.share_links set copies = copies + 1 where id = p_link;
$$;
revoke all on function public.increment_share_copies(uuid) from public, anon, authenticated;
