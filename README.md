# Natively

Natively is an Electron desktop overlay for real-time meeting/interview assistance. It is designed to float above other apps, stay hidden from screen sharing software, maintain local context from the screen and live audio, and route AI responses through the local `codex` CLI instead of hosted model APIs.

This README is a full handoff document for another coding model or engineer. It describes:

- what the project currently does
- how the UI currently looks and behaves
- which modules, functions, and packages are in use
- how audio capture works
- how screen capture works
- what is currently working
- what is still broken or partial

The visual reference target remains:

- `https://github.com/evinjohnn/natively-cluely-ai-assistant`

## Current State

What is working now:

- Electron overlay boots and renders
- frameless transparent always-on-top window works
- content protection is enabled
- SQLite-backed settings, history, and usage persistence work
- Codex CLI is the active AI backend
- AI responses stream into the renderer
- full screenshot and selective screenshot capture work
- continuous screen preview capture is wired
- microphone transcription now works through a local Python `faster-whisper` server
- renderer diagnostics now log audio/transcript state into the terminal

What is only partial or still broken:

- system/output audio transcription depends on macOS routing audio into BlackHole, and current logs show BlackHole opens but is silent
- transcript service starts/stops twice on dev startup before settling, likely due renderer lifecycle/dev reload behavior
- UI is closer to the reference repo but is still not a literal pixel-perfect match
- some settings UI still carries names from earlier transcript backends even though runtime now uses `faster-whisper turbo`

## Product Behavior

Intended behavior:

- translucent floating overlay in the top-right area of the screen
- invisible to screen-share software via content protection
- continuously aware of current screen
- continuously aware of mic input
- continuously aware of system/output audio when routed through BlackHole
- local-first persistence
- Codex-backed answering and quick actions

Current actual behavior:

- screen preview is continuously refreshed in renderer
- every AI request also captures a fresh screenshot in the main process before calling Codex
- mic input is captured, downmixed, forwarded to the main process, chunked into WAVs, and transcribed through a persistent Python `faster-whisper` server
- BlackHole is enumerated and opened successfully on this machine, but current RMS logs show it is silent, so output audio is not yet contributing transcript text

## UI Summary

Current UI composition:

- top pill title bar
- main glass body
- transcript strip at the top of the body
- chat / response area
- quick action row
- composer / input bar
- diagnostics strip below the main body
- settings modal overlay

Current visual language:

- dark glass overlay
- translucent top pill with controls
- glassy body panel with rounded corners
- markdown-rendered assistant responses
- selectable assistant text with copy affordance
- quick action pills
- inline screenshot attachment in composer
- diagnostics strip showing mic, BlackHole, PCM throughput, and whisper status

Main renderer files controlling appearance:

- [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)
- [renderer/index.css](/Users/sumedh/cluely-natively/renderer/index.css)
- [renderer/components/TitleBar.tsx](/Users/sumedh/cluely-natively/renderer/components/TitleBar.tsx)
- [renderer/components/TranscriptPanel.tsx](/Users/sumedh/cluely-natively/renderer/components/TranscriptPanel.tsx)
- [renderer/components/ChatPanel.tsx](/Users/sumedh/cluely-natively/renderer/components/ChatPanel.tsx)
- [renderer/components/QuickActions.tsx](/Users/sumedh/cluely-natively/renderer/components/QuickActions.tsx)
- [renderer/components/InputBar.tsx](/Users/sumedh/cluely-natively/renderer/components/InputBar.tsx)
- [renderer/components/SettingsModal.tsx](/Users/sumedh/cluely-natively/renderer/components/SettingsModal.tsx)

## Core Packages

Top-level app packages from [package.json](/Users/sumedh/cluely-natively/package.json):

Runtime packages:

- `react`
- `react-dom`
- `react-markdown`
- `@tanstack/react-query`
- `better-sqlite3`
- `electron-is-dev`
- `@google-cloud/speech`
- `@google/generative-ai`
- `groq-sdk`
- `lucide-react`

Important note:

- `@google-cloud/speech`, `@google/generative-ai`, `groq-sdk`, and the provider adapters still exist in the codebase, but the active AI path is Codex CLI and the active transcript path is local `faster-whisper`.

Build/dev packages:

- `electron`
- `electron-builder`
- `vite`
- `vite-plugin-electron`
- `typescript`
- `tailwindcss`
- `postcss`
- `autoprefixer`
- `@vitejs/plugin-react`
- `@napi-rs/cli`

Python runtime used outside `package.json`:

- `faster-whisper`
- its dependencies, including `ctranslate2`, `onnxruntime`, `tokenizers`, `huggingface-hub`, `av`

## Local Tools and Binaries

Current local tools involved in the project:

- `codex`
- `python3`
- `pip3`
- `faster-whisper` Python package
- `whisper-cli` still installed on the machine but no longer used by the active transcript backend
- `whisper-stream` still installed on the machine but no longer used by the active transcript backend
- `SwitchAudioSource`
- `BlackHole 2ch`

Known installed paths and state:

- Python: `/Library/Frameworks/Python.framework/Versions/3.11/bin/python3`
- `faster-whisper` import check passes
- `BlackHole 2ch` appears in Chromium device enumeration and opens successfully
- current logs show `blackhole rms=0.00000 active=false`, meaning the device is open but macOS is not feeding output audio into it

## How the App Runs

Development:

```bash
npm install
npm start
```

Build:

```bash
npm run build
```

Package:

```bash
npm run dist
```

Native rebuild:

```bash
npm run build:native
```

## Current Build Status

At the time of this handoff:

- `npm run build` passes
- `npm start` launches
- Python `faster-whisper` server script exists and compiles
- the app logs transcript backend startup in the terminal

## File Structure

```text
.
├── README.md
├── index.html
├── package.json
├── package-lock.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.mts
├── scripts/
│   ├── dev.mjs
│   └── transcribe_server.py
├── src/
│   └── shared.ts
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   ├── ipc/
│   │   ├── aiHandlers.ts
│   │   ├── audioHandlers.ts
│   │   ├── screenshotHandlers.ts
│   │   └── windowHandlers.ts
│   └── services/
│       ├── aiRouter.ts
│       ├── codex.ts
│       ├── database.ts
│       ├── gemini.ts
│       ├── googleSTT.ts
│       ├── groq.ts
│       └── ollama.ts
├── native-module/
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── build.rs
│   ├── index.js
│   ├── index.d.ts
│   ├── package.json
│   ├── index.darwin-arm64.node
│   └── src/
│       └── lib.rs
├── renderer/
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   ├── assets/
│   │   └── icon.png
│   ├── fonts/
│   │   ├── celeb-light.otf
│   │   └── celeb-medium.otf
│   ├── components/
│   │   ├── ChatPanel.tsx
│   │   ├── InputBar.tsx
│   │   ├── QuickActions.tsx
│   │   ├── ScreenshotPreview.tsx
│   │   ├── SettingsModal.tsx
│   │   ├── TitleBar.tsx
│   │   ├── TranscriptPanel.tsx
│   │   └── UsageStats.tsx
│   ├── hooks/
│   │   ├── useAI.ts
│   │   ├── useAudio.ts
│   │   ├── useScreenshot.ts
│   │   └── useSettings.ts
│   └── types/
│       └── index.ts
└── public/
    └── audioWorklet.js
```

## Module and Function Overview

### Electron Main Process

[electron/main.ts](/Users/sumedh/cluely-natively/electron/main.ts)

Responsibilities:

- create the frameless transparent BrowserWindow
- enable `setContentProtection(true)`
- on Windows, set display affinity when available
- register permission handlers
- register `setDisplayMediaRequestHandler`
- initialize IPC handlers
- register global shortcuts
- forward renderer debug logs into the terminal

Important functions:

- `createMainWindow()`
- `positionWindow()`
- `bootstrap()`

### Preload Bridge

[electron/preload.ts](/Users/sumedh/cluely-natively/electron/preload.ts)

Responsibilities:

- expose `window.electronAPI`
- bridge window controls
- bridge screenshot actions
- bridge audio start/stop and PCM push
- bridge transcript, AI, and settings events
- bridge renderer debug logging to main

Important exposed methods:

- `hideWindow()`
- `showWindow()`
- `moveWindow()`
- `updateContentDimensions()`
- `setWindowOpacity()`
- `captureFullScreen()`
- `captureSelectiveScreen()`
- `startAudioCapture()`
- `stopAudioCapture()`
- `pushAudioChunk()`
- `logDebug()`
- `onTranscriptUpdate()`
- `onTranscriptStatus()`
- `onTranscriptError()`
- `sendMessage()`
- `getSettings()`
- `saveSettings()`

### AI Routing

[electron/services/codex.ts](/Users/sumedh/cluely-natively/electron/services/codex.ts)

Responsibilities:

- invoke local `codex` CLI
- append configured Codex flags from settings
- pseudo-stream result into the renderer

Important behavior:

- screenshot path is passed into Codex requests
- streaming is simulated in small chunks for a live-response feel

[electron/services/aiRouter.ts](/Users/sumedh/cluely-natively/electron/services/aiRouter.ts)

Responsibilities:

- build prompts for:
  - answer
  - shorten
  - recap
  - follow-up
  - custom message
- prepend transcript context to each request

[electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts)

Responsibilities:

- capture a fresh screenshot in main before each AI request
- call the active AI service
- stream chunks over IPC
- persist messages/usage

### Database / Persistence

[electron/services/database.ts](/Users/sumedh/cluely-natively/electron/services/database.ts)

Responsibilities:

- initialize SQLite database
- persist settings
- persist messages
- persist usage stats
- maintain an in-memory settings cache loaded at startup

Current persisted settings include:

- AI provider
- Codex model
- Codex extra flags
- transcript language
- window opacity
- rolling context size

### Audio / Transcript Modules

[renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)

Responsibilities:

- boot the renderer-side capture graph
- open microphone stream
- enumerate and attempt to open BlackHole
- create `AudioContext` at 16kHz
- load `public/audioWorklet.js`
- batch PCM from the worklet
- send PCM chunks to main process
- emit detailed terminal logs through `logDebug()`
- manage diagnostics strip state

Important functions:

- `startAudioCapture()`
- `startAudioCaptureFallback()`
- `handleRecordingToggle()`

[public/audioWorklet.js](/Users/sumedh/cluely-natively/public/audioWorklet.js)

Responsibilities:

- run inside `AudioWorklet`
- collect float PCM off the audio thread
- convert to Int16
- post batched PCM back to the renderer main thread

[electron/ipc/audioHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/audioHandlers.ts)

Responsibilities:

- start and stop transcript backend
- receive renderer PCM chunks
- forward transcript events/status/errors to renderer

Important functions:

- `initAudioHandlers()`

[electron/services/googleSTT.ts](/Users/sumedh/cluely-natively/electron/services/googleSTT.ts)

Important note:

- filename still says `googleSTT.ts` for compatibility with the original structure
- runtime implementation is no longer Google STT

Current responsibilities:

- spawn persistent Python transcription server
- buffer PCM in memory
- flush to WAV chunks on timer / silence / max window
- send WAV paths to Python server
- receive transcript text back from Python server

Important methods:

- `start()`
- `stop()`
- `pushPCM()`
- `setLanguage()`
- `isRunning()`
- `isServerReady()`
- `getServerError()`
- `getLastTranscript()`

[scripts/transcribe_server.py](/Users/sumedh/cluely-natively/scripts/transcribe_server.py)

Responsibilities:

- load `faster-whisper` once using the `turbo` model
- keep model in memory across transcript chunks
- receive WAV file paths on stdin
- transcribe using VAD
- emit transcript text on stdout

### Screenshot / Screen Capture Modules

[electron/ipc/screenshotHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/screenshotHandlers.ts)

Responsibilities:

- capture full screen in main process
- capture selective cropped screenshot through an overlay window
- return base64 PNG data

[renderer/hooks/useScreenshot.ts](/Users/sumedh/cluely-natively/renderer/hooks/useScreenshot.ts)

Responsibilities:

- simple renderer hook for full/selective screenshot actions

[renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)

Screen responsibilities:

- continuously open display media for visual preview
- update cached renderer-side screen preview
- manual composer screenshot attachment

### Window Behavior

[electron/ipc/windowHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/windowHandlers.ts)

Responsibilities:

- window move/hide/show/quit handlers
- register movement and visibility shortcuts
- apply content-size-driven resizing updates

## How Audio Is Captured

Current capture flow:

1. Renderer starts recording in [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)
2. `getUserMedia()` opens:
   - microphone input
   - BlackHole audioinput if available
3. Both streams are connected into the same Web Audio graph
4. `AudioContext` runs at `16000Hz`
5. `public/audioWorklet.js` batches PCM and returns Int16 chunks
6. Renderer sends chunks via `window.electronAPI.pushAudioChunk()`
7. Main process receives chunks in [electron/ipc/audioHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/audioHandlers.ts)
8. [electron/services/googleSTT.ts](/Users/sumedh/cluely-natively/electron/services/googleSTT.ts) buffers PCM
9. Buffered PCM is periodically written to temp WAV files
10. WAV paths are sent into [scripts/transcribe_server.py](/Users/sumedh/cluely-natively/scripts/transcribe_server.py)
11. Python `faster-whisper` server returns transcript text
12. Transcript text is emitted to renderer via `transcript-update`

Current transcript backend behavior:

- persistent Python subprocess
- `faster-whisper` with `turbo`
- `device='cpu'`
- `compute_type='int8'`
- VAD enabled in Python server
- shorter chunk windows for lower latency

Current known audio facts from logs:

- mic stream opens and carries signal
- BlackHole opens but current RMS logs are `0.00000`, meaning no output audio is entering it
- transcript now works for mic input

## How Screen Is Captured

There are two separate screen capture paths:

1. Continuous renderer-side screen preview
2. Fresh main-process screenshot capture for AI requests

Renderer-side preview:

- `navigator.mediaDevices.getDisplayMedia()` is opened for video
- on macOS, no display audio is requested
- a hidden video element plus canvas extracts periodic JPEG preview frames
- this is used only for local visual context / preview state

Main-process fresh screenshot:

- [electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts) captures a fresh screenshot before each AI request
- this is the image actually sent to Codex

Manual screenshot path:

- `Cmd/Ctrl+H` captures full screenshot and attaches it
- `Cmd/Ctrl+Shift+H` triggers selective screenshot mode

## Keyboard Shortcuts

Currently wired shortcuts include:

- `Cmd/Ctrl + B` toggle visibility
- `Cmd/Ctrl + H` full screenshot
- `Cmd/Ctrl + Shift + H` selective screenshot
- `Cmd/Ctrl + Enter` trigger answer/send
- `Cmd/Ctrl + Arrow Keys` move window
- `Cmd/Ctrl + Q` quit
- `Cmd/Ctrl + ,` open settings
- `Cmd/Ctrl + Shift + D` diagnostics

## Current Diagnostics

Current terminal logs now include:

- main-process transcript backend startup
- Python server loading state
- PCM chunk receipt
- renderer-side mic/BlackHole/device logs forwarded into terminal
- per-source RMS logs
- transcript chunk flush/send logs
- final transcript lines

Current diagnostics strip shows:

- mic status
- BlackHole status
- PCM bytes/sec
- whisper backend state
- recent transcript preview

## Current Known Issues

1. BlackHole is open but silent

What logs show:

- `BlackHole stream active`
- repeated `blackhole rms=0.00000 active=false`

Meaning:

- app-side capture is opening BlackHole correctly
- macOS is not routing system output into it
- this is currently the blocker for output-audio transcript

2. Transcript service starts, stops, then starts again in dev

Observed in logs:

- initial `LocalTranscriptService started`
- immediate `Stopped`
- then a clean second start

Likely cause:

- dev lifecycle / renderer remount / hot-reload behavior

3. UI parity is still incomplete

- overlay is closer to the reference
- not yet a literal pixel-perfect copy

## Best Next Steps

If the goal is functional stability first:

1. Fix BlackHole routing at the macOS level and confirm non-zero `blackhole rms`
2. Remove the initial dev-mode start/stop churn
3. Tune transcript latency vs accuracy further if desired

If the goal is visual parity first:

1. Port more directly from the reference repo component structure
2. Align exact spacing, motion, and typography
3. Reduce the remaining differences in settings modal and diagnostics placement

## Summary

This project is no longer on the original broken multi-path transcript stack. The active architecture now is:

- Electron overlay
- renderer Web Audio capture graph
- mic + BlackHole mixed into one PCM stream
- persistent Python `faster-whisper turbo` server
- Codex CLI for AI responses
- SQLite for settings/history/usage
- continuous screen preview plus fresh main-process screenshot per AI request

Mic transcription is working. Output-audio transcription is currently blocked by silent BlackHole routing, not by failure to open the device in code.
