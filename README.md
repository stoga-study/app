# Stoga.study app

The Stoga.study progressive web app: free, calm study help from your own notes.

**Stack:** Vite + React + TypeScript, Tailwind CSS, shadcn-style components, vite-plugin-pwa, Supabase (Auth, Postgres, Storage, Edge Functions), OpenAI (`gpt-6-luna`, swappable for any OpenAI-compatible model), hosted on Cloudflare Workers (static assets).

## Develop

```bash
npm install
cp .env.example .env.local   # add your Supabase URL and publishable key
npm run dev                  # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript project check |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run build` | Production build to `dist/`, including the service worker |

## Deploy (Cloudflare Workers)

The app is static files served by a Cloudflare Worker (`wrangler.jsonc`). It has no server code; the backend is Supabase.

1. In Cloudflare, go to **Workers & Pages → Create → Import a repository** and pick `stoga-study/app`. The Worker's name must match `name` in `wrangler.jsonc` (currently `app`).
2. Build command `npm run build`. Deploy command `npx wrangler deploy` (it uses the pinned `wrangler` dev dependency). `.node-version` pins Node 22.
3. Under **Settings → Build → Variables and secrets**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. They are *build* variables, because Vite bakes them into the files.
4. Under **Settings → Domains & Routes**, add the custom domain `beta.stoga.study`. stoga.study's DNS is on Cloudflare, so the record and certificate are created automatically.

Every push to `main` deploys. `wrangler.jsonc` sends unknown paths (like `/sources/123`) to `index.html` for the app's router. `public/_headers` sets the Content Security Policy (network calls only to `*.supabase.co`), the other security headers, and caching. Run `npx wrangler dev` after a build to try it exactly as Cloudflare serves it.

The AI key is never shipped to the browser. It is stored as a Supabase Edge Function secret:

```bash
npx supabase@2.120.0 secrets set OPENAI_API_KEY=sk-...
```

### Students' own keys (Independent plan)

A student can save a key for **any OpenAI-compatible API**: an address (base URL), a model name and the key. `account` checks it before saving (the address must be public https, the key must work, the model must exist, and one tiny test answer must succeed), then stores the key in Vault with the address and model (`store_byok`, `read_byok`). All their tutor answers and study sets then go to that provider. `_lib/llm.ts` sends simpler requests to providers that reject optional settings (strict JSON schema, `max_completion_tokens`, `reasoning_effort` and so on). Answer quality depends on the model the student picks.

### Scans and photos of notes

PDF pages with no text (scans) and photos (JPG, PNG, WebP, HEIC) are rendered to JPEG on the device and read one page at a time by `read-page`, which sends the image to the platform model (`OCR_MODEL`, default the main model) and returns the transcription. It costs about $0.0002 a page with GPT-6 Luna. Each student can read `OCR_PAGES_PER_DAY` pages a day (default 150), and one upload can hold up to 60 scanned pages. Photos are stored as the shrunk JPEG.

### Releases and What's new

`public/changelog.json` is the single list of releases (newest first, plain words for students). After an update, each student sees the full-screen What's new once (`profiles.last_seen_version`; brand-new students are marked up to date). `/changelog` lists every release, linked from Settings.

The breakdown email for a release is built from the same file by the `release-email` function and sent through Resend. It is only sent when you press "Send to everyone" in the local admin dashboard (Updates tab); "Send preview" emails just you first. Students who already got a release are skipped, and every email has a one-tap unsubscribe (`profiles.email_updates`). Secrets: `RESEND_API_KEY`, `ADMIN_TOKEN` (also in the admin dashboard's `.env`), `UNSUBSCRIBE_SECRET`, optional `RELEASE_EMAIL_FROM`.

Shipping a release: add its entry to `public/changelog.json`, push, tag it (`git tag v1.1.0 && git push --tags`), then send the email from the dashboard.

### Switching models

Every AI call goes through `supabase/functions/_lib/llm.ts`, which works with any OpenAI-compatible provider. Change three optional secrets, then redeploy the functions:

| Secret | Default | Example |
| --- | --- | --- |
| `LLM_MODEL` | `gpt-6-luna` | `gpt-5.6-luna`, `openai/gpt-oss-120b`, `Qwen/Qwen3-32B` |
| `LLM_FAST_MODEL` (routing, titles) | same as `LLM_MODEL` | |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | `https://api.deepinfra.com/v1/openai` |
| `LLM_API_KEY` | falls back to `OPENAI_API_KEY` | the other provider's key |

`profile()` in `llm.ts` translates "light / normal / deep" thinking into each model family's settings. Before switching models for students, run the tutor tests below on the new model and compare the reports. Only switch if it passes at least as many checks.

## Backend functions

`supabase/functions/` holds the Edge Functions:

- `generate` builds study sets as a chain of small background jobs.
- `title-source` names uploads.
- `tutor` streams hint-first answers with page citations.
- `account` saves a student's own key and deletes accounts.

Deploy without Docker:

```bash
npx supabase@2.120.0 db push                                               # migrations
npx supabase@2.120.0 config push                                           # auth settings and email templates
npx supabase@2.120.0 functions deploy generate --use-api --no-verify-jwt   # it checks auth itself
npx supabase@2.120.0 functions deploy title-source --use-api
npx supabase@2.120.0 functions deploy tutor --use-api
npx supabase@2.120.0 functions deploy account --use-api
```

## Tutor quality tests

`scripts/tutor-eval/` plays tricky conversations against the deployed tutor as a throwaway student: greetings, vague messages, concept questions, the hint ladder, checking attempts, multiple choice, questions the notes do not cover, requests for graded work, instructions hidden in notes, and a stressed student. Each answer is checked automatically, and the full transcript is saved for reading.

```bash
SUPABASE_SECRET_KEY=sb_secret_… node scripts/tutor-eval/run.mjs report.md            # all cases
SUPABASE_SECRET_KEY=sb_secret_… node scripts/tutor-eval/run.mjs report.md --only hint # some
```

Run it after every prompt change. Every AI call's token counts are saved in `ai_usage` (prices in `model_prices`, daily totals in the `ai_usage_daily` view), server-only. A full run makes about 20 tutor calls on the platform key (a few cents). The report records the model and the time per answer.

## Design

Tokens and components follow the Stoga.study Brand Guidelines v1.0 and match the landing page (`stoga-study/landing`). Colours live in `src/styles/index.css` as CSS variables, and components never hard-code a hex.

## Classes and the Program of Studies

Core classes come from the Conestoga Program of Studies, one file per school year in `src/data/catalogs/`. The app picks the file for the current school year (July to June). If the new one isn't out yet, it keeps showing last year's.

**Each year:** the **Program of Studies** workflow checks the school site every Monday. When a new PDF appears, it builds the catalog and opens a pull request listing what changed: new courses, dropped courses, and changed levels, codes or grades. Read the list and merge it. Students' grades move up on their own, and in a new school year the app asks each student to update their classes. Last year's classes are archived with their notes and cards.

**When the parser can't read something,** the workflow opens an issue instead, naming the course, page and line. Nothing is published. Fix the parser, or add a reviewed rule with its reason in `scripts/program-of-studies/rules.py`, then run the workflow again (Actions → Program of Studies → Run workflow).

Run it by hand:

```bash
pip install pymupdf==1.28.2
python3 scripts/program-of-studies/update_catalog.py --pdf POS.pdf --source <pdf url>
```

## App Store showcase

`marketing/app-store/` has five 1290 × 2796 images built from real app screens, using a throwaway demo student. To regenerate them after new features land, edit the slides in `scripts/showcase/compose.mjs`, then run:

```bash
npm run build && npx vite preview --port 4173 &
python3 scripts/showcase/make_demo_pdfs.py /tmp/showcase
SUPABASE_SECRET_KEY=... node scripts/showcase/capture.mjs /tmp/showcase
node scripts/showcase/compose.mjs /tmp/showcase
```

### Promo video

`marketing/video/stoga-promo.mp4` is a 30 s, 720 × 1560 loop (under 1 MB, no audio). The scenes live in `scripts/showcase/video/promo.html` and use the app's own compiled CSS. They're rendered frame by frame:

```bash
npm run build
node scripts/showcase/video/render.mjs        # needs ffmpeg and Chrome
```
