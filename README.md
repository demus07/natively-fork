# Natively

Natively is an Electron desktop overlay assistant for meetings, interviews, and on-screen problem solving. It runs as a floating always-on-top HUD, captures live transcript context locally, captures current screen context, and sends AI requests through the local `codex` CLI instead of hosted model APIs.

This README is a current-state engineering handoff. It describes what the project does now, how it looks now, which modules are active, how audio and screenshots work, what is persisted, and what still depends on local machine setup.

## Current Product Behavior

The app currently behaves like a compact floating assistant HUD:

- transparent Electron overlay window
- frameless, always-on-top, hidden from taskbar
- content protection enabled
- centered floating overlay layout
- top control capsule
- compact assistant panel with quick actions and live transcript ticker
- expandable answer card above the panel when an AI response exists

The active runtime stack is:

- AI backend: local `codex` CLI
- transcript backend: local Python `faster-whisper`
- persistence: SQLite via `better-sqlite3`
- screen capture: Electron `desktopCapturer` plus renderer display preview

## UI As It Exists Now

The overlay is currently structured as:

```text
overlay-root
├── control-capsule
├── answer-card (only when a response exists / is streaming)
└── assistant-panel
```

### Control Capsule

The top capsule is always visible and currently contains:

- app icon
- `Hide` button
- display/screenshot visibility toggle
- mic toggle

Current behavior:

- `Hide` hides the overlay window
- display toggle controls whether the overlay should appear in screenshots
- mic toggle starts/stops transcript capture

### Assistant Panel

The lower HUD panel is intentionally minimal and currently contains:

- quick action row
- live transcript ticker

Removed from the visible HUD:

- large prompt input field
- SMART row
- model label in the panel

### Answer Card

When AI content exists, an answer card appears above the main panel.

Current behavior:

- same dark glass styling as the capsule and panel
- scrollable message history for the current app session
- assistant responses stream progressively in the renderer
- previous responses remain visible and scrollable until the app restarts

## Window Behavior

Electron window configuration is currently set up as a floating HUD:

- `frame: false`
- `transparent: true`
- `alwaysOnTop: true`
- `resizable: false`
- `skipTaskbar: true`
- `backgroundColor: "#00000000"`
- content protection enabled

Current size behavior:

- idle overlay: `720 x 120`
- expanded overlay: up to `720 x 360`

Current positioning:

- horizontally centered on the primary display

Current resize behavior:

- the renderer reports content dimensions to main after streamed content changes
- main clamps width to `720`
- main clamps height between `120` and `360`
- the window grows in steps as streamed answer content increases instead of snapping straight to max height

Files responsible:

- [electron/main.ts](/Users/sumedh/cluely-natively/electron/main.ts)
- [electron/ipc/windowHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/windowHandlers.ts)
- [src/shared.ts](/Users/sumedh/cluely-natively/src/shared.ts)

## Current UX Rules

### New Session Behavior

Each app launch starts fresh:

- previous stored message history is cleared on startup
- transcript state is reset on startup
- current-session responses remain visible only until the app is shut down and restarted

### AI Requests

Quick actions currently visible:

- `What to answer?`
- `Shorten`
- `Recap`
- `Follow Up Question`
- `Answer`

Current AI behavior:

- quick actions create a new assistant response
- Codex stdout is streamed live from the child process into the renderer
- response text is revealed progressively in the renderer
- previous answers remain in the answer card scrollback during the same app session
- requests use live transcript context plus current screenshot context

### Transcript Behavior

The transcript row is a rolling ticker:

- receives fast interim transcript updates plus final confirmed transcript updates from the local backend
- interim text can appear dimmed before final confirmation
- dedupes repeated or incremental duplicate transcript segments on the final path
- keeps newest text visible by scrolling to the newest content
- displays backend status text when transcript is still empty

## What Is Working

At the current project state:

- Electron overlay launches
- build succeeds
- local Codex requests work
- AI response rendering works
- assistant responses stream progressively
- Codex streaming is real stdout streaming, not synthetic delayed chunking
- microphone transcription works
- transcript backend starts locally through Python
- transcript supports a two-pass interim/final flow
- current-session answer history remains scrollable
- screenshot capture works
- overlay visibility in screenshots is configurable from the capsule
- selective screenshot capture works
- settings persist in SQLite
- usage tracking persists in SQLite

## What Is Partial / Environment-Dependent

### System Audio / BlackHole

The app opens BlackHole successfully when it is visible to Chromium, but whether output audio actually contributes transcript text still depends on macOS routing output into BlackHole.

Observed current reality on this machine:

- BlackHole device enumerates successfully
- BlackHole stream opens successfully
- if RMS stays zero, the OS is not routing output audio into it

That is not an Electron bug at that point; it is an OS audio routing state.

### Pixel Parity

The HUD is substantially closer to the reference overlay than the earlier scaffold, but it should still be treated as an actively refined clone rather than a guaranteed perfect 1:1 of every spacing/motion detail in the reference GIF.

## Active Modules

## Electron Main Process

[electron/main.ts](/Users/sumedh/cluely-natively/electron/main.ts)

Responsibilities:

- create the main BrowserWindow
- apply transparent frameless overlay behavior
- enable content protection
- register permission handlers
- register display media request handler
- initialize IPC handlers
- register global shortcuts
- forward renderer debug logs into terminal output

Important functions:

- `positionWindow()`
- `createMainWindow()`
- `bootstrap()`

## Preload Bridge

[electron/preload.ts](/Users/sumedh/cluely-natively/electron/preload.ts)

Responsibilities:

- expose `window.electronAPI`
- bridge window control IPC
- bridge transcript/audio IPC
- bridge screenshot IPC
- bridge AI IPC
- bridge settings/history/stats IPC

Important exposed methods:

- `hideWindow()`
- `showWindow()`
- `moveWindow()`
- `updateContentDimensions()`
- `setWindowOpacity()`
- `captureFullScreen()`
- `captureSelectiveScreen()`
- `setScreenshotOverlayVisibility()`
- `startAudioCapture()`
- `stopAudioCapture()`
- `pushAudioChunk()`
- `sendMessage()`
- `getSettings()`
- `saveSettings()`
- `clearHistory()`
- `getUsageStats()`
- `logDebug()`

## AI Layer

[electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts)

Responsibilities:

- receive AI requests from renderer
- persist message records
- ensure screenshot context exists before AI routing
- stream AI chunks to renderer
- emit AI completion/error events

[electron/services/aiRouter.ts](/Users/sumedh/cluely-natively/electron/services/aiRouter.ts)

Responsibilities:

- assemble prompt context
- format transcript context
- build quick-action prompts
- route all requests to Codex

[electron/services/codex.ts](/Users/sumedh/cluely-natively/electron/services/codex.ts)

Responsibilities:

- invoke local `codex`
- stream stdout incrementally to renderer IPC as chunks arrive
- append optional Codex flags from settings

## Transcript / Audio Layer

[renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)

Responsibilities:

- boot the renderer-side audio graph
- initialize screen preview capture
- manage HUD state
- manage streamed AI typing presentation
- manage transcript diagnostics state

[renderer/hooks/useAudio.ts](/Users/sumedh/cluely-natively/renderer/hooks/useAudio.ts)

Responsibilities:

- hold transcript string state
- hold interim transcript state
- dedupe repeated transcript segments on final transcript updates
- expose recording start/stop helpers

[public/audioWorklet.js](/Users/sumedh/cluely-natively/public/audioWorklet.js)

Responsibilities:

- batch audio off the audio worklet thread
- convert float PCM to Int16
- post audio chunks back to the renderer

[electron/ipc/audioHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/audioHandlers.ts)

Responsibilities:

- receive renderer PCM chunks
- start/stop transcript backend
- forward transcript interim/final updates plus status/errors to renderer

[electron/services/localTranscript.ts](/Users/sumedh/cluely-natively/electron/services/localTranscript.ts)

Important note:

- despite the old role, this is now the actual local transcript service module

Current responsibilities:

- manage the local transcript service
- buffer PCM chunks
- run a fast snapshot flush for interim transcript
- run a full draining flush for final transcript
- send `FAST:` and `FULL:` WAV paths to Python server
- read interim and final transcript text back

[scripts/transcribe_server.py](/Users/sumedh/cluely-natively/scripts/transcribe_server.py)

Responsibilities:

- run persistent `faster-whisper`
- load the model once
- receive `FAST:` and `FULL:` WAV file paths on stdin
- emit `INTERIM:` and `FINAL:` transcript lines on stdout

## Screenshot Layer

[electron/ipc/screenshotHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/screenshotHandlers.ts)

Responsibilities:

- full screen capture
- selective screenshot overlay capture
- hide/show overlay around capture when screenshot visibility is disabled
- maintain screenshot visibility preference in main process memory

[renderer/hooks/useScreenshot.ts](/Users/sumedh/cluely-natively/renderer/hooks/useScreenshot.ts)

Responsibilities:

- provide simple capture helpers for renderer use

## Persistence Layer

[electron/services/database.ts](/Users/sumedh/cluely-natively/electron/services/database.ts)

Responsibilities:

- initialize SQLite tables
- persist settings
- persist messages
- persist usage
- maintain in-memory settings cache

Current persisted settings include:

- `codexModel`
- `codexExtraFlags`
- `transcriptLanguage`
- `whisperModel`
- `windowOpacity`
- `rollingContextSize`
- `includeOverlayInScreenshots`

## Renderer UI Components

[renderer/components/TitleBar.tsx](/Users/sumedh/cluely-natively/renderer/components/TitleBar.tsx)

- top control capsule
- hide button
- screenshot visibility toggle
- mic toggle

[renderer/components/QuickActions.tsx](/Users/sumedh/cluely-natively/renderer/components/QuickActions.tsx)

- compact quick action pills

[renderer/components/TranscriptPanel.tsx](/Users/sumedh/cluely-natively/renderer/components/TranscriptPanel.tsx)

- rolling transcript ticker

[renderer/components/ChatPanel.tsx](/Users/sumedh/cluely-natively/renderer/components/ChatPanel.tsx)

- scrollable answer history for current app session
- markdown rendering
- code block syntax highlighting
- copy button

[renderer/components/SettingsModal.tsx](/Users/sumedh/cluely-natively/renderer/components/SettingsModal.tsx)

- in-app settings overlay

[renderer/index.css](/Users/sumedh/cluely-natively/renderer/index.css)

- all HUD layout and styling tokens
- glass surfaces
- capsule styling
- ticker styling
- answer card styling

## Packages In Use

From [package.json](/Users/sumedh/cluely-natively/package.json):

Runtime dependencies:

- `react`
- `react-dom`
- `react-markdown`
- `react-syntax-highlighter`
- `lucide-react`
- `@tanstack/react-query`
- `better-sqlite3`
- `electron-is-dev`

Important note:

- the only active AI runtime path is Codex CLI
- the only active transcript runtime path is local `faster-whisper`

Dev/build dependencies:

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

Python-side package:

- `faster-whisper`

## How Audio Is Captured

Current audio flow:

1. Renderer opens microphone stream via `getUserMedia`
2. Renderer attempts to open BlackHole as an `audioinput`
3. Both streams feed one `AudioContext`
4. `public/audioWorklet.js` batches and converts PCM to Int16
5. Renderer sends PCM via `pushAudioChunk`
6. Main process receives chunks in `audioHandlers.ts`
7. `localTranscript.ts` keeps a rolling PCM buffer
8. fast snapshot flushes produce interim transcript
9. full draining flushes produce final transcript
10. `scripts/transcribe_server.py` transcribes both passes via `faster-whisper`
11. interim text is emitted first, then final text replaces it

## How Screen Capture Works

There are two screen-context paths:

### 1. Live screen context for AI

- renderer keeps a live display-media preview
- latest preview frame is cached as base64 screen context
- AI requests prefer that current screen context
- if none exists, main process can capture a fresh screenshot

### 2. Explicit screenshot capture

- full capture via Electron `desktopCapturer`
- selective capture via a fullscreen temporary crop overlay
- screenshot visibility preference controls whether the overlay hides before capture

Current screenshot visibility rule:

- if `includeOverlayInScreenshots = false`
  - overlay hides briefly before screenshot capture
- if `includeOverlayInScreenshots = true`
  - overlay remains visible in screenshot output

## Keyboard Shortcuts

Currently wired global shortcuts:

- `Cmd/Ctrl + B` → hide/show overlay
- `Cmd/Ctrl + H` → capture full screenshot
- `Cmd/Ctrl + Shift + H` → capture selective screenshot
- `Cmd/Ctrl + Enter` → trigger answer action
- `Cmd/Ctrl + Q` → quit
- `Cmd/Ctrl + Arrow Keys` → move window

Renderer-local shortcuts:

- `Cmd/Ctrl + ,` → open settings
- `Cmd/Ctrl + Shift + D` → toggle diagnostics strip

## Build / Run

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

## Current Verified State

At this handoff point:

- `npm run build` passes
- local repo is initialized
- remote `origin` points to `https://github.com/demus07/natively-fork.git`
- branch `main` exists and is pushed
- app launches as a minimal floating HUD overlay
- mic button exists in the capsule
- screenshot visibility toggle exists in the capsule
- previous responses remain visible and scrollable during the current app session
- chat history clears only when the app is shut down and restarted
- dead Gemini/Groq/Ollama service code has been removed
- transcript service module is now `localTranscript.ts`

## Known Remaining Gaps

- full pixel-perfect parity with the reference GIF still requires final micro-polish
- system/output transcription still depends on real macOS routing into BlackHole

## Files To Inspect First

If another engineer or model takes over, start here:

1. [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)
2. [renderer/index.css](/Users/sumedh/cluely-natively/renderer/index.css)
3. [renderer/components/TitleBar.tsx](/Users/sumedh/cluely-natively/renderer/components/TitleBar.tsx)
4. [renderer/components/TranscriptPanel.tsx](/Users/sumedh/cluely-natively/renderer/components/TranscriptPanel.tsx)
5. [renderer/components/ChatPanel.tsx](/Users/sumedh/cluely-natively/renderer/components/ChatPanel.tsx)
6. [electron/ipc/screenshotHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/screenshotHandlers.ts)
7. [electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts)
8. [electron/services/localTranscript.ts](/Users/sumedh/cluely-natively/electron/services/localTranscript.ts)
9. [scripts/transcribe_server.py](/Users/sumedh/cluely-natively/scripts/transcribe_server.py)
