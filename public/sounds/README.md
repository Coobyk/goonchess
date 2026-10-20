# Sound set

These sounds are dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). You may use them
for anything, with no attribution required.

`move.mp3` and `capture.mp3` are cut from **“Chess Pieces Move (Close)”** by
[JJTaynos](https://freesound.org/people/JJTaynos/sounds/733927/), also CC0.
The remaining sounds are synthesized. Everything is produced by
[`scripts/generate-sounds.py`](../../scripts/generate-sounds.py):

```bash
python3 scripts/generate-sounds.py
```

The script needs numpy and ffmpeg. It downloads the CC0 recording (cached in
your temp directory), cuts the two board taps, synthesizes the rest, and
encodes 128 kbps mono MP3s. Keep the `.mp3` files in this directory;
`src/lib/sound.ts` loads `/sounds/<name>.mp3`.

| File | Used for |
| --- | --- |
| `move.mp3` | placing a piece |
| `capture.mp3` | capturing a piece |
| `check.mp3` | giving check |
| `promote.mp3` | promotion |
| `explosion.mp3` | an exploding piece's blast |
| `win.mp3` | winning |
| `draw.mp3` | a drawn game |
