-- Shared study sets: when two students upload the byte-for-byte same file (a teacher's handout, say),
-- the second one gets a private copy of the finished study set instantly, with no AI cost.
--
-- Privacy: only identical files match, so a student's own notes never match anyone else's. The
-- shared copy is a pristine snapshot taken when generation finished, before any student edits, and
-- it lives in a table that no student can read. Students only ever see their own private copy.

-- SHA-256 of the uploaded file, computed on the device.
alter table public.sources add column content_hash text check (content_hash ~ '^[0-9a-f]{64}$');
create index sources_content_hash_idx on public.sources (content_hash) where content_hash is not null;

create table public.shared_sets (
  content_hash  text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  -- Bumped when the study-set prompts change, so improved prompts make fresh sets instead of reusing old ones.
  gen_version   integer not null,
  kind          text not null,
  page_count    integer not null,
  -- { notes: [...], guide: [...], cards: [...], quiz: { title, questions: [...] } | null }
  payload       jsonb not null,
  uses          integer not null default 0,
  created_at    timestamptz not null default now(),
  primary key (content_hash, gen_version)
);

-- Server only: row-level security with no policies means students can neither read nor write it.
alter table public.shared_sets enable row level security;
revoke all on public.shared_sets from anon, authenticated;
