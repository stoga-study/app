# Stoga.study brand, version 2 (October 2026)

Editorial and calm, with a serif voice. It replaces the v1 "tactile" system from the brand guidelines PDF: no tilted tiles, stickers, decorative circles or hard bottom edges. Burgundy stays the only colour, as the school palette requires.

## Colour

Tokens live in `src/styles/index.css`. Never hard-code a hex in a component.

- Neutrals are warm, with a faint burgundy bias: page `--bg`, surfaces `--card` and `--soft`, hairlines `--line` and `--line-strong`.
- Burgundy (`--primary`, `--brand`) is for the main action on a screen, key numbers and state (readiness, the active step). It is not decoration.
- Dark mode has its own values. It is not an inversion: surfaces are near-black, and burgundy lightens for text (`--brand`) and brightens for fills (`--primary`).

## Type

| Role | Face | Use |
| --- | --- | --- |
| Display | Newsreader (serif), 400 and 500 | Page and card titles, greetings, big numbers |
| Body | Geist, 400 to 600 | Everything you read and tap |
| Mono | Geist Mono | Dates, times, small uppercase labels (`.eyebrow`, `.mono`) |

All three are self-hosted with Latin subsets (`@fontsource`, imported in `src/main.tsx`). Weight synthesis is off, so a bold request on the serif uses its real 500 weight.

## Icons

Use icons only where they carry meaning:
- navigation (the tab bar and sidebar);
- icon-only buttons, which always have an `aria-label`;
- right and wrong;
- state.

A button, heading or list row that has words doesn't also get an icon. `index.css` enforces the common cases: icons inside text buttons, headings and pill options are hidden, and the old `.tile` is not shown.

## Surfaces

- `.card` has a 1px hairline and a 16px radius, with no shadow. Use one raised surface per idea; separate rows inside it with hairlines.
- `.btn` is flat, 46px tall (44px for `sm`) with a 12px radius. Primary is burgundy, secondary has a hairline outline, and ghost is text.
- `.ink-panel` (once a dark hero panel) is now a quiet surface like a card, and old white-on-dark content inside it is remapped.

## Motion

- Sheets slide up in 260ms.
- Hover changes colour only.
- Nothing bounces or tilts.
- Reduce motion turns off what's left.

## Layout

- Design phone-first at 390px. Desktop has a 272px sidebar.
- Getting started (welcome, sign-in, onboarding) uses `SetupFrame`: a split screen on desktop, a roomier column on tablets.

## Checking a change

- `E2E_APP=http://localhost:5199 node scripts/e2e/look.mjs <dir> [phone|desktop] [screens]` screenshots real screens with an example student, in light and dark. Run `npx vite --port 5199` first.
- `scripts/e2e/look-setup.mjs` does the same for getting started at phone, tablet and desktop sizes.
- `scripts/e2e/a11y.mjs` must report no serious or critical issues.
