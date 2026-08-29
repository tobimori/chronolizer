# Chronolizer playground

This plain JavaScript app runs Chronolizer in the browser. It uses a small set of shadcn-style CSS tokens and has no UI framework.

## Run locally

From the repository root:

```sh
pnpm install
pnpm --dir playground dev
```

## Deploy to Cloudflare Workers

Authenticate Wrangler, and then run:

```sh
pnpm --dir playground deploy
```

Wrangler deploys the generated `dist/` directory with Cloudflare Workers Static Assets.
