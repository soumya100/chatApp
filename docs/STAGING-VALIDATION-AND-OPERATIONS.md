# ChatApp staging validation and production operations

This runbook distinguishes automated repository checks from checks that require real service credentials and operator access.

## 1. Authenticated staging validation

The manual GitHub Actions workflow `Authenticated staging security and soak validation` runs against a dedicated staging deployment. It is deliberately not run against production and refuses the known production hostname.

Create a GitHub Environment named `staging` and configure:

**Environment variables**
- `CHATAPP_STAGING_URL`: HTTPS URL of the isolated staging deployment.
- `CHATAPP_TEST_GROUP_ID`: ID of a disposable group in the staging Redis database.

**Environment secrets**
- `CHATAPP_TEST_ADMIN_EMAIL` / `CHATAPP_TEST_ADMIN_PASSWORD`
- `CHATAPP_TEST_MEMBER_EMAIL` / `CHATAPP_TEST_MEMBER_PASSWORD`
- `CHATAPP_TEST_OUTSIDER_EMAIL` / `CHATAPP_TEST_OUTSIDER_PASSWORD`

Prepare three dedicated test accounts:
- Admin: creator/admin of the test group.
- Member: ordinary member, not an admin.
- Outsider: not a member of the test group.

Use a separate staging Upstash database, Pusher application and Vercel Blob store. Do not reuse production credentials or production user data. Ensure the group contains no real users or messages.

Run Actions → Authenticated staging security and soak validation → Run workflow. Type `staging-only` in the confirmation field. The workflow checks:
- Credentials sign-in and authenticated session establishment for all three roles.
- Admin/member access and outsider denial for group membership and feature APIs.
- Outsider denial for group message history.
- Member message persistence, idempotent retry (same message ID), and visibility to the admin and sender.
- Session invalidation after sign-out.
- A bounded, concurrent 3-account read soak (30–600 seconds; default 180 seconds), reporting request-batch p50/p95/max latency and failing on unexpected statuses or server errors.

This is a controlled staging regression/soak check, not a capacity benchmark. It does not prove Pusher client delivery to connected browsers, production-scale throughput, or multi-hour stability.

### Session-token note

The current NextAuth configuration uses JWT sessions. It does not implement a separate OAuth refresh-token rotation protocol. Validate JWT session establishment, authoritative user-record revalidation, logout invalidation, expiry, and account deletion/revocation. Do not claim refresh-token rotation has been tested when that mechanism is not present.

### Authenticated VAPT

The current CI ZAP active/passive scans are unauthenticated. The staging workflow above adds real authenticated role-boundary API checks, but is not a replacement for an authenticated ZAP/manual VAPT exercise. Before release, use the staging environment and the three test accounts to assess:
- IDOR/BOLA across direct chats, groups, communities, member management, pins, reactions, attachments and search.
- Role escalation (member → admin), unauthorized removal/promote/demote, and cross-community access.
- Session replay, logout, expiry, deleted-account invalidation, CSRF and cookie flags.
- Pusher private/presence channel authorization and attachment URL ownership.
- Rate-limit bypass and concurrent authorization/state changes.

Use only these dedicated accounts and synthetic records. Do not scan production or other users' data.

## 2. Load and soak testing

The staging workflow performs a small 3-account read soak and validates message write/idempotency/read visibility. It is intentionally conservative and must run only against the isolated staging group/database.

For a real capacity test, first define an agreed target (concurrent connected clients, message rate, test duration, latency/error SLOs), then run a separate staged ramp test with connected Pusher clients. Increase traffic gradually, monitor Redis command latency/limits, Vercel function duration/concurrency, Pusher connection/event limits and Blob operations, and stop automatically on sustained 5xx, rising queue backlog, or provider throttling. Do not run a high-volume or multi-hour test until the provider limits and cost ceiling are known.

A successful 180-second low-volume soak is not evidence of full-scale capacity or long-duration stability.

## 3. Real deployment verification

The production deploy workflow is configured to deploy only a green `main` commit and then run the HTTP smoke matrix. Configure the GitHub `production` environment secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` before relying on that workflow. The Vercel preview rate-limit event previously reported is not evidence of a successful deployment.

For release verification:
1. Confirm the exact deployed commit SHA and Vercel deployment state is **Ready**.
2. Verify production environment variables exist without printing their values: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, Google OAuth client ID/secret, Upstash REST URL/token, Blob read/write token, Pusher app ID/key/secret/cluster, and `CRON_SECRET`.
3. Confirm Google OAuth redirect URI exactly matches the production origin and `/api/auth/callback/google`.
4. Sign in with a dedicated production test account; verify session, message send/read, group membership boundaries, upload/download/delete, realtime events, and sign-out.
5. Verify both Vercel Cron schedules execute and return success. `vercel.json` schedules expiry cleanup at 02:00 UTC and media cleanup at 03:00 UTC.
6. Verify the authenticated Redis health endpoint returns `status: ok` and review queue counters.

Never copy production secret values into GitHub issues, logs, test output or chat.

## 4. Backups, monitoring, alerts and recovery

### Required provider configuration
- **Upstash Redis:** In the Upstash console, verify whether the selected plan/database provides automated backups or point-in-time recovery and configure the strongest available retention. Record retention, backup timestamps and restore owner. If the plan does not provide backups, export the data on a schedule to encrypted, access-restricted storage using a tested process.
- **Vercel Blob:** Redis backups do not back up uploaded Blob objects. Define a separate export/retention process for attachments and preserve the mapping between message metadata and Blob object URLs. Confirm deletion/retention policy and access controls.
- **Secrets:** Keep a secure inventory and rotation procedure for NextAuth, OAuth, Upstash, Pusher, Blob and cron credentials. Store recovery copies in a password manager or secrets manager, not in the repository.

### Monitoring
- The authenticated `/api/health/redis` endpoint reports Redis reachability and bounded expiry/media queue counts without exposing keys or user data.
- The `ChatApp production health monitor` workflow checks HTTPS login availability and Redis readiness every 15 minutes once enabled on the default branch. It requires production environment variable `CHATAPP_BASE_URL` and secret `CRON_SECRET`.
- Configure GitHub Actions failure notifications for the maintainers who own this service. Also enable Vercel function error/runtime alerts and Upstash database/usage alerts in their provider consoles. GitHub Actions is a supplemental probe, not a substitute for provider monitoring or an external uptime service.

### Restore / rollback drill
1. Record the last known-good Vercel deployment and the latest Redis/Blob backup/export timestamps.
2. Restore Redis backup into a separate recovery database first; never test restore by overwriting production.
3. Point a recovery/staging deployment at the restored Redis database and verify user records, group membership indexes, message history, expiry indexes, delivery outbox, media cleanup/orphan queues and application sign-in.
4. Verify Blob objects independently; restore missing objects or reconcile dangling message references before switching traffic.
5. Roll back the Vercel deployment if the application release is faulty. If data is corrupt, switch only after a tested recovery plan and explicit operator approval.
6. Record actual recovery time and data loss window (RTO/RPO), then repeat the drill periodically.

## Release exit criteria

Do not label the service fully production-ready until:
- The authenticated staging workflow passes using dedicated admin/member/outsider accounts.
- Authenticated VAPT is completed with no unresolved High/Critical findings.
- A provider-aware load/soak test meets agreed latency/error/throughput targets.
- The exact production commit is deployed and the post-deploy authenticated smoke passes.
- Redis and Blob backup/restore have been demonstrated, health/queue monitoring is active, alerts reach an owner, and rollback/recovery has been rehearsed.
