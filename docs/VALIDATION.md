# Release validation — 1.0.0

Date: 2026-11-02. Application and content: `1.0.0`.

All application workflows are implemented and tested. Explanatory images and editorial review cover part of the collection and will expand in later updates (see [Content status](#content-status)).

## Delivered application

- Windows x64 NSIS installer: `release/PetroBowl-Trainer-1.0.0-x64-Setup.exe` (124.6 MB).
- Installer SHA-256: `6954D0326C7B4CC70AB79C6123C10B05344BC9EA4D11C3B6865B7FD42A5AC207`.
- Installs per user under `%LOCALAPPDATA%\Programs\PetroBowl Trainer` with a desktop shortcut; no administrator rights required.
- The installed application needs no Node.js installation, account, running terminal, network connection, or API key.
- Question resources are separate from the writable learner SQLite database.

## Software checks

| Check | Result | Evidence |
|---|---|---|
| TypeScript and production renderer/main builds | PASS | `npm run build`; final `npm run typecheck` |
| Storage and scheduler tests | PASS | 19 tests under Electron's Node runtime, using the packaged SQLite ABI |
| Structural bank validation | PASS | 5,609 records with unique IDs and valid required fields; existing image paths checked |
| Release gate | PASS | `npm run content:release` |
| Installed-file integrity | PASS | 625 checks: compiled files, bank/manifest, and all 617 referenced image files; zero mismatches |
| Packaged offline UI workflows | PASS | `scripts/smoke.cjs` against `release/win-unpacked`, driven through normal mouse/keyboard controls with the application context offline; zero renderer errors |

The service tests cover all four ratings against their previews; learning graduation; a ten-minute relearning lapse across restart; global daily new-card limits; local 04:00 boundaries; suspension; idempotent submissions; stale/expired review rejection; undo; shared-topic counting; first-review-per-fact/day analytics; quiz rebounds and correction; roster and question snapshots; restart recovery; invalid backups; backup round-trips including quiz correction history; and temporarily unavailable bank IDs.

## Packaged UI checks

The packaged executable was tested, rather than relying only on a development server.

- First launch, onboarding, and saved onboarding state.
- Scheduled answer reveal, ratings, interval labels, undo, Space/number-key controls, compact study layout, and restart persistence.
- Team-roster saving, unsaved-roster protection, wrong attempts, a rebound correct answer, unanswered questions, a 50% report, and reopened history.
- Missed-question practice and guide demonstrations leave scheduled study history unchanged.
- Bank search, topic filtering, empty results, pagination, answer explanations, local image loading, enlargement, Escape dismissal, and suspension/resumption.
- Source-link action exercised with a simulated browser-open handler, without opening the user's browser during testing.
- Guide search and demonstration reveal/rating/reset.
- Settings, backup export, validated restore, and saved state after relaunch. Native file-dialog selections were simulated; their underlying export/restore handlers and actual filesystem writes were exercised.
- Empty recall state and a populated rolling chart. The populated chart used explicitly synthetic history through a temporary backup fixture; the original test backup was restored afterward. These are not real study-performance results.
- 100%, 125%, and 150% application zoom, plus the 800×650 minimum window. No horizontal page overflow was found.

Visual inspection covered onboarding, default study, revealed study with a diagram and rating controls, quiz setup/runner/report, bank answer and enlarged image, guide, settings, empty/populated progress, zoomed layouts, and the minimum window. No clipping, broken layering, or missing controls was found in the inspected final states; normal vertical scrolling remains available for long content.

Generated evidence is in `output/playwright/`, including `packaged-smoke-report.json` and `packaged-*.png`. Tests used isolated QA learner directories.

**Not run:** manual operation of native file-picker dialogs; separate Windows machines configured with different system DPI settings; an actual two-version installer upgrade; running the 1.0.0 NSIS installer itself (an earlier installer built from the same configuration installed cleanly with exit code 0).

## Content status

| Content item | Current evidence |
|---|---|
| Source snapshot | 5,233 records reconciled into 4,657 snapshot groups |
| Preferred workbook | All 1,552 rows matched to saved original IDs; accepted answers, categories, source URLs, and review notes imported |
| CSV supplements | 352 candidate records preserved, including differing source definitions; a tracked registry maintains their source-based IDs |
| Authored expansion | 600 records: 200 history, 200 Defining Series, 200 EIA/DOE fundamentals |
| Total facts | 5,609; structural ID uniqueness does not certify semantic uniqueness |
| Workbook editorial notes | Correction records written for all 18, with original notes retained in the import report |
| Curated records | 22 have explicit editorial overrides, including four introductory foundation questions |
| Local visuals | 617 records reference bundled original diagrams; related questions may share a diagram |
| Visuals planned | 4,992 records will gain explanatory visuals in later updates |
| Editorial review in progress | 5,587 records, including the 600 expansion facts |
| Link audit | 4,641 of 4,646 URLs returned an identifiable page or PDF; five were blocked, timed out, or unparsed |

Ongoing content work for future updates: independent prompt wording for imported definitions, meaning/synonym reconciliation, fact-by-fact source support and overlap checks for the expansion facts, and technical signoff for visuals. No generic icon is used as a substitute for a missing explanatory figure.

Two stale SLB links were corrected to live canonical URLs: `zero_phase` to `zero-phase`, and `neural_networks` to `neural_network`. The source audit records access dates and response evidence.

Developer instructions are in `CONTENT-UPDATES.md`; the complete QA inventory is in `QA-INVENTORY.md`.
