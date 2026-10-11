-- Privacy and allowance checks. Runs in a transaction and rolls back: nothing is left behind.
-- Usage: npx supabase db query --linked -f supabase/tests/rls_check.sql
begin;

create temp table results (n serial, test text, pass boolean, detail text);
grant all on results to authenticated, service_role;
grant usage on sequence results_n_seq to authenticated, service_role;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  subj uuid;
  src uuid;
  n integer;
  ok boolean;
  i integer;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'rls-a-' || a || '@example.com', 'authenticated', 'authenticated'),
    (b, 'rls-b-' || b || '@example.com', 'authenticated', 'authenticated');

  select count(*) into n from public.profiles where user_id in (a, b);
  insert into results (test, pass, detail) values ('profiles created by trigger', n = 2, n::text);

  -- Act as student A.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.subjects (name, area) values ('AP Statistics', 'Math') returning id into subj;
  insert into public.sources (subject_id, filename, kind) values (subj, 'Week 5 Sampling.pdf', 'pdf') returning id into src;
  insert into public.source_pages (source_id, page_no, text) values
    (src, 12, 'The standard error of the mean is sigma divided by the square root of n.'),
    (src, 15, 'The central limit theorem says sampling distributions approach normal.');
  insert into public.cards (subject_id, source_id, front, back, pages) values (subj, src, 'What does the standard error measure?', 'Spread of sample means.', '{12}');
  select count(*) into n from public.search_pages(subj, 'standard error');
  insert into results (test, pass, detail) values ('A finds own page via search', n = 1, n::text);

  begin
    update public.profiles set plan = 'unlimited' where user_id = a;
    insert into results (test, pass, detail) values ('A cannot upgrade own plan', false, 'update succeeded');
  exception when insufficient_privilege then
    insert into results (test, pass, detail) values ('A cannot upgrade own plan', true, 'permission denied');
  end;

  update public.profiles set first_name = 'Aarav' where user_id = a;
  get diagnostics n = row_count;
  insert into results (test, pass, detail) values ('A can edit own first name', n = 1, n::text);

  begin
    perform public.consume_allowance(a, 'tutor_message');
    insert into results (test, pass, detail) values ('students cannot call consume_allowance', false, 'call succeeded');
  exception when insufficient_privilege then
    insert into results (test, pass, detail) values ('students cannot call consume_allowance', true, 'permission denied');
  end;

  -- Act as student B.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.subjects where id = subj;
  insert into results (test, pass, detail) values ('B cannot see A''s subject', n = 0, n::text);
  select count(*) into n from public.source_pages where source_id = src;
  insert into results (test, pass, detail) values ('B cannot see A''s pages', n = 0, n::text);
  select count(*) into n from public.cards;
  insert into results (test, pass, detail) values ('B sees no cards', n = 0, n::text);
  select count(*) into n from public.search_pages(subj, 'standard error');
  insert into results (test, pass, detail) values ('B cannot search A''s pages', n = 0, n::text);
  update public.cards set front = 'hacked' where subject_id = subj;
  get diagnostics n = row_count;
  insert into results (test, pass, detail) values ('B cannot edit A''s cards', n = 0, n::text);
  delete from public.sources where id = src;
  get diagnostics n = row_count;
  insert into results (test, pass, detail) values ('B cannot delete A''s source', n = 0, n::text);
  begin
    insert into public.cards (user_id, subject_id, front, back) values (a, subj, 'planted', 'planted');
    insert into results (test, pass, detail) values ('B cannot write rows as A', false, 'insert succeeded');
  exception when insufficient_privilege or check_violation then
    insert into results (test, pass, detail) values ('B cannot write rows as A', true, sqlerrm);
  end;
  begin
    insert into public.cards (subject_id, front, back) values (subj, 'attached', 'attached');
    insert into results (test, pass, detail) values ('B cannot attach rows to A''s subject', false, 'insert succeeded');
  exception when foreign_key_violation then
    insert into results (test, pass, detail) values ('B cannot attach rows to A''s subject', true, 'foreign key refused');
  end;
  begin
    perform vault_secret_id from public.api_keys;
    insert into results (test, pass, detail) values ('vault secret id is not readable', false, 'select succeeded');
  exception when insufficient_privilege then
    insert into results (test, pass, detail) values ('vault secret id is not readable', true, 'permission denied');
  end;
  select count(*) into n from public.allowance_status();
  insert into results (test, pass, detail) values ('B reads own allowance status', n = 2, n::text);

  -- Edge Functions run as service_role: the 51st tutor message of the day is refused.
  execute 'reset role';
  execute 'set local role service_role';
  for i in 1..50 loop
    ok := public.consume_allowance(a, 'tutor_message');
    if not ok then exit; end if;
  end loop;
  insert into results (test, pass, detail) values ('50 messages allowed', ok, i::text);
  ok := public.consume_allowance(a, 'tutor_message');
  insert into results (test, pass, detail) values ('51st message refused', not ok, ok::text);
  ok := public.consume_allowance(a, 'tutor_message', true);
  insert into results (test, pass, detail) values ('BYOK skips the limit', ok, ok::text);
  perform public.refund_allowance(a, 'tutor_message');
  perform public.refund_allowance(a, 'tutor_message');
  ok := public.consume_allowance(a, 'tutor_message');
  insert into results (test, pass, detail) values ('refund gives a message back', ok, ok::text);
  execute 'reset role';
end $$;

select test, case when pass then 'PASS' else 'FAIL' end as result, detail from results order by n;
rollback;
