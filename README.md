<img src="public/logo.svg" width="64" height="64" alt="">

# goonchess

A client-side chess **variant maker**. Build a board, paint terrain, design piece
movement, place the starting army, then play it — all in the browser.

Deployable to Cloudflare Workers with GitHub Actions.

## Features

- **Play view** — full rules engine with legal-move hints, hover previews, check
  and checkmate detection, castling, promotion, en passant, undo and move
  history. A piece may promote into a choice of pieces, and the player picks.
  The same position three times is a draw, counted with the same rule chess
  uses: the pieces, the side to move, the castles still possible and the en
  passant right all have to match.
- **Opponent bot** — play against a bot in any variant. It searches with the
  same rules engine the game uses, so it understands custom pieces, portals and
  blasts; three strengths, from a casual opponent to a deep search. The search
  runs in a worker, so the board stays responsive while it thinks. The bot can
  take a fixed side or a random one that is rolled for every new game, and two
  bots can play each other, each with its own strength, while you watch.
  Under the hood it is a real engine: negamax with alpha-beta, a table of the
  positions it has already looked at, a narrow-window re-search, killer and
  history move ordering, a capture-only horizon and a late-move reduction —
  about twice the speed and a full ply deeper than before, at the same
  thinking time.
- **Analysis** — the bot looks at the position on the board and says what it
  thinks: a score for the first army. The line it would play is hidden by
  default and can be switched on.
- **Puzzles** — positions taken from games the bot played against itself, each
  with a capture that cannot be taken back. The panel counts the ones you solve.
- **Chess clocks** — time per side with an increment, from 1+0 to 15+10. The
  clock starts with the first move, and the bot never uses more than a third of
  its time.
- **Replay and export** — step through any game again, and write it out as a
  picture, an animated GIF or a video (MP4 where the browser can record it).
  Positions also export as PNG, as PGN with algebraic notation, and as FEN,
  which imports back into the Maker.
- **Keyboard play** — the arrow keys move a cursor over the board, Enter plays,
  and every move is announced for screen readers.
- **Rulebook** — `/rulebook` renders a human-readable guide from the current
  variant: starting board, terrain key, armies, win conditions, movement and
  capture patterns, flags, effects, promotions and the active display settings.
- **Built-in variants** — Classic Chess, Mini Chess, **Only Horses** (every
  piece is a horse and every horse jumps), **Bomb Queen** (a queen that steps
  one square in any direction and detonates on every capture), **Lucky Rollers**
  (pieces that throw a die to decide how they move), Chaos Lab (portals, walls,
  uncapturable gems and bombers) and blank boards to start from.
- **Sound** — a bundled CC0 sound set for moves, captures, checks, promotions,
  explosions and game endings, with a mute toggle. It comes in **packs**: real
  wooden pieces, chiptune **8-bit** blips, and a **meme** pack with vine booms
  and exclamation stings. The speaker button in the header switches packs —
  adding your own is a folder of files and one line of code.
- **Threat visualizer** — an optional overlay with arrows from each attacker to
  the piece it can capture, plus attacked-square coverage and rings for hanging
  or defended pieces, for the side to move or both armies at once.
- **Win confetti** — a canvas volley in the winner's colours, skipped when the
  visitor prefers reduced motion.
- **Turn view** — for two players sharing a screen: leave the board alone, flip
  it 180° after every turn, or rotate only the pieces so they face the player
  whose turn it is.
- **Animated moves** — a piece glides to the square it landed on instead of
  teleporting. A capture fades out as the mover arrives, a swap sends both
  pieces on their way, a portal swallows the piece and spits it out at the
  other end, and an explosion only fires once the mover has landed.
- **Maker view** with four tabs and a live board preview:
  - **Board** — size from 3×3 to 16×16 and terrain brushes: open, wall, void,
    two-way portals and one-way portals. The squares keep the same colours
    everywhere; the theme decides which pair they wear.
  - **Pieces** — click a movement grid to design leapers and sliders, give a
    piece a separate capture pattern, and set restrictions: jump, must capture,
    uncapturable, royal, moves once, mirror for the opposing team, rolls a die
    to pick its pattern, plus first-move-only patterns (pawn double steps).
  - **Setup** — drag pieces from the palette onto the board, erase, mirror and
    copy a side; setup validation warns about missing royal pieces.
  - **Rules** — variant name and description, team names/colors/forward
    direction, and win conditions: checkmate, capture the royal, elimination and
    a point target.
- **Undo and redo** — every change in the Maker can be taken back, so a
    mis-click is never the end of an idea.
- **Special effects** — swap positions on capture, exploding with a radius (the
  blast wipes out every enemy piece inside it, spares the mover's own team, and
  plays a shockwave animation on the board), and spawning another piece type.
- **Built-in Shadcn UI** — Radix primitives, dark-first theme with a light mode.
- **Real URLs** — `/` plays, `/maker` builds, `/rulebook` explains the rules, and
  every maker tab has its own address (`/maker/pieces`, `/maker/rules`, ...).
  Back/forward and direct links work; Cloudflare serves the SPA fallback for
  deep links.
- **Library, links and JSON** — save named variants locally, share an encoded
  link, or import/export the raw JSON.
- **Short share links** — a variant is packed into a compact array form
  (index references instead of random ids, a bitfield for flags, only non-empty
  squares stored) and deflated into a URL-safe code, so a full 8×8 set fits in
  roughly 500 characters instead of several thousand. Links use the `#v2=`
  hash; older `#v=` links still load.

## Dev

```bash
npm install
npm run dev
npm run build
```

## Cloudflare deployment

Every push to `main` builds and deploys the Worker to `chess.coobyk.com` with
GitHub Actions. Configure this repository setting once:

- Repository secret `CLOUDFLARE_API_TOKEN` with permission to deploy Workers

The workflow can also be started manually from the Actions tab.
