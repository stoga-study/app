-- Independent plan: a student's own key may be for any OpenAI-compatible API, not just OpenAI.
-- Next to the encrypted key we keep the API's base URL and the model to use. Neither is secret,
-- so students can read them back for display (the key itself never leaves Vault).

alter table public.api_keys
  add column base_url text check (base_url ~ '^https://[^\s/]+(/[^\s]*)?$' and char_length(base_url) <= 300),
  add column model text check (char_length(model) between 1 and 120);
update public.api_keys set base_url = 'https://api.openai.com/v1', model = 'gpt-6-luna' where base_url is null;
alter table public.api_keys alter column base_url set not null, alter column model set not null;

alter table public.api_keys drop constraint api_keys_provider_check;
alter table public.api_keys add constraint api_keys_provider_check check (provider in ('openai', 'compatible'));

grant select (base_url, model) on public.api_keys to authenticated;

-- Save (or replace) a student's key with its API address and model. Server only.
create function public.store_byok(p_user uuid, p_key text, p_base_url text, p_model text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old uuid;
  v_new uuid;
begin
  select vault_secret_id into v_old from public.api_keys where user_id = p_user;
  if v_old is not null then
    delete from vault.secrets where id = v_old;
  end if;
  v_new := vault.create_secret(p_key, 'byok:' || p_user::text || ':' || gen_random_uuid()::text);
  insert into public.api_keys (user_id, provider, vault_secret_id, last4, base_url, model)
  values (p_user, case when p_base_url like 'https://api.openai.com/%' then 'openai' else 'compatible' end, v_new, right(p_key, 4), p_base_url, p_model)
  on conflict (user_id) do update
    set provider = excluded.provider, vault_secret_id = excluded.vault_secret_id, last4 = excluded.last4,
        base_url = excluded.base_url, model = excluded.model, created_at = now();
  update public.profiles set plan = 'independent' where user_id = p_user and plan = 'essential';
end $$;

-- Everything the server needs to call the student's own API. Server only.
create function public.read_byok(p_user uuid) returns table (api_key text, base_url text, model text)
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret, k.base_url, k.model
    from public.api_keys k
    join vault.decrypted_secrets s on s.id = k.vault_secret_id
   where k.user_id = p_user
$$;

revoke execute on function public.store_byok(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.read_byok(uuid) from public, anon, authenticated;
grant execute on function public.store_byok(uuid, text, text, text) to service_role;
grant execute on function public.read_byok(uuid) to service_role;

-- The old single-provider functions are replaced by the two above.
drop function public.store_api_key(uuid, text, text);
drop function public.read_api_key(uuid);
