# Desktop QA inventory

Each item requires functional and visual verification before release.

| Workflow | Required interactions and states | Evidence |
|---|---|---|
| First launch | Onboarding, dismiss, private default settings | First-launch screenshot; restart persistence |
| Study | Start, reveal, four ratings, interval preview, keyboard, undo, finish | Hidden/revealed screenshots; persisted SQLite tests |
| Learning | Future minute steps do not appear early; restart, due return | Clock-controlled service tests |
| Topics | Filter, clear selection, global daily new cap, shared facts | Filtered UI; service tests |
| Bank | Search, topic filter, pagination, details, suspend/resume, image enlargement, sources | Bank and expanded-image screenshots |
| Quizzes | Save/edit roster, full/studied pools, unavailable count, wrong/rebound/correct, unanswered, undo, restart | Setup, runner, report; service tests |
| Progress | Empty and populated charts, rolling first scheduled recall, coverage, priorities | Chart screenshots; aggregation tests |
| Guide | Search, demo reveal/rating/reset; no writes to real schedule | Guide screenshot; history unchanged |
| Settings | Limits, retention, invalid values, backup export/restore/cancel | Settings; backup round-trip and invalid-file tests |
| Updates | Same IDs retain study, retired IDs preserved, quiz snapshots unchanged | Upgrade fixture tests |
| Offline installer | All above with network blocked; installer launch, persistence after relaunch | Packaged-app smoke report |
| Display | Native launch; 100%, 125%, 150% scaling; minimum 800×650; keyboard focus | Screenshots and overflow checks |
| Content | 1,552 workbook rows; all 18 notes; 200 each expansion; two independent prompts; every image meaningful | Import/editorial/media review reports |

Exploratory scenarios: repeated clicks/stale submissions; empty topic/pool results; unfinished sessions and future learning; invalid backup leaves data intact.

The content release gate must remain closed while source, prompt, expansion, or visual review is incomplete.
