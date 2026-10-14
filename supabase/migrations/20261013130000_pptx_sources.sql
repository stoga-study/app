-- PowerPoint files (and Google Slides exported as .pptx): each slide becomes a page, with its notes.
alter table public.sources drop constraint sources_kind_check;
alter table public.sources add constraint sources_kind_check check (kind in ('pdf', 'docx', 'text', 'image', 'pptx'));
