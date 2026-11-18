# Time Tracker

A desktop time tracking app for Windows, built with Electron, React and TypeScript.

Start a timer for what you are working on, group your time by project, and see where your week went.

## Features

- **One-click timer** with a description and optional project. Only one timer runs at a time; starting a new one stops the previous one.
- **Keeps running when the window is closed.** The app lives in the system tray, where you can start, continue or stop a timer. The tray icon turns green while a timer runs.
- **Timers survive restarts.** A running timer is saved immediately and keeps counting even if you quit the app or restart Windows, until you stop it.
- **Time entries** grouped by day with daily totals. Edit, delete, or continue any entry, and add entries manually for time you forgot to track.
- **Projects** with colors. Rename, archive or delete them (deleting a project keeps its time entries).
- **Reports** for today, this week, last week, this month and last month, broken down by project and by day. Entries that cross midnight are split correctly between days.
- **CSV export** that opens cleanly in Excel.
- Light and dark theme that follows your Windows setting.

## Install

Download the installer `Time Tracker-Setup-<version>.exe` from the latest successful [Build workflow run](https://github.com/armendeveloper/time-tracker/actions/workflows/build.yml) (under **Artifacts**) and run it. It installs for the current user only, so no administrator rights are needed.

The installer is not code-signed yet, so Windows SmartScreen will show a warning the first time. Choose **More info**, then **Run anyway**.

### Where your data is stored

Everything is stored locally in a single JSON file:

```
%APPDATA%\Time Tracker\data.json
```

**Settings > Show in folder** opens it. Back up this file to keep your history. If the file is ever unreadable, the app renames it to `data.json.corrupt-<timestamp>` and starts fresh, so nothing is silently overwritten.

## Development

Requirements: [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

While developing, the app stores its data in `%APPDATA%\Time Tracker (Dev)` so it never touches the data of an installed copy.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the app with hot reload |
| `npm run typecheck` | Type-checks the main, preload and renderer code |
| `npm test` | Runs unit tests (Vitest) |
| `npm run build` | Builds the app into `out/` |
| `npm run test:e2e` | Runs end-to-end tests against the built app (Playwright). Run `npm run build` first |
| `npm run dist:win` | Builds the Windows installer into `release/<version>/` |
| `npm run icons` | Regenerates the app and tray icons from `scripts/generate-icons.cjs` |

Building the installer works best on Windows. On Linux or macOS, electron-builder needs [Wine](https://www.winehq.org/) (including 32-bit support) for the NSIS step.

### Continuous integration

`.github/workflows/build.yml` runs on every push and pull request:

1. Type-checks, runs unit tests, builds, and runs end-to-end tests on Linux.
2. Builds the Windows installer on a Windows runner, installs it silently, launches the installed app to make sure it starts, and uploads the installer as an artifact.

### Project structure

```
src/
  main/         Electron main process: window, tray, IPC, data store
  preload/      Exposes a small, typed API to the renderer (window.api)
  renderer/     React user interface
  shared/       Types, time calculations and CSV export used by both sides
tests/          Unit tests
e2e/            End-to-end tests that drive the real app
resources/      Icons loaded at runtime
build/          Icons used by the installer
```

### Security

The renderer runs with `contextIsolation`, `sandbox` and no Node.js integration, and a strict Content Security Policy. It can only reach the main process through the API in `src/preload/index.ts`, and the main process validates every input and ignores calls from any page other than the app's own.

## Roadmap

Ideas for next steps:

- Idle detection (ask what to do with time while you were away)
- Global keyboard shortcut to start and stop the timer
- Option to start with Windows
- Tags and billable rates
- Code signing and automatic updates
