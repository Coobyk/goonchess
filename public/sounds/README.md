# Sound packs

Every sound in goonchess belongs to a **pack**: a folder here with one file
per sound (`move`, `capture`, `check`, `promote`, `explosion`, `win`, `draw`).
The header's speaker button opens the picker, where you can switch packs and
hear the difference.

All of these sounds are dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). You may use
them for anything, with no attribution required.

## `wooden`

Real pieces on a real board. Cut from CC0 recordings on Freesound:

- move, capture — **“Chess Pieces Move (Close)”** by
  [JJTaynos](https://freesound.org/people/JJTaynos/sounds/733927/)
- check — **“Notification Correct”** by
  [TheBuilder15](https://freesound.org/people/TheBuilder15/sounds/415762/)
- win — **“Game Success Fanfare”** by
  [el_boss](https://freesound.org/people/el_boss/sounds/677859/)

The rest is synthesised.

## `eightbit`

Chiptune blips and boops, synthesised from square waves by
[`scripts/generate-sounds.py`](../../scripts/generate-sounds.py).

## `memes`

The good stuff. CC0 recordings from Freesound, trimmed to their best moment:

| Sound | Recording |
| --- | --- |
| move | **“Retro, Coin 07”** by [LilMati](https://freesound.org/people/LilMati/sounds/515738/) |
| capture | **“Rimshot 1”** by [Sorinious_Genious](https://freesound.org/people/Sorinious_Genious/sounds/573259/) |
| check | **“wah wah sad trombone”** by [kirbydx](https://freesound.org/people/kirbydx/sounds/175409/) |
| promote | **“Industrial Air Horn”** by [mcpable](https://freesound.org/people/mcpable/sounds/131930/) |
| explosion | **“Drama Boom 02”** by [modusmogulus](https://freesound.org/people/modusmogulus/sounds/802074/) |
| win | **“Crowd Cheer 5”** by [Krizin](https://freesound.org/people/Krizin/sounds/651646/) |
| draw | **“Fail Jingle (layer 1)”** by [unfa](https://freesound.org/people/unfa/sounds/181354/) |

## Building them

```bash
python3 scripts/generate-sounds.py
```

The script needs numpy and ffmpeg. It downloads the CC0 recordings (cached in
your temp directory), cuts and synthesises the sounds, and encodes 128 kbps mono
MP3s. Keep the `.mp3` files in these folders; `src/lib/sound.ts` loads
`/sounds/<pack>/<name>.mp3`.

Adding a pack of your own is a folder plus a line in
`src/lib/soundPacks.ts` — nothing else has to change.
