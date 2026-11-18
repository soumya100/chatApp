import { db } from "@/lib/db"

// Redis executes this string server-side as ONE atomic Lua transaction
// (EVAL is Redis server-side scripting — no JavaScript code is parsed or run
// here). The group document (KEYS[1]) is verified against its expected raw
// value, and the community document (when present) against its own, BEFORE
// the first write, so a rejected caller leaves no partial state behind, and
// no other Redis command can interleave with the writes. Two concurrent
// add-members calls can no longer overwrite each other's member list or drop
// a concurrent community update: the losing call retries on freshly read
// documents. Result 0 = stale group document, result 2 = stale community
// document, result 1 = committed.
const atomicGroupMemberAdd = `
local current = redis.call("GET", KEYS[1])
if current ~= ARGV[1] then return 0 end

local communityKey = ARGV[9]
if communityKey ~= "" and redis.call("GET", communityKey) ~= ARGV[12] then return 2 end

local addedIds = cjson.decode(ARGV[6])
local systemMessage = cjson.decode(ARGV[7])

redis.call("SET", KEYS[1], ARGV[3])
for _, memberId in ipairs(addedIds) do
  redis.call("SADD", KEYS[2], memberId)
  redis.call("SADD", "user:" .. memberId .. ":groups", ARGV[5])
end
redis.call("ZADD", KEYS[3], tonumber(systemMessage.timestamp), ARGV[7])
if communityKey ~= "" then
  redis.call("SET", communityKey, ARGV[10])
  for _, memberId in ipairs(addedIds) do
    redis.call("SADD", "user:" .. memberId .. ":communities", ARGV[11])
  end
end
return 1
`

export interface GroupMembershipCommitInput {
    groupKey: string
    membersSetKey: string
    messagesKey: string
    expectedRaw: string
    updatedGroup: Group
    actorId: string
    groupId: string
    addedMemberIds: string[]
    systemMessage: Message
    community: {
        key: string
        next: string
        id: string
        expectedRaw: string
    }
}

// Commits one add-members mutation through the compare-and-set Lua script
// above. Argument positions (ARGV[1]..ARGV[12]) are part of the script's
// contract and must not be reordered.
export async function commitGroupMembershipAtomically(input: GroupMembershipCommitInput) {
    return db.eval(
        atomicGroupMemberAdd,
        [input.groupKey, input.membersSetKey, input.messagesKey],
        [
            input.expectedRaw,
            "addMembers",
            JSON.stringify(input.updatedGroup),
            input.actorId,
            input.groupId,
            JSON.stringify(input.addedMemberIds),
            JSON.stringify(input.systemMessage),
            "false",
            input.community.key,
            input.community.next,
            input.community.id,
            input.community.expectedRaw
        ]
    )
}
