#!/usr/bin/env python3
"""
Natively — faster-whisper transcription server.
Receives WAV file paths on stdin, transcribes using faster-whisper,
emits INTERIM: and FINAL: transcript lines on stdout.
"""

import os
import sys


def load_env_file():
    env_path = os.path.join(os.getcwd(), ".env")
    if not os.path.exists(env_path):
        env_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "..", ".env"
        )
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and (key not in os.environ or not os.environ[key].strip()):
                    os.environ[key] = value
    except Exception as error:
        sys.stderr.write(f"[transcribe_server] Failed to read .env: {error}\n")
        sys.stderr.flush()


load_env_file()

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "turbo")
WHISPER_LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "en")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")

sys.stderr.write(
    f"[transcribe_server] Loading faster-whisper model: {WHISPER_MODEL} "
    f"device={WHISPER_DEVICE} compute={WHISPER_COMPUTE}\n"
)
sys.stderr.flush()

try:
    from faster_whisper import WhisperModel
except ImportError:
    sys.stderr.write(
        "[transcribe_server] ERROR: faster-whisper not installed. "
        "Run: pip install faster-whisper\n"
    )
    sys.stderr.flush()
    print("ERROR:faster-whisper not installed", flush=True)
    sys.exit(1)

try:
    model = WhisperModel(
        WHISPER_MODEL,
        device=WHISPER_DEVICE,
        compute_type=WHISPER_COMPUTE,
    )
    sys.stderr.write(
        f"[transcribe_server] loaded model: {WHISPER_MODEL}\n"
    )
    sys.stderr.flush()
except Exception as error:
    sys.stderr.write(f"[transcribe_server] ERROR loading model: {error}\n")
    sys.stderr.flush()
    print(f"ERROR:{error}", flush=True)
    sys.exit(1)

print(f"[transcribe_server] loaded model: {WHISPER_MODEL}", flush=True)
print("READY", flush=True)


def transcribe_wav(wav_path: str, mode: str) -> str:
    try:
        segments, _ = model.transcribe(
            wav_path,
            language=WHISPER_LANGUAGE if WHISPER_LANGUAGE != "auto" else None,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=300,
                speech_pad_ms=100,
            ),
            beam_size=5 if mode == "FULL" else 1,
            best_of=5 if mode == "FULL" else 1,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return text
    except Exception as error:
        sys.stderr.write(f"[transcribe_server] transcription error: {error}\n")
        sys.stderr.flush()
        return ""


def is_junk(text: str) -> bool:
    if not text:
        return True
    stripped = text.strip().strip(".,!?").lower()
    junk_phrases = {
        "thank you", "thanks", "thank you for watching",
        "please subscribe", "like and subscribe",
        "you", "the", "a", "i", ".", ",", "...", "bye", "goodbye",
        "subtitles by", "transcribed by", "www", "http",
    }
    if stripped in junk_phrases:
        return True
    if len(stripped) < 3:
        return True
    return False


for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue

    if line.startswith("FAST:"):
        wav_path = line[5:]
        mode = "FAST"
    elif line.startswith("FULL:"):
        wav_path = line[5:]
        mode = "FULL"
    else:
        wav_path = line
        mode = "FULL"

    if not os.path.exists(wav_path):
        sys.stderr.write(f"[transcribe_server] File not found: {wav_path}\n")
        sys.stderr.flush()
        continue

    transcript = transcribe_wav(wav_path, mode)

    try:
        os.unlink(wav_path)
    except Exception:
        pass

    if is_junk(transcript):
        continue

    if mode == "FAST":
        print(f"INTERIM:{transcript}", flush=True)
    else:
        print(f"FINAL:{transcript}", flush=True)
