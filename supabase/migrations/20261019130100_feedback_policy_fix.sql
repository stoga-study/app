-- Feedback is always from the signed-in sender (as before v1.9.0), and a screenshot must be in their own folder.
drop policy "signed-in students send feedback" on public.feedback;
create policy "signed-in students send feedback" on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()) and (screenshot_path is null or screenshot_path like (select auth.uid())::text || '/%'));
