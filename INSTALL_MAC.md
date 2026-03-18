# Natively Mac Install

Use the correct DMG for your Mac:
- Apple Silicon: `Natively-1.0.0-arm64.dmg`
- Intel: `Natively-1.0.0.dmg`

Install by opening the DMG, dragging `Natively.app` to `Applications`, and opening it. If macOS blocks it, right-click the app and choose `Open` once.

When prompted, allow:
- Microphone
- Screen Recording / Screen Capture

On launch, Natively opens the setup screen so you can choose your providers.

Easiest setup:
- `Gemini + Deepgram` — needs internet plus Gemini and Deepgram API keys

Local/private setup:
- `Ollama + faster-whisper` — needs Ollama running, the model downloaded, Python 3.8+, and `faster-whisper` installed

If you want system/output audio transcription, install BlackHole 2ch.
