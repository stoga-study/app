<p align="center">
  <img src="public/icons/seal.png" alt="Stoga.study" width="96" />
</p>

Stoga.study
===========

**Free, calm study help for Conestoga High School, built around your classes, your teachers' tests and your own notes.**

> **Status:** public beta at [beta.stoga.study](https://beta.stoga.study). Sign-up is open to CHS students. Things still change weekly; see [what's new](https://beta.stoga.study/updates) and the [known issues](https://beta.stoga.study/known-issues).

Made by a CHS student, for CHS students. Pick your grade and classes, drop in what you already have (notes, slides, photos of a worksheet) and Stoga.study turns it into something you can actually study from, paced toward your next test.

Features
--------

- **Your classes, not generic ones.** Courses come from the CHS Program of Studies, refreshed every year.
- **Study sets from your own material.** Upload a PDF, DOCX, scan or photo. Scans are read on-device and transcribed page by page, so handwriting and worksheets work too.
- **A tutor that hints first.** It nudges you toward the answer, and cites the page in *your* notes it got it from.
- **Spaced review that follows your test dates.** Flashcards use FSRS scheduling, so you review what you're about to forget, not everything.
- **Quizzes, practice tests and exam prep**, plus a mistakes log that feeds back into review.
- **Calendar.** Tests and due dates in one place, with reminders.
- **Study groups and shared sets**, so a class can share one good set.
- **Installs like an app.** It's a PWA that works on phone, iPad and desktop, and updates itself between sessions, never mid-review.
- **Free.** No ads, no paywall on studying. Students can also bring their own key for any OpenAI-compatible model.

Principles
----------

- **Study, don't shortcut.** Hints before answers, citations before claims.
- **Honest about what's built.** Features that aren't ready say so. Known bugs are public.
- **Private by default.** Notes are stored in private buckets, feedback is anonymous unless you say otherwise, and the AI key never reaches the browser.
- **Calm.** One colour, a serif voice, nothing that bounces. See [BRAND.md](BRAND.md).

Roadmap
-------

- [x] v1.x: notes to study sets, tutor, review, quizzes, practice tests, groups
- [x] v1.9: in-app feedback, ideas board, tour, surveys, public updates and known issues
- [ ] v2.0: calendar subscribe link, OneDrive / OneNote import, two-way calendar sync
- [ ] Schoology and PowerSchool, only after district approval
- [ ] School-wide launch

Repository layout
-----------------

| Path | What's in it |
| --- | --- |
| `src/routes/` | One file per screen (Home, Review, Tutor, Calendar, ...) |
| `src/components/`, `src/lib/` | Shared UI and app logic |
| `src/data/catalogs/` | Per-year CHS course catalogs, built from the Program of Studies |
| `src/styles/` | Design tokens (`index.css`) |
| `supabase/functions/` | Edge Functions: `generate`, `tutor`, `coach`, `read-page`, `grade-answer`, ... |
| `supabase/migrations/` | Postgres schema and row-level security |
| `public/changelog.json` | The single list of releases, in plain words |
| `scripts/e2e/` | Live Playwright tests, screenshots and accessibility checks |
| `scripts/tutor-eval/` | Checks to run before switching the tutor's model |

Stack
-----

Vite, React 19, TypeScript, Tailwind, Supabase (Auth, Postgres, Storage, Edge Functions), `ts-fsrs`, `pdfjs-dist`, vite-plugin-pwa, hosted on Cloudflare Workers.

Getting started
---------------

```bash
npm install
cp .env.example .env.local   # add your Supabase URL and publishable key
npm run dev                  # http://localhost:5173
```

Deploying, switching models, backend functions and tests are in [DEVELOPMENT.md](DEVELOPMENT.md).

Contributing
------------

Found a bug or have an idea? Use **Feedback** inside the app, or post on the [ideas board](https://beta.stoga.study/requests). Both reach the developer directly.

Not affiliated with the school or district. The CHS seal is used with permission being arranged by the developer.

License
-------

The code is [MIT](LICENSE) licensed. The name "Stoga.study", the logo and the Conestoga High School seal are not covered by that license and may not be used to imply the school or this project endorses your work.
