# Dither Kit

The dithered chart components, vendored from the
[Dither Kit](https://tripwire.sh/dither-kit) registry:

```sh
npx @dither-kit/cli add area-chart
```

They are the engine behind the computer analysis graph: an ordered-dither
area chart on a small canvas, with the axes, grid, zero line and sparkles
that go with it. `AreaChart` and `LineChart` come from `area-chart.tsx`, and
everything they share is in `core`.

The registry items do not state a licence, so the source is recorded here
rather than assumed. The registry lives at `https://tripwire.sh/r/`.

Reinstalling with the CLI overwrites these files; the note above is the only
thing to carry over.
