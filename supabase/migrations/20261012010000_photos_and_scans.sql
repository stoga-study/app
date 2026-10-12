-- Photos of notes are a source kind of their own (one page each). Scanned PDFs stay "pdf".
alter table public.sources drop constraint sources_kind_check;
alter table public.sources add constraint sources_kind_check check (kind in ('pdf', 'docx', 'text', 'image'));
