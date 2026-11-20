# Media and message lifecycle

[Wiki home](README.md)

## Upload flow

Chat attachments use Vercel Blob. POST /api/upload uses the Vercel Blob client upload protocol and requires a valid NextAuth session before issuing an upload token. The route enforces a 30 MiB maximum, an explicit MIME allow-list, random object suffixes, and rejection of SVG, HTML and XHTML.

The browser upload helper is src/lib/mediaUpload.ts. The server route is authoritative even if the browser UI filters file types.

## Supported content

The current allow-list includes PNG, JPEG, GIF, WebP, video/audio MIME types, PDF, Word documents, plain text and ZIP archives. See src/app/api/upload/route.ts for exact values. File extensions alone are not proof of content type.

## Media messages

The message-send route accepts text and optional attachment metadata including media URL, media type, filename, size and duration. A message must contain text or an attachment. The route authenticates, validates, rate-limits and authorizes the conversation/group.

## Disappearing messages

Group settings may configure a disappearing-message duration. The send route calculates expiresAt when the setting is enabled. Expiry entries are indexed in Redis and processed by GET /api/cron/cleanup-expired-messages.

The cleanup endpoint requires the header Authorization: Bearer <CRON_SECRET>. If CRON_SECRET is absent or does not match, it returns HTTP 401.

## Cleanup behavior

The cleanup job backfills older expiry records once, then processes bounded batches. When a message references a Vercel Blob URL on the application's public Blob host, the job attempts to delete that object before removing the message from the chat index. Blob deletion failures are retained for retry.

Configure a deployment scheduler to invoke the endpoint periodically with the bearer secret. Never expose CRON_SECRET in browser code, query strings, logs or source control.
