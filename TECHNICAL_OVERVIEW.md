# Natively Technical Overview

## Purpose

Natively is a floating Electron HUD for live meetings, interviews, and on-screen problem solving. It combines live transcript context, screen context, and local AI assistance in a minimal always-on-top overlay.

## Core Features

- Floating HUD overlay
  - Why: keeps assistance visible without behaving like a normal desktop app window.
- Live transcript ticker
  - Why: gives immediate conversational context while staying compact.
- Two-pass transcription
  - Interim pass: fast, low-latency transcript feedback.
  - Final pass: more accurate transcript replacement shortly after.
  - Why: balances responsiveness and accuracy.
- AI answer card
  - Why: shows generated responses without opening a separate panel or full chat UI.
- Quick actions
  - `What to answer?`, `Shorten`, `Recap`, `Follow Up Question`, `Answer`
  - Why: optimize common meeting/interview workflows with one click.
- Screen-aware AI
  - Why: lets responses use current on-screen context, not just transcript text.
- Screenshot visibility toggle
  - Why: user can choose whether the overlay itself appears in captures.
- Current-session scrollback
  - Why: responses remain reviewable during the active app session without becoming persistent clutter across launches.

## Tech Stack

- Electron
  - Why: native desktop window control, transparent always-on-top overlay behavior, global shortcuts, screen capture, and content protection.
  - Benefit over a web app or Tauri here: Electron gives mature macOS/desktop capture APIs, faster iteration in this codebase, and fewer native integration gaps for overlay behavior.
- React
  - Why: predictable state management for transcript, streaming AI output, and overlay state.
  - Benefit over vanilla DOM code: easier to coordinate streaming text, transcript updates, and transient overlay states without brittle manual DOM syncing.
- TypeScript
  - Why: keeps IPC contracts and service boundaries safer across renderer/main/preload.
  - Benefit over plain JavaScript: much lower risk of silent IPC shape drift between Electron layers.
- Vite
  - Why: fast local development and simple Electron renderer bundling.
  - Benefit over heavier bundlers: quicker startup and simpler configuration for a small Electron HUD app.
- `better-sqlite3`
  - Why: lightweight local persistence for settings, usage, and session data with no separate service.
  - Benefit over async SQLite wrappers or IndexedDB: synchronous local access is simpler in the Electron main process, with less app complexity and no browser persistence edge cases.
- local `codex` CLI
  - Why: avoids hosted-provider wiring and uses a local authenticated AI runtime.
  - Benefit over remote API SDKs: no API key UI burden for the active path, fewer hosted-provider dependencies, and easier reuse of the user’s local Codex auth/runtime.
- Python `faster-whisper`
  - Why: local/offline transcription with good CPU performance and configurable quality.
  - Benefit over cloud STT: lower privacy risk, no service-account dependency, and no network round-trip.
  - Benefit over `whisper.cpp` batch calls in this app: easier model management and stronger quality/performance tradeoff on CPU with the current Python worker approach.
- Web Audio + AudioWorklet
  - Why: captures and mixes microphone plus optional BlackHole/system input with low renderer overhead.
  - Benefit over `ScriptProcessorNode`: lower-latency audio handling off the main thread and less chance of choking the UI/event loop.

## Supporting Libraries

- `react-markdown`
  - Why: renders model output safely as structured markdown.
  - Benefit over manual parsing: less custom rendering code and better consistency for lists, inline code, and formatted answers.
- `react-syntax-highlighter`
  - Why: code blocks in AI output need readable formatting.
  - Benefit over plain `<pre><code>`: much better scanability for technical answers without building a custom highlighter path.
- `lucide-react`
  - Why: lightweight icon set for the HUD controls.
  - Benefit over custom SVG management: consistent icon style with minimal maintenance overhead.
- `@tanstack/react-query`
  - Why: helps structure async UI state around requests and settings fetches.
  - Benefit over ad hoc loading state everywhere: cleaner request lifecycle handling and easier future extension.

## Architecture

- Renderer
  - Captures mic/system audio
  - Maintains live HUD state
  - Streams transcript and AI output into the overlay
- Preload
  - Exposes a narrow IPC bridge to the renderer
  - Why: keeps context isolation enabled
- Main process
  - Owns window behavior, shortcuts, screenshots, transcript service, AI routing, and persistence
- Python transcription worker
  - Runs the actual `faster-whisper` transcription pass outside the renderer/main event loop

## Why the Current Transcript Design

- Fast interim transcript
  - Why: users need near-instant feedback while speaking.
- Final transcript replacement
  - Why: short low-latency windows are less accurate than longer-context transcription.
- Fuzzy deduplication
  - Why: overlapping transcript windows otherwise produce repeated phrases.
- Two-pass FAST/FULL transcription
  - Why: it is a better UX compromise than choosing either “fast but noisy” or “accurate but delayed” alone.

## Why the Current AI Design

- Real stdout streaming from Codex
  - Why: avoids fake delayed chunking and makes responses feel live.
- Small chunk batching before IPC
  - Why: reduces renderer/main overhead without reintroducing large visible delays.
- Cached screen context preference
  - Why: avoids blocking AI startup on every screenshot capture.

## Known Constraints

- System/output transcript quality depends on correct macOS BlackHole routing.
- Pixel-perfect parity with the reference overlay still requires final visual polish.
- Codex response speed still depends partly on local CLI/runtime performance.

## Most Important Files

- [electron/main.ts](/Users/sumedh/cluely-natively/electron/main.ts)
- [electron/services/codex.ts](/Users/sumedh/cluely-natively/electron/services/codex.ts)
- [electron/services/localTranscript.ts](/Users/sumedh/cluely-natively/electron/services/localTranscript.ts)
- [electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts)
- [electron/ipc/audioHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/audioHandlers.ts)
- [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)
- [renderer/hooks/useAudio.ts](/Users/sumedh/cluely-natively/renderer/hooks/useAudio.ts)
