# Natively

Natively is an Electron desktop overlay for meetings, interviews, and live problem-solving. It captures live audio, transcribes it with a selectable STT provider, routes prompts to a selectable LLM provider, and now persists each overlay run as a reviewable session with transcript history and a post-session summary.

## Current Product Flow

1. On launch, Natively opens the setup window.
2. The user chooses:
   - LLM: `Ollama` or `Gemini`
   - STT: `faster-whisper` or `Deepgram`
3. The overlay opens and starts a new persisted session.
4. Final transcript chunks are stored in SQLite during the session.
5. Clicking `End + review` ends the session, generates a structured summary in the background, and opens the Dashboard.
6. The Dashboard shows past sessions, transcript history, summary data, and an embedded `Helper Settings` view in the sidebar.

## Features

- always-on-top overlay for live assistance
- provider setup window on launch
- browser-based audio capture with microphone and optional BlackHole system audio on macOS
- selectable STT:
  - local `faster-whisper`
  - cloud `Deepgram`
- selectable LLM:
  - local `Ollama`
  - cloud `Gemini`
- screenshot-assisted prompting
- per-session persistence in SQLite
- utterance-level transcript storage
- automatic post-session structured summaries
- Dashboard window for reviewing previous sessions
- embedded `Helper Settings` panel inside the Dashboard

## Runtime Architecture

### Windows

- `Setup window`
  - Electron `BrowserWindow`
  - React UI in `renderer/SetupApp.tsx`
  - used to choose providers and save settings

- `Overlay window`
  - Electron `BrowserWindow`
  - React UI in `renderer/App.tsx`
  - live transcript, AI interaction, screenshot actions, and session controls

- `Dashboard window`
  - Electron `BrowserWindow`
  - React web UI in `renderer/DashboardApp.tsx`
  - talks to a local dashboard HTTP/SSE API instead of Electron preload IPC
  - session history, summaries, transcript review, and Helper Settings

### Audio and Transcript Path

- Renderer captures audio with `getUserMedia`
- optional BlackHole input is used for system audio capture on macOS
- PCM is sent to the main process over IPC
- STT provider is selected through `electron/services/providerRegistry.ts`
- final transcript chunks are:
  - emitted to the overlay UI
  - appended to `utterances` in SQLite
- when the session ends, `SessionService` assembles the full transcript and marks the session complete

### Session and Summary Path

- each overlay launch starts a new session in SQLite
- session metadata includes:
  - start time
  - end time
  - duration
  - active LLM provider
  - active STT provider
- every final transcript chunk is stored as an utterance
- on session end:
  - transcript is finalized
  - summarization runs in the background using the active LLM provider
  - `summary_json` is written back to SQLite
  - the Dashboard updates reactively when the summary arrives

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- SQLite via `better-sqlite3`
- Python sidecar for `faster-whisper`

## Run Locally

```bash
npm install
npm start
```

Useful commands:

```bash
npm run build
npm run dist:mac
npm run dist:win
```

If native Electron modules drift after packaging or rebuilds:

```bash
npx electron-builder install-app-deps
```

## Requirements

### LLM options

- `Ollama`
  - local Ollama server running
  - selected model already pulled

- `Gemini`
  - internet access
  - valid Gemini API key

### STT options

- `faster-whisper`
  - Python 3.8+
  - `pip install faster-whisper`

- `Deepgram`
  - internet access
  - valid Deepgram API key

### Optional system audio transcription

- `BlackHole 2ch` on macOS

### Permissions

- microphone access
- screen capture / screen recording permission

## Project Structure

```text
electron/
  ipc/                         Main-process IPC handlers
  providers/                   LLM and STT provider implementations
  services/                    Persistence, orchestration, session logic
    db/migrations/             SQLite migrations
    SessionService.ts          Session and utterance persistence
    SummarizationService.ts    Post-session summary generation
    providerRegistry.ts        Active provider selection
  dashboardWindow.ts           Dashboard BrowserWindow lifecycle
  main.ts                      Electron bootstrap and window lifecycle
  preload.ts                   Overlay/setup preload bridge
  setupWindow.ts               Setup BrowserWindow lifecycle
  services/dashboardWebServer.ts Local HTTP + SSE API for the dashboard

renderer/
  components/                  Overlay UI components
  components/dashboard/        Dashboard UI components
  hooks/                       Overlay-side state and IPC hooks
  App.tsx                      Overlay root
  SetupApp.tsx                 Setup root
  DashboardApp.tsx             Dashboard root
  dashboard-main.tsx           Dashboard renderer entry

src/
  shared.ts                    IPC channels and shared constants
  config.ts                    Runtime defaults and magic numbers

scripts/
  transcribe_server.py         Python faster-whisper worker

public/
  audioWorklet.js              PCM extraction worklet

native-module/
  Experimental native audio module resources
```

## Data Persistence

SQLite lives at:

```text
~/Library/Application Support/natively/natively.db
```

Key tables:

- `settings`
- `sessions`
- `utterances`
- `usage`
- `schema_migrations`

## Environment Variables

Most runtime settings are persisted through the setup flow, not read from env on every launch.

Optional environment variables still relevant to local development:

- `GEMINI_API_KEY`
- `DEEPGRAM_API_KEY`
- `CODEX_BIN`
- `VITE_DEV_SERVER_URL`

## Packaging

The project is configured for `electron-builder`.

Build targets:

- macOS DMG: `npm run dist:mac`
- Windows installer: `npm run dist:win`

Packaged builds include:

- Electron app bundle
- Dashboard and overlay renderer bundles
- Python transcription script
- native module resources
- macOS entitlements for microphone access

## Current Notes

- setup currently opens on every launch by design
- Dashboard and Helper Settings live in the same web-based Dashboard UI
- transcript export was replaced by the session review flow
- some legacy Codex-related settings/types still exist in the repo, but they are not the active LLM path
