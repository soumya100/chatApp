# Product overview

[Wiki home](README.md)

## What is Chat+?

Chat+ (also called NextChat in repository branding) is a real-time messaging application built with Next.js App Router, React, TypeScript, NextAuth.js, Upstash Redis, Pusher Channels and Vercel Blob.

## Main capabilities

- One-to-one conversations and friend requests.
- Group conversations, membership and administrator controls.
- Message history with cursor pagination, editing, soft deletion, replies and reactions.
- Read/unread state, typing indicators and online presence.
- Group polls, events and announcements, represented in the group activity experience and inbox.
- Communities for organizing related groups and members.
- Image, video, audio and document attachments.
- Light and dark themes and responsive layouts.

## Technology

| Layer | Technology |
| --- | --- |
| Web | Next.js App Router, React, TypeScript |
| Authentication | NextAuth.js, credentials and optional Google OAuth |
| Password hashing | bcryptjs |
| Data | Upstash Redis |
| Real-time | Pusher Channels |
| Attachments | Vercel Blob |
| Validation | Zod |
| UI | Tailwind CSS and shared React components |

## Roles

The application distinguishes authenticated users, friends, group members, group admins and community owners/admins. The server must enforce membership and role permissions for every protected operation. Client-side visibility is not an authorization boundary.

## Architecture boundaries

Redis stores application state; Pusher delivers live notifications. Pusher events are not a substitute for persisted history. Google OAuth is optional and is registered only when both Google client environment variables are configured.
