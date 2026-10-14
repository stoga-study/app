-- v1.4.11: faces (a Notion Faces-style avatar made of parts) for the student and their coach, and
-- the coach's name, personality and reply length. Faces are small JSON objects of part choices,
-- checked by the app; the server only reads the coach's name, vibe and length.

alter table public.profiles
  add column avatar jsonb check (avatar is null or (jsonb_typeof(avatar) = 'object' and pg_column_size(avatar) < 2000)),
  add column coach jsonb check (coach is null or (jsonb_typeof(coach) = 'object' and pg_column_size(coach) < 3000));
grant update (avatar, coach) on public.profiles to authenticated;
