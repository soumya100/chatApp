# Real-time events

[Wiki home](README.md)

## Pusher setup

Pusher is configured in src/lib/pusher.ts. The browser SDK uses NEXT_PUBLIC_PUSHER_APP_KEY and NEXT_PUBLIC_PUSHER_APP_CLUSTER and authenticates private subscriptions through POST /api/pusher/auth. The server SDK uses PUSHER_APP_ID, NEXT_PUBLIC_PUSHER_APP_KEY, PUSHER_APP_SECRET and the configured cluster. The server secret must never reach the browser.

SDK clients are initialized lazily so build-time route analysis does not require runtime credentials.

## Private and presence channels

Private and presence subscriptions must be authorized server-side. Reuse the channel naming helpers in src/lib/utils.ts. Do not make private conversation or group data available through public channels.

## Persistence and broadcasts

Redis is the source of truth; Pusher is the delivery mechanism. For a mutation: authenticate, authorize, validate, persist, then broadcast. Clients can disconnect or miss events, so they must recover by fetching history or reloading the relevant state. A live event is not proof that a user is authorized to access its payload.

Group poll/event/announcement creation updates feature state and the corresponding group inbox entry atomically before real-time synchronization.

## Client guidelines

- Subscribe only to channels the current user can access.
- Unsubscribe when leaving a conversation or unmounting a component.
- Avoid duplicate event handlers during React renders.
- Reconcile duplicate deliveries using stable message IDs.
- Recover from reconnects by fetching authoritative server state.

## Troubleshooting

Check Pusher credentials and cluster, inspect /api/pusher/auth responses, confirm the user has access to the channel, and verify the Redis record exists. History should recover persisted state if a broadcast was missed.
