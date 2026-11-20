# Operations and troubleshooting

[Wiki home](README.md)

## Deployment checklist

- [ ] Node.js 20 or newer.
- [ ] Configure production environment variables.
- [ ] Set a unique NEXTAUTH_SECRET and correct NEXTAUTH_URL.
- [ ] Configure Google OAuth callback URL if Google sign-in is enabled.
- [ ] Verify Upstash Redis URL/token and database access.
- [ ] Verify Pusher app ID, key, secret and cluster.
- [ ] Configure Vercel Blob token if attachments are enabled.
- [ ] Configure CRON_SECRET and schedule expired-message cleanup if disappearing messages are enabled.
- [ ] Use HTTPS and restrict deployment dashboard access.
- [ ] Run typecheck, lint, tests, production build and dependency audit before release.
- [ ] Keep preview and production credentials/data isolated.

## Login or NextAuth errors

Check NEXTAUTH_SECRET, NEXTAUTH_URL and the Google OAuth callback URL. Google sign-in requires both Google environment variables. Confirm that deployment variables are configured in the environment that is actually running.

## Redis connection errors

Check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. The Redis client is initialized lazily, so missing configuration may surface only when a route first accesses Redis.

## Real-time events missing

Check Pusher credentials and cluster, inspect /api/pusher/auth, confirm membership/channel authorization and verify the corresponding Redis state. Reloading history should recover persisted messages if a broadcast was missed.

## Upload failures

Check the Blob token, authenticated session, file size limit (30 MiB) and MIME allow-list. SVG, HTML and XHTML are intentionally rejected.

## Group permission failures

Confirm the current user is a group member. Admin-only actions require the appropriate role. Do not remove server-side authorization checks to bypass a 403 response.

## Expired messages remain

Confirm CRON_SECRET exists and the scheduled request sends Authorization: Bearer <CRON_SECRET>. Inspect server logs for Redis or Blob deletion errors and verify the scheduler targets the correct deployment.

## Pre-release commands

```bash
npm run typecheck
npm run lint
npm test
npm run test:security
npm run build
npm run audit:security
```

Run Redis integration tests only against a disposable database: they require REDIS_INTEGRATION_ALLOW_FLUSHDB=1 and execute FLUSHDB.

## Incident response

If a credential is exposed, revoke/rotate it at the provider, update deployment configuration, redeploy, review provider logs and remove the leaked value from repository history where appropriate. Removing a secret from the latest commit does not invalidate it. Avoid logging cookies, authorization headers, tokens, private messages or uploaded file contents.
