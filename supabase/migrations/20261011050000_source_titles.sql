-- Sources show a readable title (sources.filename); the file's real name is kept here.
alter table public.sources add column original_filename text check (char_length(original_filename) <= 255);
update public.sources set original_filename = filename where original_filename is null;
