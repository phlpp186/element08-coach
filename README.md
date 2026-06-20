# ELEMENT | 08 — Coach

A static web app where freediving coaches build a training plan and hand it to
their athletes as a downloadable **`.e08plan`** file. The athlete opens that file
in the ELEMENT | 08 app and it imports as a plan (with the coach credited as
author). **No backend, no accounts, no sign-up** — the file *is* the delivery.

Sibling to `element08-analyzer`: Vite + React + TypeScript + Tailwind, deployed to
GitHub Pages at **coach.element08.io**.

## How the handoff works

```
Coach (this site)  ──build──▶  plan.e08plan  ──send (WhatsApp/email)──▶  Athlete
                                                                            │
                                          ELEMENT | 08 app ◀──import the file
```

The exported file conforms to the app's `.e08plan` v1 wire format. The contract
lives in the app repo at `Deeptimerapp/src/lib/planSharing/{schema,PlanValidator}.ts`
and is mirrored here in `src/lib/e08plan.ts` — **keep the two in sync** if the app
bumps `PLAN_FILE_VERSION`. The app validates on import (title/author required,
non-empty phases/weeks, each session needs an id, etc.); this site builds files
that satisfy all of those.

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # tsc -b && vite build  → dist/
npm run preview  # serve the production build
```

## Deploy

Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds and
publishes to GitHub Pages. First run auto-enables Pages. Point the
`coach.element08.io` DNS (CNAME) at GitHub Pages; `public/CNAME` is already set.

## Status

Implemented:

- Plan metadata, weeks, sessions assigned to days, `.e08plan` export.
- **Mode #1 — full text**: a plain-text body per session (`sessionNotes`).
- **Mode #2 — structured exercises**: an editable list of exercise rows per session
  (`exercises[]`), plus session `mode` + `sessionType`. Use either or both per session.

- **Mode #3 — drag-and-drop**: a localStorage exercise **library** (the palette) with
  **.csv / .xlsx import** (SheetJS lazy-loaded from a CDN, first column → exercises) and
  CSV export. Drag a chip into a session's exercise list, or click it to add to the open
  session.
- **Day-based plans**: a Weeks/Days structure toggle; day mode is a one-off Day 1..N block
  (each day → its calendar date, "Day N:" baked into the title).
- **Season plans** (`type: season_plan`, `content.kind: 'season'`): a Training/Season toggle.
  Season mode adds a target competition date and reorganises the schedule into collapsible
  **phase** cards (mesocycles, typed Base / Build / Specific / Taper / Peak), each a block of
  weeks that reuses the same week editor. **Auto-build periodization** generates a Base→Peak
  skeleton sized to the season length, which the coach edits. Phases run back-to-back from
  week 1's Monday; the export maps them to `content.phases[]` MesoCycles. Cross-validated
  against the app's real `validatePlanFile` (training + season, zero errors/warnings).

### Athlete management (roster)

A second top-level view (hash-routed: `#/athletes`, `#/athletes/:id`, `#/plan/:id`) for
managing students. **No backend** — the roster lives in localStorage and is backed up via an
**Export / Import** `.e08coach` file (athletes + saved plans). Per athlete: profile + coaching
window, **personal bests** (per app discipline — depth/pool metres, STA time — dated history
with a progress sparkline), **goals**, **competitions** (drives a countdown + seeds a season
plan's comp date), a dated **progress log**, and **attached plans**. Plans are now **persisted**
(survive a refresh) and can be linked to an athlete; **Build a plan for [athlete]** pre-fills the
author + name and, if they have an upcoming competition, starts a season sized to it.

### Roadmap (see app repo `appstore/TODO.md` T53/T54)

- **Per-exercise typed fields** (lung volume / discipline): the app's `PlannedExercise`
  is currently `{ id, description }` only, so structured detail goes in the description
  text. Richer per-exercise fields would need an app-side model change first.
- **Repeating day cycles** (currently a one-off block).
- Note: plan-level **Dry** mode is emitted as `content.mode: 'dry'`; the app's `Plan.mode`
  type is `depth | pool | general`, so a dry plan imports (validator doesn't check it) but
  the app may want a small type update to fully recognise it.
- **Share link / QR** for small plans (deep link into the app) alongside the file.
- Share the exercise catalog (`Deeptimerapp/src/lib/planTemplates`) so structured
  mode never drifts from the app's vocabulary.
- **Goal vs PB visualisation** on the athlete page (current → target gap bars).
