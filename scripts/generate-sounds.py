#!/usr/bin/env python3
"""Build goonchess' sound packs.

Every pack lives in its own folder under ``public/sounds`` and holds one file
per sound: move, capture, check, promote, explosion, win and draw.

**Wooden** — the original set. Three sounds are cut from CC0 recordings on
Freesound:

* move/capture — "Chess Pieces Move (Close)" by JJTaynos
    https://freesound.org/s/733927/
* check — "Notification Correct" by TheBuilder15
    https://freesound.org/s/415762/
* win — "Game Success Fanfare" by el_boss
    https://freesound.org/s/677859/

**8-bit** — synthesised here: square waves, blips and boops.

**Memes** — CC0 recordings from Freesound, trimmed to their best moment:

* move — "Retro, Coin 07" by LilMati
    https://freesound.org/s/515738/
* capture — "Rimshot 1" by Sorinius_Genious
    https://freesound.org/s/573259/
* check — "wah wah sad trombone" by kirbydx
    https://freesound.org/s/175409/
* promote — "Industrial Air Horn" by mcpable
    https://freesound.org/s/131930/
* explosion — "Drama Boom 02" by modusmogulus
    https://freesound.org/s/802074/
* win — "Crowd Cheer 5" by Krizin
    https://freesound.org/s/651646/
* draw — "Fail Jingle (layer 1)" by unfa
    https://freesound.org/s/181354/

The whole set is dedicated to the public domain under CC0 1.0.

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
ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "sounds")

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

# The meme pack: preview URL, and how long the interesting part is.
MEME_SOURCES = {
    "move": (
        "https://cdn.freesound.org/previews/515/515738_6142149-hq.mp3",
        0.55,
    ),
    "capture": (
        "https://cdn.freesound.org/previews/573/573259_12517458-hq.mp3",
        0.9,
    ),
    "check": (
        "https://cdn.freesound.org/previews/175/175409_1326576-hq.mp3",
        1.6,
    ),
    "promote": (
        "https://cdn.freesound.org/previews/131/131930_1542102-hq.mp3",
        1.0,
    ),
    "explosion": (
        "https://cdn.freesound.org/previews/802/802074_15956618-hq.mp3",
        0.9,
    ),
    "win": (
        "https://cdn.freesound.org/previews/651/651646_5315864-hq.mp3",
        1.8,
    ),
    "draw": (
        "https://cdn.freesound.org/previews/181/181354_1038806-hq.mp3",
        1.4,
    ),
}


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


def square(freq: float, duration: float, duty: float = 0.5, amp: float = 0.3) -> np.ndarray:
    """A chiptune tone: a square wave with a soft edge."""
    tt = t(duration)
    phase = (freq * tt) % 1.0
    wave = np.where(phase < duty, 1.0, -1.0)
    # A little smoothing keeps it from sounding like a buzzer.
    edge = min(64, max(4, int(SR * 0.002)))
    kernel = np.ones(edge) / edge
    wave = np.convolve(wave, kernel, mode="same")
    return wave * amp


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


def loudest_window(x: np.ndarray, length: int) -> tuple[int, int]:
    """Where the interesting part of a recording is: its loudest window."""
    if len(x) <= length:
        return 0, len(x)
    window = length
    step = max(1, window // 8)
    best = 0
    best_rms = -1.0
    for start in range(0, len(x) - window, step):
        chunk = x[start : start + window]
        rms = float(np.sqrt(np.mean(chunk**2)))
        if rms > best_rms:
            best_rms = rms
            best = start
    return best, min(len(x), best + window)


def make_meme(source: np.ndarray, duration: float, peak: float = 0.85) -> np.ndarray:
    length = int(SR * duration)
    start, end = loudest_window(source, length)
    segment = source[start:end].copy()
    segment = highpass(segment, 70.0)
    fade = int(SR * 0.03)
    if len(segment) > fade * 2:
        segment[:fade] *= np.linspace(0, 1, fade)
        segment[-fade:] *= np.linspace(1, 0, fade)
    return normalize(segment, peak)


# ------------------------------------------------------------------ wooden


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
    duration = 0.64
    segment = source[: int(SR * duration)].copy()
    segment = highpass(segment, 140)
    fade = int(SR * 0.05)
    segment[-fade:] *= np.linspace(1, 0, fade)
    return normalize(segment, 0.7)


def make_win(source: np.ndarray) -> np.ndarray:
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


# ----------------------------------------------------------------- 8-bit


def chip_move() -> np.ndarray:
    out = np.zeros(int(SR * 0.14), dtype=np.float32)
    place(out, square(880, 0.05, 0.25, 0.32), 0.0)
    place(out, square(1318, 0.06, 0.25, 0.28), 0.045)
    return normalize(out, 0.8)


def chip_capture() -> np.ndarray:
    out = np.zeros(int(SR * 0.2), dtype=np.float32)
    place(out, square(392, 0.06, 0.5, 0.34), 0.0)
    place(out, square(196, 0.1, 0.5, 0.32), 0.055)
    return normalize(out, 0.85)


def chip_check() -> np.ndarray:
    out = np.zeros(int(SR * 0.34), dtype=np.float32)
    place(out, square(1046, 0.11, 0.5, 0.3), 0.0)
    place(out, square(784, 0.16, 0.5, 0.3), 0.11)
    return normalize(out, 0.8)


def chip_promote() -> np.ndarray:
    out = np.zeros(int(SR * 0.42), dtype=np.float32)
    for i, f in enumerate([523, 659, 784, 1046, 1318]):
        place(out, square(f, 0.07, 0.5, 0.28), i * 0.055)
    return normalize(out, 0.8)


def chip_explosion() -> np.ndarray:
    dur = 0.55
    tt = t(dur)
    rng = np.random.default_rng(7)
    noise = rng.uniform(-1, 1, len(tt))
    # A falling square wave under a burst of noise.
    sweep = 420 * np.exp(-tt * 5.5) + 55
    phase = 2 * np.pi * np.cumsum(sweep) / SR
    body = np.where((phase % (2 * np.pi)) < math.pi, 1.0, -1.0)
    body = body * np.exp(-tt * 6.0) * 0.5
    burst = noise * np.exp(-tt * 9.0) * 0.55
    return normalize(body + burst, 0.95)


def chip_win() -> np.ndarray:
    out = np.zeros(int(SR * 1.1), dtype=np.float32)
    melody = [(523, 0.0), (659, 0.11), (784, 0.22), (1046, 0.33)]
    for f, at in melody:
        place(out, square(f, 0.12, 0.5, 0.28), at)
    for f, at in [(1046, 0.45), (784, 0.53), (1046, 0.61)]:
        place(out, square(f, 0.11, 0.5, 0.26), at)
    return normalize(out, 0.8)


def chip_draw() -> np.ndarray:
    out = np.zeros(int(SR * 0.75), dtype=np.float32)
    place(out, square(587, 0.16, 0.5, 0.28), 0.0)
    place(out, square(440, 0.3, 0.5, 0.28), 0.16)
    return normalize(out, 0.75)


# ------------------------------------------------------------------ output


def write_wav(path: str, x: np.ndarray) -> None:
    data = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def encode_mp3s(folder: str, names: list[str]) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ffmpeg not found; keeping WAVs")
        return
    for name in names:
        wav = os.path.join(folder, name + ".wav")
        mp3 = os.path.join(folder, name + ".mp3")
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "128k", mp3],
            check=True,
        )
        os.remove(wav)
    print(f"encoded mp3 files in {folder}")


def build_pack(pack: str, sounds: dict[str, np.ndarray]) -> None:
    folder = os.path.join(ROOT, pack)
    os.makedirs(folder, exist_ok=True)
    for name, data in sounds.items():
        write_wav(os.path.join(folder, name + ".wav"), data)
    encode_mp3s(folder, list(sounds.keys()))


def main() -> None:
    # Wooden
    move_source = load_audio(fetch_cached(MOVE_SOURCE_URL, MOVE_SOURCE_CACHE, "chess recording"))
    check_source = load_audio(fetch_cached(CHECK_SOURCE_URL, CHECK_SOURCE_CACHE, "check alert"))
    win_source = load_audio(fetch_cached(WIN_SOURCE_URL, WIN_SOURCE_CACHE, "victory fanfare"))
    build_pack(
        "wooden",
        {
            "move": make_move(move_source),
            "capture": make_capture(move_source),
            "check": make_check(check_source),
            "promote": make_promote(),
            "explosion": make_explosion(),
            "win": make_win(win_source),
            "draw": make_draw(),
        },
    )

    # 8-bit
    build_pack(
        "eightbit",
        {
            "move": chip_move(),
            "capture": chip_capture(),
            "check": chip_check(),
            "promote": chip_promote(),
            "explosion": chip_explosion(),
            "win": chip_win(),
            "draw": chip_draw(),
        },
    )

    # Memes
    memes: dict[str, np.ndarray] = {}
    for name, (url, duration) in MEME_SOURCES.items():
        cache = os.path.join(tempfile.gettempdir(), f"goonchess-meme-{name}.mp3")
        source = load_audio(fetch_cached(url, cache, f"meme {name}"))
        memes[name] = make_meme(source, duration)
    build_pack("memes", memes)


if __name__ == "__main__":
    main()
