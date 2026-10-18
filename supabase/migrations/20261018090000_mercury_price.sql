-- Inception's Mercury 2.5, for cost tracking (ai_usage x model_prices). Prices per million tokens as listed on
-- docs.inceptionlabs.ai on 2026-10-18: a sale price, down from $0.20 / $0.02 / $0.75. Update when the sale ends.
insert into public.model_prices (model, input_per_m, cached_per_m, output_per_m, note) values
  ('mercury-2.5', 0.04, 0.004, 0.15, 'Sale price on 2026-10-18 (list $0.20 / $0.02 / $0.75 per million). Sign-up credit not counted.')
on conflict (model) do update set input_per_m = excluded.input_per_m, cached_per_m = excluded.cached_per_m, output_per_m = excluded.output_per_m, note = excluded.note, updated_at = now();
