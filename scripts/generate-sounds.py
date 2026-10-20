#!/usr/bin/env python3
"""Build goonchess' sound set.

Three sounds are cut from CC0 recordings on Freesound:

* move/capture — "Chess Pieces Move (Close)" by JJTaynos
    https://freesound.org/s/733927/
* check — "Notification Correct" by TheBuilder15
    https://freesound.org/s/415762/
* win — "Game Success Fanfare" by el_boss
    https://freesound.org/s/677859/

Everything else is synthesised here. The whole set is dedicated to the public
domain under CC0 1.0.

Run ``python3 scripts/generate-sounds.py`` after editing. It needs numpy and
ffmpeg (for decoding the sources and encoding the MP3s).
"""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import tempfile
import urllib.request
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sounds")
MOVE_SOURCE_URL = "https://cdn.freesound.org/previews/733/733927_15803939-hq.mp3"
MOVE_SOURCE_CACHE = os.path.join(tempfile.gettempdir(), "goonchess-chess-moves.mp3")
CHECK_SOURCE_URL = "https://cdn.freesound.org/previews/415/415762_6090639-hq.mp3"
CHECK_SOURCE_CACHE = os.path.join(tempfile.gettempdir(), "goonchess-check.mp3")
WIN_SOURCE_URL = "https://cdn.freesound.org/previews/677/677859_9129912-hq.mp3"
WIN_SOURCE_CACHE = os.path.join(tempfile.gettempdir(), "goonchess-win.mp3")

# Timestamps in the CC0 source recording. The taps were chosen for a short,
# clean wooden attack; move is lighter, capture lands harder.
MOVE_AT = 30.137
CAPTURE_AT = 24.416


def t(duration: float) -> np.ndarray:
    return np.arange(int(SR * duration)) / SR


def bell(freq: float, duration: float, amp: float = 0.35, decay: float = 2.5) -> np.ndarray:
    tt = t(duration)
    e = np.exp(-decay * tt)
    tone = np.sin(2 * np.pi * freq * tt)
    tone += 0.42 * np.sin(2 * np.pi * freq * 2.01 * tt) * np.exp(-decay * 1.5 * tt)
    tone += 0.2 * np.sin(2 * np.pi * freq * 3.02 * tt) * np.exp(-decay * 2.2 * tt)
    tone *= 1.0 + 0.08 * np.sin(2 * np.pi * 5 * tt)
    return tone * e * amp


def place(target: np.ndarray, src: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(SR * at)
    end = min(len(target), i + len(src))
    if end > i:
        target[i:end] += src[: end - i] * gain


def normalize(x: np.ndarray, peak: float = 0.9) -> np.ndarray:
    m = float(np.max(np.abs(x)))
    if m > 0:
        x = x * (peak / m)
    # 4 ms fades avoid the DC click at either edge.
    fade = min(len(x) // 2, int(SR * 0.004))
    if fade > 0:
        x[:fade] *= np.linspace(0, 1, fade)
        x[-fade:] *= np.linspace(1, 0, fade)
    return x


def highpass(x: np.ndarray, cutoff: float = 90.0) -> np.ndarray:
    alpha = 1.0 / (1.0 + 2 * math.pi * cutoff / SR)
    y = np.empty_like(x)
    prev_x = 0.0
    prev_y = 0.0
    for i, v in enumerate(x):
        prev_y = alpha * (prev_y + v - prev_x)
        prev_x = v
        y[i] = prev_y
    return y


def fetch_cached(url: str, cache: str, label: str) -> str:
    if not os.path.exists(cache):
        print(f"downloading CC0 {label}...")
        urllib.request.urlretrieve(url, cache)
    return cache


def load_audio(path: str) -> np.ndarray:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg is required to decode the CC0 sound sources")
    raw = subprocess.run(
        [ffmpeg, "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        check=True,
        stdout=subprocess.PIPE,
    ).stdout
    return np.frombuffer(raw, dtype="<f4").astype(np.float32)


def extract(source: np.ndarray, at: float, duration: float, pre_roll: float = 0.006) -> np.ndarray:
    start = max(0, int((at - pre_roll) * SR))
    end = min(len(source), start + int(duration * SR))
    segment = source[start:end].copy()
    segment = highpass(segment)
    # Short fade-out so the board resonance does not end on a hard edge.
    fade = min(len(segment), int(SR * 0.025))
    segment[-fade:] *= np.linspace(1, 0, fade)
    return segment


def make_move(source: np.ndarray) -> np.ndarray:
    return normalize(extract(source, MOVE_AT, 0.19), 0.86)


def make_capture(source: np.ndarray) -> np.ndarray:
    sound = np.zeros(int(SR * 0.28), dtype=np.float32)
    hit = extract(source, CAPTURE_AT, 0.23)
    place(sound, hit, 0.0)
    # A tiny second contact gives the capture a heavier, colliding edge.
    place(sound, hit, 0.021, 0.35)
    return normalize(sound, 0.94)


def make_check(source: np.ndarray) -> np.ndarray:
    """A short, calm two-note alert — distinct, but not a shrill alarm."""
    duration = 0.64
    segment = source[: int(SR * duration)].copy()
    segment = highpass(segment, 140)
    fade = int(SR * 0.05)
    segment[-fade:] *= np.linspace(1, 0, fade)
    return normalize(segment, 0.7)


def make_win(source: np.ndarray) -> np.ndarray:
    """The opening phrase of a quick CC0 major-chord victory fanfare."""
    start = int(SR * 0.12)
    segment = source[start : start + int(SR * 2.5)].copy()
    segment = highpass(segment, 80)
    fade = int(SR * 0.08)
    segment[-fade:] *= np.linspace(1, 0, fade)
    return normalize(segment, 0.9)


def make_promote() -> np.ndarray:
    out = np.zeros(int(SR * 0.62), dtype=np.float32)
    for i, f in enumerate([659.25, 880.0, 1174.7, 1568.0]):
        place(out, bell(f, 0.42, 0.3, 4.2), i * 0.06)
    return normalize(out, 0.68)



def make_explosion() -> np.ndarray:
    dur = 0.85
    tt = t(dur)
    rng = np.random.default_rng(31)
    # A wide noise burst that loses its highs as it decays.
    noise = rng.uniform(-1, 1, len(tt))
    kernel = np.exp(-np.arange(len(tt)) / (SR * 0.08))
    noise = np.convolve(noise, kernel / kernel.sum(), mode="same")
    burst = noise * np.exp(-tt * 4.2)
    crackle = np.diff(noise, prepend=noise[0]) * np.exp(-tt * 10) * 0.55
    sweep = 90 * np.exp(-tt * 1.8) + 28
    phase = 2 * np.pi * np.cumsum(sweep) / SR
    sub = np.tanh(np.sin(phase) * 2.1) * np.exp(-tt * 3.1) * 0.75
    rumble = noise * np.exp(-tt * 2.5) * 0.4
    out = burst * 0.8 + crackle * 0.6 + sub + rumble
    return normalize(out, 0.95)


def make_draw() -> np.ndarray:
    out = np.zeros(int(SR * 0.7), dtype=np.float32)
    place(out, bell(440, 0.46, 0.4, 3.0), 0.0)
    place(out, bell(329.63, 0.55, 0.38, 2.8), 0.13)
    return normalize(out, 0.6)


def write_wav(name: str, x: np.ndarray) -> None:
    path = os.path.join(OUT, name + ".wav")
    data = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    print("wrote", path)


def encode_mp3s(names: list[str]) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ffmpeg not found; keeping WAVs")
        return
    for name in names:
        wav = os.path.join(OUT, name + ".wav")
        mp3 = os.path.join(OUT, name + ".mp3")
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "128k", mp3],
            check=True,
        )
        os.remove(wav)
    print("encoded mp3 files")


def main() -> None:
    move_source = load_audio(fetch_cached(MOVE_SOURCE_URL, MOVE_SOURCE_CACHE, "chess recording"))
    check_source = load_audio(fetch_cached(CHECK_SOURCE_URL, CHECK_SOURCE_CACHE, "check alert"))
    win_source = load_audio(fetch_cached(WIN_SOURCE_URL, WIN_SOURCE_CACHE, "victory fanfare"))
    sounds = {
        "move": make_move(move_source),
        "capture": make_capture(move_source),
        "check": make_check(check_source),
        "promote": make_promote(),
        "explosion": make_explosion(),
        "win": make_win(win_source),
        "draw": make_draw(),
    }
    for name, data in sounds.items():
        write_wav(name, data)
    encode_mp3s(list(sounds))


if __name__ == "__main__":
    main()
