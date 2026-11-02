# Local desktop preview — validation

Date: 2026-10-19. Application: `1.0.0-preview.1`. Content: `2026.10.19.1`.

**The desktop workflow milestone is implemented and tested. The complete reviewed-bank milestone remains incomplete. This is a development preview, not completion of the entire requested plan.**

## Delivered application

- Windows x64 NSIS installer: `release/PetroBowl-Trainer-1.0.0-preview.1-x64-Setup.exe`.
- Installed per user at `C:\Users\mauli\AppData\Local\Programs\PetroBowl Trainer` with a desktop shortcut. Silent installation returned exit code 0.
- Installer SHA-256: `70DD317D58932F7A6E2DB119760A1E8D8DE78F6A19AE834AA27A918D39D9D5AF`.
- The installed application needs no Node.js installation, account, running terminal, Supabase connection, or AI API key.
- Question resources are separate from the writable learner SQLite database. Online data and deployed services were not modified. Existing source workbooks and local CSV edits were retained.

## Software checks

| Check | Result | Evidence |
|---|---|---|
| TypeScript and production renderer/main builds | PASS | `npm run build`; final `npm run typecheck` |
| Storage and scheduler tests | PASS | 19 tests under Electron's Node runtime, using the packaged SQLite ABI |
| ESLint | PASS | Root `npm run lint`, scoped to desktop source and scripts |
| Structural bank validation | PASS | 5,609 records with unique IDs and valid required fields; existing image paths checked |
| Installed-file integrity | PASS | 625 checks: compiled files, bank/manifest, and all 617 referenced image files; zero mismatches |
| Fresh Windows installation | PASS | NSIS exit code 0, installed executable and desktop shortcut present |
| Installed offline UI workflows | PASS | Automated through normal mouse/keyboard controls with the application context offline; zero renderer errors |
| Complete-bank release gate | EXPECTED FAILURE | `npm run content:release` exits 1 while editorial, media, and source work remains |

The service tests cover all four ratings against their previews; learning graduation; a ten-minute relearning lapse across restart; global daily new-card limits; local 04:00 boundaries; suspension; idempotent submissions; stale/expired review rejection; undo; shared-topic counting; first-review-per-fact/day analytics; quiz rebounds and correction; roster and question snapshots; restart recovery; invalid backups; backup round-trips including quiz correction history; and temporarily unavailable bank IDs.

## Installed UI checks

The final installer was installed and the resulting executable was tested, rather than relying only on a development server.

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

Visual inspection covered onboarding, default study, revealed study with a diagram and rating controls, quiz setup/runner/report, bank answer and enlarged image, guide, settings, empty/populated progress, zoomed layouts, and the minimum window. Contrast was strengthened and active study was compacted after inspection. No clipping, broken layering, or missing controls was found in the inspected final states; normal vertical scrolling remains available for long content.

Generated evidence is in `output/playwright/`, including `packaged-smoke-report.json` and `packaged-*.png`. Tests used isolated QA learner directories. The final installed application was closed after testing.

**Not run:** manual operation of native file-picker dialogs; separate Windows machines configured with different system DPI settings; an actual two-version installer upgrade. Application zoom was tested, and bank-ID update behavior was tested with storage fixtures, but those are distinct from those unrun checks.

## Content status: incomplete

| Content item | Current evidence |
|---|---|
| Source snapshot | 5,233 records reconciled into 4,657 snapshot groups |
| Preferred workbook | All 1,552 rows matched to saved original IDs; accepted answers, categories, source URLs, and review notes imported |
| CSV supplements | 352 candidate records preserved, including differing source definitions; a tracked registry maintains their source-based IDs |
| New authored drafts | 600 records: 200 history, 200 Defining Series, 200 EIA/DOE fundamentals |
| Total packaged candidates | 5,609; structural ID uniqueness does not certify semantic uniqueness |
| Workbook editorial notes | Correction records written for all 18, with original notes retained in the import report |
| Curated records | 22 have explicit editorial overrides, including four introductory foundation questions |
| Local visuals | 617 records reference bundled original diagrams; related questions may share a diagram |
| Missing visuals | 4,992 records still need an explanatory visual |
| Pending editorial verification | 5,587 records, including the 600 expansion drafts |
| Link audit | 4,641 of 4,646 URLs returned an identifiable page or PDF; five were blocked, timed out, or unparsed |
| Full collection refresh | INCOMPLETE: URL availability is not a complete official-source crawl or definition reconciliation |

The imported, unreviewed portion still includes legacy definitions and mechanically prefixed quiz variants. Both independent prompt authoring and meaning/synonym reconciliation remain necessary. The expansion drafts need fact-by-fact source support and overlap checks against the base bank. The entire media collection has not received technical visual signoff. No generic icon has been counted as a substitute for a missing explanatory figure.

Two stale SLB links were corrected to live canonical URLs: `zero_phase` to `zero-phase`, and `neural_networks` to `neural_network`. The source audit records access dates and response evidence, and remains explicitly incomplete.

The full installer command is deliberately blocked until these content requirements are finished. The preview is labeled in onboarding, the footer, and Settings. Developer instructions are in `CONTENT-UPDATES.md`; the complete QA inventory is in `QA-INVENTORY.md`.
