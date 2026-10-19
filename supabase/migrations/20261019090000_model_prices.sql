-- Mercury prices for cost tracking, as listed on docs.inceptionlabs.ai on 2026-10-19 (per million tokens).
-- The Mercury 2.5 sale has ended (now list price). Mercury 3 launched today at 50% off its list price of
-- $0.20 / $0.02 / $0.70; update its row when the launch offer ends.
insert into public.model_prices (model, input_per_m, cached_per_m, output_per_m, note) values
  ('mercury-2.5', 0.20, 0.02, 0.75, 'List price from 2026-10-19 (the launch sale ended).'),
  ('mercury-3',   0.10, 0.01, 0.35, 'Launch price on 2026-10-19, 50% off list ($0.20 / $0.02 / $0.70).')
on conflict (model) do update set input_per_m = excluded.input_per_m, cached_per_m = excluded.cached_per_m, output_per_m = excluded.output_per_m, note = excluded.note, updated_at = now();
