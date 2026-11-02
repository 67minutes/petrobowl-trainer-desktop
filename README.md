# PetroBowl Trainer — local desktop edition

An offline Windows study and team-practice application. One Windows user profile has one private learner history; saved rosters are used for quiz sessions.

## Current status

The desktop workflows are implemented. The packaged collection is a **development preview**, with outstanding question wording, source reconciliation, and explanatory-image work. The full-release installer command is gated until those requirements are complete. See `content/manifest.json` and the validation report under `docs/`.

## Use the app

Install the Windows x64 setup file from `release/`, then open **PetroBowl Trainer** from its shortcut. No Node.js, terminal, account, or internet connection is required for installed use.

- **Study:** due reviews, persistent FSRS learning steps, answer explanations and available images, four ratings, keyboard controls, and undo.
- **Question Bank:** local search, topic filters, explanations, extra practice, and suspend/resume.
- **Quizzes:** saved team rosters, balanced question selection, manual named attempts, rebounds, reports, and missed-question practice.
- **Progress:** private recall history, coverage, and due-review priorities.
- **Guide:** offline practical instructions and a demonstration card that does not alter history.
- **Settings:** daily new-fact limit, desired retention, backup export, and validated restore.

Use Space to reveal an answer and 1–4 for Again/Hard/Good/Easy. Again means forgotten; Hard means correct with difficulty. New study days begin at 04:00 in the device's local timezone.

## Develop

```powershell
npm ci
npm run dev
```

The original workbook and snapshot are under `data/workbook/`. Glossary CSV sources are under `data/slb_glossary/` and `data/energy_glossaries/`. Runtime content is packaged separately from writable learner SQLite data.

```powershell
npm run content:build
npm run content:validate
npm test
npm run build
npm run installer:preview
```

For a complete reviewed release, use `npm run installer`; it first runs the stricter content-release gate. Preview builds are explicitly incomplete content builds.

See [developer content updates](docs/CONTENT-UPDATES.md), [QA inventory](docs/QA-INVENTORY.md), and [validation results](docs/VALIDATION.md).

## Relationship to the online edition

This app was split out of the [web trainer repo](https://github.com/67minutes/petrobowl-trainer) (Next.js + Supabase). The glossary CSVs and `scripts/lib/glossary-csv.ts` were copied from there; if the glossary sources change upstream, copy them across and rerun `npm run content:build`. No hosted database, account, or deployed service is touched by desktop builds.
