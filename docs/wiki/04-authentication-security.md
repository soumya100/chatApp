# Authentication and security

[Wiki home](README.md) · [Security policy](../../SECURITY.md)

## Authentication

NextAuth is configured in src/lib/auth.ts. The current providers include credentials and optional Google OAuth. Credentials are checked against bcrypt hashes. Sessions use the JWT strategy, and identity fields are copied into the server session. Google is registered only when both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured.

## Route protection

Middleware protects dashboard navigation and redirects unauthenticated visitors. Middleware is not the API security boundary: each protected route must independently resolve the server session and authorize the target resource.

Examples from current handlers include checking that a direct-message requester is a participant and friend, and checking group membership before group history or message sending. Private/presence channel authorization is handled by /api/pusher/auth.

## Authorization checklist

1. Resolve the session server-side.
2. Reject missing user identity.
3. Load the target resource from trusted storage.
4. Verify participant or membership relationship.
5. Verify admin/owner role for privileged actions.
6. Validate user-controlled fields and enforce size limits.
7. Return only data the caller is allowed to see.
8. Add tests for allowed and denied access.

Never trust sender IDs, role names, membership lists, channel names or permission flags supplied only by the browser.

## Rate limiting

src/lib/ratelimit.ts implements a Redis sorted-set sliding-window limiter. The message-send route currently applies a per-user limit of 15 messages per 10 seconds and returns HTTP 429 when exceeded. Add abuse controls to new high-volume or sensitive operations as appropriate.

## Secret handling

NEXTAUTH_SECRET, GOOGLE_CLIENT_SECRET, UPSTASH_REDIS_REST_TOKEN, PUSHER_APP_SECRET, BLOB_READ_WRITE_TOKEN and CRON_SECRET are server secrets. NEXT_PUBLIC_PUSHER_APP_KEY and NEXT_PUBLIC_PUSHER_APP_CLUSTER are intentionally public. Use HTTPS, restrict provider access and rotate exposed credentials immediately.

## Upload security

The upload endpoint requires an authenticated session, limits uploads to 30 MiB and uses an explicit MIME allow-list. SVG, HTML and XHTML are rejected. Do not broaden the allow-list without a security review.

Report vulnerabilities privately using the process in SECURITY.md. Do not put exploit details or personal data in public issues.
