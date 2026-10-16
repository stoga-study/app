-- v1.5.5: comeback nudges and coach check-ins. The log remembers which wording went out, so the
-- next one of that kind uses a different one.
alter table public.notification_log add column variant smallint not null default 0;
create index if not exists notification_log_user_day_idx on public.notification_log (user_id, day desc);
