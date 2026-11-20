# Messaging, groups and communities

[Wiki home](README.md)

## Direct conversations

Direct-message routes use a conversation identifier containing the two participant IDs. Handlers must verify that the requester is one of the participants and that the friendship relationship exists before returning history or accepting mutations.

## Group conversations

Group chat IDs use the group--<groupId> convention. The server checks group membership before allowing history access or sending. Group settings can restrict sending to admins or enable announcements-only behavior.

Group creation, listing, membership and administration routes are under src/app/api/group. The UI components are under src/components/Chat.

## Group administration

Group administration includes member management, roles, group details, moderation settings, privacy preferences and pinned messages. The server must enforce privileges; hiding a client button is not enough. Preserve compatibility with older group records that may lack newer optional settings.

## Polls, events and announcements

The endpoint is /api/group/[groupId]/features. Its current action schema includes createPoll, votePoll, createEvent, respondEvent and announce. Polls support a question, options and multiple-selection flag; events include a title, start time and optional description/location; event responses are going, maybe or not-going.

The handler validates membership and payloads. Feature state is updated atomically in Redis, and creation actions also write a corresponding group inbox message so the activity appears in the conversation timeline. Feature collections are bounded to the latest 100 entries.

## Communities

Communities organize related groups. GET /api/community returns the user's communities and invitations. POST creates a community and may associate groups. When groups are selected, the server verifies the caller is an admin of each group and rejects groups already assigned to another community. Community-specific operations are under /api/community/[communityId]; consult the route for exact actions and permission rules.

## Message safety

Do not permit replies to deleted or system-generated messages. Do not allow access by guessed IDs. Never trust client-supplied sender identity or roles. Persist messages before broadcasting them. Keep history pagination bounded.
