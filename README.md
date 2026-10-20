<img src="assets/icon.svg" width="64" height="64" alt="">

# goonchess

A client-side chess **variant maker**. Build a board, paint terrain, design piece
movement, place the starting army, then play it — all in the browser.

Deployable to Cloudflare Workers with GitHub Actions.

## Features

- **Play view** — full rules engine with legal-move hints, hover previews, check
  and checkmate detection, promotion, en passant, undo and move
  history.
- **Rulebook** — `/rulebook` renders a human-readable guide from the current
  variant: starting board, terrain key, armies, win conditions, movement and
  capture patterns, flags, effects, promotions and the active display settings.
- **Sound** — a bundled CC0 sound set for moves, captures, checks, promotions,
  explosions and game endings, with a mute toggle.
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
  - **Board** — size from 3×3 to 16×16, square colors and five palettes,
    terrain brushes: open, wall, void, two-way portals and one-way portals.
  - **Pieces** — click a movement grid to design leapers and sliders, give a
    piece a separate capture pattern, and set restrictions: jump, must capture,
    uncapturable, royal, moves once, mirror for the opposing team, plus
    first-move-only patterns (pawn double steps).
  - **Setup** — drag pieces from the palette onto the board, erase, mirror and
    copy a side; setup validation warns about missing royal pieces.
  - **Rules** — variant name and description, team names/colors/forward
    direction, and win conditions: checkmate, capture the royal, elimination and
    a point target.
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
