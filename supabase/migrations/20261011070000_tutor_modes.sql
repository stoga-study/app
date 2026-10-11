-- What kind of reply each tutor answer is. Only "hint" and "check" use the hint ladder.
-- Older answers have no mode and are shown as hints, which is what they were.
alter table public.chat_messages
  add column mode text check (mode in ('chat', 'explain', 'hint', 'check'));
