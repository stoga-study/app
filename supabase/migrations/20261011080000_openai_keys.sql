-- Stoga.study now runs on OpenAI, so a student's own key is an OpenAI key.
-- Groq keys saved earlier cannot be used any more: remove them and their Vault secrets.
delete from vault.secrets s using public.api_keys k where k.vault_secret_id = s.id and k.provider = 'groq';
delete from public.api_keys where provider = 'groq';

alter table public.api_keys drop constraint api_keys_provider_check;
alter table public.api_keys alter column provider set default 'openai';
alter table public.api_keys add constraint api_keys_provider_check check (provider in ('openai'));
