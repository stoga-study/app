# Stoga.study app

The Stoga.study progressive web app: free, calm study help from your own notes.

**Stack:** Vite + React + TypeScript, Tailwind CSS, shadcn-style components, vite-plugin-pwa, Supabase (Auth, Postgres, Storage, Edge Functions), OpenAI (`gpt-5-nano`, swappable for any OpenAI-compatible model), hosted on Cloudflare Pages.

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

## Deploy (Cloudflare Pages)

1. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and pick `stoga-study/app`.
2. Name the project **`stoga-study-app`**. The Edge Function CORS list (`supabase/functions/_lib/cors.ts`) and the Supabase auth redirect URLs (`supabase/config.toml`) allow `*.stoga-study-app.pages.dev`. If you choose another name, update both.
3. Use framework preset **None**, build command `npm run build` and output directory `dist`. `.node-version` pins Node 22.
4. Add the environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Production and Preview, then deploy.
5. Under **Custom domains**, add `app.stoga.study`. Cloudflare creates the CNAME if the domain's DNS is on Cloudflare. Otherwise, add `CNAME app → stoga-study-app.pages.dev` at your DNS provider.

`public/_redirects` handles routing in the single-page app. `public/_headers` sets the Content Security Policy (network calls only to `*.supabase.co`), the other security headers, and caching. Run `npx wrangler@4 pages dev dist --port 8788` after a build to try it exactly as Cloudflare serves it.

The AI key is never shipped to the browser. It is stored as a Supabase Edge Function secret:

```bash
npx supabase@2.120.0 secrets set OPENAI_API_KEY=sk-...
```

### Switching models

Every AI call goes through `supabase/functions/_lib/llm.ts`, which works with any OpenAI-compatible provider. Change three optional secrets, then redeploy the functions:

| Secret | Default | Example |
| --- | --- | --- |
| `LLM_MODEL` | `gpt-5-nano` | `gpt-5.4-nano`, `openai/gpt-oss-120b`, `Qwen/Qwen3-32B` |
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

Run it after every prompt change. A full run makes about 20 tutor calls on the platform key (a few cents). The report records the model and the time per answer.

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
