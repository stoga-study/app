# Stoga.study app

The Stoga.study progressive web app: free, calm study help from your own notes.

**Stack:** Vite + React + TypeScript, Tailwind CSS, shadcn-style components, vite-plugin-pwa, Supabase (Auth, Postgres, Storage, Edge Functions), Groq (`openai/gpt-oss-120b`), hosted on Cloudflare Pages.

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

- Build command `npm run build`, output directory `dist`.
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables.
- `public/_redirects` handles routing in the single-page app. `public/_headers` sets security headers and caching.

The Groq API key is never shipped to the browser. It is stored as a Supabase Edge Function secret.

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
