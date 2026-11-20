# Getting started

[Wiki home](README.md)

## Prerequisites

- Node.js 20 or newer (package engine: >=20.0.0).
- npm, Yarn or pnpm.
- Upstash Redis REST database.
- Pusher Channels application.
- Google OAuth credentials if Google sign-in is required.
- Vercel Blob store/token for attachments.

## Install

```bash
git clone https://github.com/soumya100/chatApp.git
cd chatApp
npm install
cp .env.example .env.local
```

On Windows PowerShell, use Copy-Item .env.example .env.local.

## Environment variables

| Variable | Purpose |
| --- | --- |
| NEXTAUTH_SECRET | Unique secret for NextAuth JWT/session protection. |
| NEXTAUTH_URL | Canonical application URL. |
| GOOGLE_CLIENT_ID | Optional Google OAuth client ID. |
| GOOGLE_CLIENT_SECRET | Optional Google OAuth client secret. |
| UPSTASH_REDIS_REST_URL | Upstash Redis REST endpoint. |
| UPSTASH_REDIS_REST_TOKEN | Upstash Redis credential. |
| BLOB_READ_WRITE_TOKEN | Vercel Blob read/write token. |
| PUSHER_APP_ID | Pusher server-side app ID. |
| NEXT_PUBLIC_PUSHER_APP_KEY | Browser-visible Pusher key. |
| PUSHER_APP_SECRET | Server-only Pusher secret. |
| PUSHER_APP_CLUSTER | Server-side Pusher cluster. |
| NEXT_PUBLIC_PUSHER_APP_CLUSTER | Browser-visible Pusher cluster. |
| CRON_SECRET | Bearer secret for expired-message cleanup endpoint. Configure when scheduling cleanup. |

The checked-in .env.example is the starting point for application integrations. Generate a strong secret, for example with openssl rand -base64 32. Never commit .env.local or any real credential.

## Google OAuth

When enabled, configure the authorized callback URL as http://localhost:3000/api/auth/callback/google locally and https://YOUR_DOMAIN/api/auth/callback/google in production. Both Google variables must be present for the provider to be registered.

## Run locally

```bash
npm run dev
```

Open http://localhost:3000.

## Useful commands

| Command | Purpose |
| --- | --- |
| npm run dev | Development server |
| npm run build | Production build |
| npm run start | Production server |
| npm run lint | Lint |
| npm run typecheck | TypeScript check |
| npm test | Test suite matched by package script |
| npm run test:security | Security/source regression tests |
| npm run test:smoke | Smoke tests |
| npm run test:browser | Browser smoke tests |
| npm run audit:security | Dependency audit |

Redis integration tests require a disposable Redis instance and REDIS_INTEGRATION_ALLOW_FLUSHDB=1 because they execute FLUSHDB. Never run them against production data.
