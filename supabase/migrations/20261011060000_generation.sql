-- Study-set generation runs as a chain of small jobs, one chunk of pages each. gen_part records which
-- job made a row, so a retried job replaces its own rows instead of duplicating them.
alter table public.notes_sections add column gen_part smallint;
alter table public.cards add column gen_part smallint;
create index notes_sections_gen_idx on public.notes_sections (source_id, gen_part);
create index cards_gen_idx on public.cards (source_id, gen_part);
