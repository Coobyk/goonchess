# Sound set

These sounds are original synthesized assets, dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). You may use them
for anything, with no attribution required.

They are produced by [`scripts/generate-sounds.py`](../../scripts/generate-sounds.py):

```bash
python3 scripts/generate-sounds.py
```

The script writes 16-bit mono WAVs and encodes them to 96 kbps MP3 with ffmpeg.
Keep the `.mp3` files in this directory; `src/lib/sound.ts` loads
`/sounds/<name>.mp3`.

| File | Used for |
| --- | --- |
| `move.mp3` | a quiet piece move |
| `capture.mp3` | a capture |
| `check.mp3` | giving check |
| `promote.mp3` | promotion |
| `explosion.mp3` | an exploding piece's blast |
| `win.mp3` | winning |
| `draw.mp3` | a drawn game |
| `illegal.mp3` | an illegal click |
