-- v1.9.4: testimonials with clear consent. Students are minors and quotes go on the public landing page, so each
-- one records the student's own OK and that a parent or guardian is OK too, how they want to be named (the name is
-- fixed when they submit), and is checked by the team before it appears. A student can withdraw it at any time.
create table public.testimonials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote         text not null check (char_length(trim(quote)) between 10 and 400),
  display       text not null check (display in ('name_grade', 'grade', 'anonymous')),
  display_name  text not null check (char_length(display_name) between 1 and 60),
  self_ok       boolean not null check (self_ok),
  guardian_ok   boolean not null check (guardian_ok),
  status        text not null default 'review' check (status in ('review', 'approved', 'rejected', 'withdrawn')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);
alter table public.testimonials enable row level security;
create policy "own testimonials" on public.testimonials for select to authenticated using (user_id = (select auth.uid()));
create policy "share one" on public.testimonials for insert to authenticated with check (user_id = (select auth.uid()) and status = 'review');
revoke insert, update, delete on public.testimonials from authenticated;
grant insert (quote, display, display_name, self_ok, guardian_ok) on public.testimonials to authenticated;

/** Take a testimonial back: it leaves the landing page's export straight away. */
create or replace function public.withdraw_testimonial(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.testimonials set status = 'withdrawn', decided_at = now() where id = p_id and user_id = auth.uid() and status <> 'withdrawn';
  if not found then raise exception 'not_found'; end if;
end;
$$;
revoke all on function public.withdraw_testimonial(uuid) from public, anon;
grant execute on function public.withdraw_testimonial(uuid) to authenticated;
