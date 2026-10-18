<img src="assets/icon.svg" width="64" height="64" alt="">

# goonchess

Created in [T3 Code](https://t3.codes).

A zero-dependency client-side chess variant builder. Deployable to Cloudflare Pages.

## Dev

```bash
npm install
npm run dev
npm run build
```

## Cloudflare deployment

Every push to `master` builds and deploys the Worker to `chess.coobyk.com` with GitHub Actions. Configure these repository settings once:

- Repository secret `CLOUDFLARE_API_TOKEN` with permission to deploy Workers

The workflow can also be started manually from the Actions tab.
