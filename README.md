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
