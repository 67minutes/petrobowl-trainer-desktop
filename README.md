# PetroBowl Trainer

An offline Windows app for PetroBowl preparation: spaced-repetition study for individuals and quizmaster-led practice for teams. Everything runs on your computer — no account, no internet connection, and no data leaves the device.

**Version 1.0.0** · 5,609 facts across petroleum engineering, geoscience, industry history, and energy topics.

## Features

- **Study** — a daily queue of due reviews and new facts, scheduled with the FSRS algorithm. Reveal the answer, rate your recall, and the app decides when you see the fact again. Short learning steps bring freshly missed facts back within minutes. Undo is available for the last rating.
- **Question Bank** — search every fact, filter by topic, read explanations and sources, practice extra cards, and suspend facts you don't want to study.
- **Quizzes** — save team rosters, draw balanced question sets, record named attempts and rebounds, then review a session report. Missed questions can be sent straight to practice.
- **Progress** — your recall history, topic coverage, and which reviews to prioritise.
- **Guide** — built-in instructions with a demonstration card that never touches your real history.
- **Settings** — daily new-fact limit, desired retention, and backup export/restore.

## Install

**Requirements:** Windows 10 or 11, 64-bit. About 450 MB of disk space. Administrator rights are not needed.

1. Download `PetroBowl-Trainer-1.0.0-x64-Setup.exe` from the [Releases page](https://github.com/67minutes/petrobowl-trainer-desktop/releases).
2. Double-click the file to start the installer.
3. Windows may show **"Windows protected your PC"** because the installer is not code-signed. Click **More info**, then **Run anyway**.
4. Choose an install folder (the default is fine) and click **Install**.
5. Open **PetroBowl Trainer** from the desktop shortcut or the Start menu.

On first launch a short welcome explains the workspace. After that, the app opens straight to Study.

### Updating

Download the newer installer and run it. It replaces the app in place; your study history, settings, and rosters are kept. Facts that remain in a new version keep their schedules.

### Uninstalling

Use **Settings → Apps → Installed apps → PetroBowl Trainer → Uninstall** in Windows. Your learning history is left in place so a later reinstall picks up where you stopped. To remove it as well, delete the folder `%APPDATA%\PetroBowl Trainer` after uninstalling.

## Using the app

### Daily study

1. Open **Study** and press **Start studying**.
2. Read the prompt and recall the answer, then press **Space** (or click **Show answer**).
3. Rate how it went:

   | Key | Rating | Meaning |
   |---|---|---|
   | 1 | Again | You forgot it |
   | 2 | Hard | Correct, but with real difficulty |
   | 3 | Good | Correct with normal effort |
   | 4 | Easy | Instant and certain |

   Each button shows when you will see the fact next.
4. Keep going until the queue is empty. Coming back daily matters more than long sessions.

A new study day begins at **04:00** local time, so late-night sessions count toward the previous day. Use the topic filters beside the card to focus on your assigned areas; the daily new-fact limit applies across all topics.

### Team practice

1. Go to **Quizzes** and create a roster with your team members.
2. Choose topics, the number of questions, and the question pool: **Full packaged bank** or **Studied on this computer**.
3. Run the quiz: for each question, pick the player who buzzed and mark **Correct** or **Wrong**. After a wrong answer another player can rebound on the same question.
4. Click **Finish quiz & view report** to see player results and topic accuracy. **Practice missed questions** sends the misses straight into a study session.

### Settings

- **New facts per day** — how many unseen facts enter your queue daily. Lower it if reviews pile up.
- **Desired retention** — the recall probability the scheduler aims for. Higher means more frequent reviews.

## Your data and backups

Your history is stored only on this computer, in `%APPDATA%\PetroBowl Trainer`. Each Windows user account has its own separate history.

- **Back up:** Settings → **Export learner backup** saves a `.json` file. Keep a copy somewhere safe, or use it to move to a new computer.
- **Restore:** Settings → **Restore a backup** and choose a backup file. The file is validated first, and your current data is saved before it is replaced; if the file isn't a valid backup, nothing changes.

## Troubleshooting

- **Opening the app again does nothing new.** Only one copy runs at a time; launching it again brings the existing window to the front.
- **Windows blocks the installer.** See step 3 of [Install](#install).
- **"This data was created by a newer PetroBowl Trainer."** Your history came from a newer version. Install the latest release.
- **Text or layout looks cramped.** The app is designed for windows of at least 800 × 650 and display scaling up to 150%.

## Roadmap

Future updates will add explanatory diagrams to more facts (617 have one today), continue reviewing question wording and sources, and expand the topic collections.

## Development

Requires Node.js 22 and Windows for packaging.

```powershell
npm ci
npm run dev                 # build and launch the app
npm test                    # unit tests (run under Electron's Node)
npm run typecheck
```

Content lives in `content/` and is generated from the sources in `data/`:

```powershell
npm run content:build       # regenerate content/bank.json and manifest.json
npm run content:validate    # structural checks
npm run installer           # release gate + build + Windows installer in release/
```

`npm run installer:preview` builds an installer without the release gate. See [content updates](docs/CONTENT-UPDATES.md), [QA inventory](docs/QA-INVENTORY.md), and [validation results](docs/VALIDATION.md) for maintainer details.
