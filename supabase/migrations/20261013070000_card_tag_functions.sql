-- Tag or untag many cards in one request. Run as the student, so row-level security limits them
-- to their own cards. A card keeps at most 20 tags.
create function public.tag_cards(card_ids uuid[], tag text) returns void
language sql security invoker set search_path = '' as $$
  update public.cards set tags = array_append(tags, tag)
  where id = any(card_ids) and not (tag = any(tags)) and cardinality(tags) < 20
    and char_length(tag) between 1 and 30;
$$;
create function public.untag_cards(card_ids uuid[], tag text) returns void
language sql security invoker set search_path = '' as $$
  update public.cards set tags = array_remove(tags, tag) where id = any(card_ids) and tag = any(tags);
$$;
revoke execute on function public.tag_cards(uuid[], text) from public, anon;
revoke execute on function public.untag_cards(uuid[], text) from public, anon;
grant execute on function public.tag_cards(uuid[], text) to authenticated;
grant execute on function public.untag_cards(uuid[], text) to authenticated;
