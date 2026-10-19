-- v1.9.0: feedback from any screen. Each message can carry where it came from (the screen and, when there is
-- one, the item), the app build and the device size, and an optional screenshot the student chose to attach.
-- Screenshots live in a private bucket, in the student's own folder; only the team reads them (server key).

alter table public.feedback
  add column screenshot_path text check (screenshot_path is null or char_length(screenshot_path) <= 200),
  add column build text check (char_length(build) <= 60),
  add column device text check (char_length(device) <= 160),
  add column status text not null default 'new' check (status in ('new', 'seen', 'fixed', 'wont_fix'));

-- A screenshot path must be in the sender's own folder.
drop policy "signed-in students send feedback" on public.feedback;
create policy "signed-in students send feedback" on public.feedback for insert to authenticated
  with check ((user_id is null or user_id = (select auth.uid())) and (screenshot_path is null or screenshot_path like (select auth.uid())::text || '/%'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 3145728, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Students can add a screenshot to their own folder, never read or list anyone's (the team reads with the server key).
create policy "students upload their own feedback screenshots" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);
