#!/usr/bin/env python3
"""Generate goonchess' tiny CC0 sound set.

The files in ``public/sounds`` are synthesized from scratch by this script, so
they carry no third-party licence. Run ``python3 scripts/generate-sounds.py``
after editing; it writes 16-bit mono WAVs and then encodes them to MP3 when
``ffmpeg``/``lame`` is available.

Design notes: the move/capture sounds are short wooden knocks (a noise
transient plus a couple of damped modes), the explosion is a filtered noise
burst over a falling sub sine, and check/promote/win are small bell arpeggios.
"""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sounds")


def t(duration: float) -> np.ndarray:
    return np.arange(int(SR * duration)) / SR


def noise(duration: float, lowpass: float, highpass: float = 0.0, seed: int = 1) -> np.ndarray:
    rng = np.random.default_rng(seed)
    x = rng.uniform(-1.0, 1.0, int(SR * duration))
    # One-pole high pass then low pass, both frequency-controllable.
    if highpass > 0:
        alpha = 1.0 / (1.0 + 2 * math.pi * highpass / SR)
        y = np.empty_like(x)
        prev_x = 0.0
        prev_y = 0.0
        for i, v in enumerate(x):
            prev_y = alpha * (prev_y + v - prev_x)
            prev_x = v
            y[i] = prev_y
        x = y
    alpha = 1.0 / (1.0 + 2 * math.pi * lowpass / SR)
    y = np.empty_like(x)
    prev = 0.0
    for i, v in enumerate(x):
        prev = prev + alpha * (v - prev)
        y[i] = prev
    return y


def bell(freq: float, duration: float, amp: float = 0.35, decay: float = 2.5) -> np.ndarray:
    tt = t(duration)
    e = np.exp(-decay * tt)
    tone = np.sin(2 * np.pi * freq * tt)
    tone += 0.42 * np.sin(2 * np.pi * freq * 2.01 * tt) * np.exp(-decay * 1.5 * tt)
    tone += 0.2 * np.sin(2 * np.pi * freq * 3.02 * tt) * np.exp(-decay * 2.2 * tt)
    tone *= 1.0 + 0.08 * np.sin(2 * np.pi * 5 * tt)
    return tone * e * amp


def wood(duration: float, base: float, seed: int, amp: float = 0.8) -> np.ndarray:
    tt = t(duration)
    body = (
        np.sin(2 * np.pi * base * tt)
        + 0.55 * np.sin(2 * np.pi * base * 1.61 * tt)
        + 0.28 * np.sin(2 * np.pi * base * 2.43 * tt)
    ) * np.exp(-tt * 38)
    click = noise(duration, lowpass=5200, highpass=700, seed=seed) * np.exp(-tt * 170)
    air = noise(duration, lowpass=1100, seed=seed + 7) * np.exp(-tt * 55) * 0.22
    out = body * 0.65 + click * 0.45 + air
    return out * amp


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


def write(name: str, x: np.ndarray) -> None:
    path = os.path.join(OUT, name + ".wav")
    data = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    print("wrote", path)


def make_move() -> np.ndarray:
    out = np.zeros(int(SR * 0.16))
    place(out, wood(0.12, 235, 11, 0.9), 0.0)
    return normalize(out, 0.72)


def make_capture() -> np.ndarray:
    out = np.zeros(int(SR * 0.24))
    place(out, wood(0.13, 175, 21, 1.0), 0.0)
    place(out, wood(0.11, 240, 22, 0.7), 0.045)
    place(out, noise(0.06, lowpass=2600, seed=23) * np.exp(-t(0.06) * 60), 0.0, 0.5)
    return normalize(out, 0.9)


def make_check() -> np.ndarray:
    out = np.zeros(int(SR * 0.62))
    place(out, bell(880, 0.5, 0.5, 3.2), 0.0)
    place(out, bell(1174.7, 0.45, 0.42, 3.6), 0.09)
    return normalize(out, 0.62)


def make_promote() -> np.ndarray:
    out = np.zeros(int(SR * 0.8))
    for i, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        place(out, bell(f, 0.5, 0.34, 3.0), i * 0.075)
    return normalize(out, 0.7)


def make_explosion() -> np.ndarray:
    dur = 0.85
    tt = t(dur)
    # A wide noise burst that loses its highs as it decays.
    burst = noise(dur, lowpass=1400, seed=31) * np.exp(-tt * 4.2)
    crackle = noise(dur, lowpass=7000, highpass=1600, seed=32) * np.exp(-tt * 10) * 0.55
    # Falling sub rumble with a little saturation.
    sweep = 90 * np.exp(-tt * 1.8) + 28
    phase = 2 * np.pi * np.cumsum(sweep) / SR
    sub = np.tanh(np.sin(phase) * 2.1) * np.exp(-tt * 3.1) * 0.75
    rumble = noise(dur, lowpass=120, seed=33) * np.exp(-tt * 2.5) * 0.4
    out = burst * 0.8 + crackle * 0.6 + sub + rumble
    return normalize(out, 0.95)


def make_win() -> np.ndarray:
    out = np.zeros(int(SR * 1.25))
    for i, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        place(out, bell(f, 0.7, 0.3, 2.4), i * 0.11)
    for f in [523.25, 659.25, 783.99, 1046.5]:
        place(out, bell(f, 0.8, 0.16, 1.9), 0.46)
    return normalize(out, 0.78)


def make_draw() -> np.ndarray:
    out = np.zeros(int(SR * 0.75))
    place(out, bell(440, 0.5, 0.4, 3.0), 0.0)
    place(out, bell(329.63, 0.6, 0.38, 2.6), 0.13)
    return normalize(out, 0.6)


def make_illegal() -> np.ndarray:
    dur = 0.14
    tt = t(dur)
    buzz = np.sign(np.sin(2 * np.pi * 150 * tt)) * 0.25
    e = np.exp(-tt * 25)
    return normalize(buzz * e, 0.4)


SOUNDS = {
    "move": make_move,
    "capture": make_capture,
    "check": make_check,
    "promote": make_promote,
    "explosion": make_explosion,
    "win": make_win,
    "draw": make_draw,
    "illegal": make_illegal,
}


def encode_mp3s() -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ffmpeg not found; keeping WAVs")
        return
    for name in SOUNDS:
        wav = os.path.join(OUT, name + ".wav")
        mp3 = os.path.join(OUT, name + ".mp3")
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", mp3],
            check=True,
        )
        os.remove(wav)
    print("encoded mp3 files")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, fn in SOUNDS.items():
        write(name, fn())
    encode_mp3s()
