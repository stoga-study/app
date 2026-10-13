-- How deep the tutor goes by default: Simple, Standard or Deep. "Simpler" and "Go deeper" on one
-- answer are just that turn; this is what every new question starts at.
create type public.tutor_depth as enum ('simple', 'standard', 'deep');
alter table public.profiles add column tutor_depth public.tutor_depth not null default 'standard';
