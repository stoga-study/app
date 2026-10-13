-- The previous migration's CREATE OR REPLACE added a second overload instead of truly replacing the
-- 3-argument version (Postgres only folds new trailing-default params into the same function when the
-- call sites match exactly; two overloads now exist). Drop the stale 3-argument one explicitly.
drop function if exists public.search_pages(uuid, text, integer);
