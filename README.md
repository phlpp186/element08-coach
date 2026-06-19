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

## Status — Phase 1 (MVP)

Implemented: plan metadata, weeks, **full-text sessions** assigned to days, and
`.e08plan` export. This covers authoring mode **#1 (full text)** from the design.

### Roadmap (see app repo `appstore/TODO.md` T53/T54)

- **Mode #2 — structured editor**: per-exercise rows with discipline / lung volume /
  type, mirroring the app's plan editor. The wire model already supports it
  (`PlannedSession.exercises`, `mode`, `sessionType`).
- **Mode #3 — drag-and-drop** exercises from a palette onto days (`dnd-kit`).
- **Share link / QR** for small plans (deep link into the app) alongside the file.
- **Season plans** (`kind: 'season'`, multiple phases) — currently exports a single
  `training` phase.
- Share the exercise catalog (`Deeptimerapp/src/lib/planTemplates`) so structured
  mode never drifts from the app's vocabulary.
