# Developer content workflow

The installed app has no bank-editing or importing capability. Runtime operation needs no network or AI API. The read-only collection lives in the application's resources directory; the learner database is stored separately in Electron's per-user application-data directory.

## Build and audit

From the repository root, run:

```powershell
npm ci
npm run content:build
npm run content:refresh
npm run content:build
npm run content:validate
```

The importer uses the original workbook and companion snapshot under `data/workbook/`, plus the existing SLB and energy CSVs. Keep these sources available when rebuilding. It imports all 1,552 workbook rows and preserves the snapshot question IDs. Review `content/import-report.json` for reconciliation and note resolutions.

`content:refresh` is a resumable URL/title/description audit, not a complete glossary refresh or proof of factual correctness. Cached results live under `content/source-audit`. Use `--force` after `--` to recheck cached pages. Review new/changed/retired source entries and update the source CSVs or editorial overrides deliberately. `source-refresh.json` must not be marked complete until this reconciliation is done.

## Authoring and stable identifiers

- Existing snapshot IDs identify facts independently of wording. A shared fact can have several topic tags and accepted answer aliases.
- `editorial-overrides.json` supplies explicit corrections to wording, answers, explanations, and review notes. Resolve original editorial notes without losing their rationale.
- The three `*-facts.ts` files contain 200 original expansion facts each. Each record stores answer, learning prompt, quiz prompt, and explanation. Each group declares its source and a concept-specific diagram. Source support, independent wording review, and duplicate/sense reconciliation against the base bank continue in later updates.
- Expansion row positions are permanent IDs. Edit rows in place; never insert, reorder, or renumber published rows. For future additions, move to an explicit-ID collection before adding beyond the initial 200-per-area release requirement.
- Distinct meanings must stay separate even if their answer labels match. Equivalent facts across topics must share one ID. Record merges explicitly so existing histories can be migrated; do not silently regenerate IDs.
- SVGs are original application diagrams. No third-party figure rights have been presumed. Add sourced assets only with documented reuse terms and attribution. Generated filenames include a content hash. Retain old referenced assets so historical quiz snapshots keep working after updates.

## Release gate

```powershell
npm run content:release
npm test
npm run installer
```

The release gate requires structural validity and exactly 200 facts in each expansion collection (`history`, `defining`, `energy`). Editorial review, images, and the source refresh are tracked per fact and grow across updates; they do not block a release. Structural validation alone does not establish technical correctness.

For local development only:

```powershell
npm run installer:preview
```

A preview build skips the release gate. If the gate would fail, the app labels itself as a content preview in onboarding, the footer, and Settings; do not distribute such a build.

The app and content share one version: bump `version` in `package.json` before building a release; `content:build` copies it into `manifest.json`.

## Data and updates

The local SQLite database retains progress for IDs temporarily absent from a bank. Such facts stop appearing in active study; reinstalling a bank containing the same IDs recovers their histories. Quizzes snapshot questions, answers, tags, and participant names at creation. Bank updates never rewrite those snapshots.

Use Settings to export/restore JSON backups. Restore validates the file before changing current tables and saves an automatic pre-restore backup. Database migrations make a pre-migration SQLite backup. Keep the application ID stable between installers; changing it can redirect Electron's data directory.

Native SQLite is built for Electron's ABI during installation. `npm test` runs tests under Electron's Node runtime so tests and the packaged app use the same native binding.
