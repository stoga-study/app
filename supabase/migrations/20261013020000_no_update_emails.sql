-- Update emails were dropped: remove the opt-out flag and the send log.
alter table public.profiles drop column email_updates;
drop table public.release_emails;
