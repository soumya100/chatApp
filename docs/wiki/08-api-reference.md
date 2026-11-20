# API reference

[Wiki home](README.md)

This is a route index, not a replacement for each handler's Zod schema. Unless stated otherwise, protected routes require an authenticated NextAuth session. Check route source for exact methods, payloads and response shapes.

## Authentication and users

| Route | Responsibility |
| --- | --- |
| /api/auth/[...nextauth] | NextAuth sign-in/session handlers |
| POST /api/auth/register | Credentials registration |
| /api/users/search | User search |
| /api/user/avatar | Update avatar |
| /api/user/group-preferences | Group privacy preferences |

## Friends

| Route | Responsibility |
| --- | --- |
| /api/friends/add | Send friend request |
| /api/friends/accept | Accept request |
| /api/friends/deny | Decline request |
| /api/friends/list | List friends |

## Messages

| Route | Responsibility |
| --- | --- |
| POST /api/message/send | Send text or media message |
| GET /api/message/history | Fetch paginated history |
| /api/message/edit | Edit message |
| /api/message/delete | Soft-delete message |
| /api/message/react | Toggle reaction |
| /api/message/read | Update read state |
| /api/message/typing | Publish typing state |
| /api/message/search | Search messages |

## Groups

| Route | Responsibility |
| --- | --- |
| /api/group/create | Create group |
| /api/group/list | List groups |
| /api/group/members/add | Add members |
| /api/group/[groupId]/members | Group member operations |
| /api/group/[groupId]/manage | Group administration/settings |
| /api/group/[groupId]/features | Polls, votes, events, RSVPs and announcements |
| /api/group/[groupId]/pin | Pinned-message operations |

## Communities

| Route | Responsibility |
| --- | --- |
| GET, POST /api/community | List/create communities |
| /api/community/[communityId] | Community-specific operations |

## Real-time, media and maintenance

| Route | Responsibility |
| --- | --- |
| POST /api/pusher/auth | Authorize private/presence channels |
| POST /api/upload | Vercel Blob client uploads |
| GET /api/cron/cleanup-expired-messages | Scheduled expired-message cleanup |

## Common status codes

- 401: unauthenticated.
- 403: authenticated but not authorized for the resource/action.
- 404: resource not found.
- 400 or 422: invalid request, depending on the handler.
- 429: rate limit exceeded; some handlers include Retry-After.

## Adding an endpoint

Authenticate, validate, authorize, rate-limit where appropriate, persist before broadcasting, test both permitted and denied requests, and update this index plus the relevant feature page.
