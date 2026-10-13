-- profiles.update is column-gated (see init.sql); the new tutor_depth column needs its own grant,
-- the same way review_retention got one, or a student's own save silently does nothing.
grant update (tutor_depth) on public.profiles to authenticated;
