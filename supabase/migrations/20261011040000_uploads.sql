-- Starting and undoing an upload. These run as the student (auth.uid()) and only ever touch their
-- own rows and allowance, so the app can call them directly.

create function public.begin_upload(p_subject uuid, p_filename text, p_kind text, p_bytes integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_byok boolean;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.subjects where id = p_subject and user_id = v_user) then
    raise exception 'subject_not_found' using errcode = 'P0002';
  end if;
  v_byok := exists (select 1 from public.api_keys where user_id = v_user);
  if not public.consume_allowance(v_user, 'upload', v_byok) then
    raise exception 'upload_limit' using errcode = 'P0001';
  end if;
  insert into public.sources (user_id, subject_id, filename, kind, bytes, status)
  values (v_user, p_subject, p_filename, p_kind, p_bytes, 'uploaded')
  returning id into v_id;
  return v_id;
end $$;

-- Undo an upload that failed before its text was saved, and give the upload back.
create function public.cancel_upload(p_source uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  delete from public.sources where id = p_source and user_id = v_user and status = 'uploaded';
  if found then
    perform public.refund_allowance(v_user, 'upload');
  end if;
end $$;

revoke execute on function public.begin_upload(uuid, text, text, integer) from public, anon;
revoke execute on function public.cancel_upload(uuid) from public, anon;
grant execute on function public.begin_upload(uuid, text, text, integer) to authenticated;
grant execute on function public.cancel_upload(uuid) to authenticated;
