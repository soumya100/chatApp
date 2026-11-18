import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

/**
 * `groupDeletedHandler` is a closure created inside Chat's `useEffect`, so it is
 * not exported and the component cannot be rendered here (no DOM, and
 * `@/lib/pusher` needs live credentials at import time). The handler source is
 * therefore read verbatim from the component file and executed as-is with
 * stubbed `toast` / `router` dependencies, so the assertions below run against
 * the real PR code rather than a re-implementation.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const chatSourcePath = path.resolve(here, "../../../src/components/Chat/index.tsx")
const chatSource = fs.readFileSync(chatSourcePath, "utf8")

function extractArrowFunctionSource(src: string, name: string): string {
  const marker = `const ${name} = (`
  const start = src.indexOf(marker)
  if (start === -1) {
    throw new Error(`${name} is not declared in ${chatSourcePath}`)
  }

  const arrow = src.indexOf("=>", start)
  const open = arrow === -1 ? -1 : src.indexOf("{", arrow)
  if (open === -1) {
    throw new Error(`${name} does not have a block body`)
  }

  let depth = 0
  let quote: string | null = null
  for (let i = open; i < src.length; i += 1) {
    const char = src[i]

    if (quote) {
      if (char === "\\") {
        i += 1
        continue
      }
      if (char === quote) quote = null
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char
      continue
    }

    if (char === "{") {
      depth += 1
      continue
    }

    if (char === "}") {
      depth -= 1
      if (depth === 0) return src.slice(start, i + 1)
    }
  }

  throw new Error(`${name} body is not balanced`)
}

type ToastRecord = { channel: "error" | "success" | "default"; message: unknown }

interface HandlerHarness {
  handler: (payload?: unknown) => void
  toasts: ToastRecord[]
  navigations: string[]
}

function loadGroupDeletedHandler(): HandlerHarness {
  const toasts: ToastRecord[] = []
  const navigations: string[] = []

  const toast = Object.assign(
    (message: unknown) => {
      toasts.push({ channel: "default", message })
    },
    {
      error: (message: unknown) => {
        toasts.push({ channel: "error", message })
      },
      success: (message: unknown) => {
        toasts.push({ channel: "success", message })
      },
    }
  )

  const router = {
    push: (href: string) => {
      navigations.push(`push:${href}`)
    },
    replace: (href: string) => {
      navigations.push(`replace:${href}`)
    },
    back: () => {
      navigations.push("back")
    },
    forward: () => {
      navigations.push("forward")
    },
    refresh: () => {
      navigations.push("refresh")
    },
    prefetch: (href: string) => {
      navigations.push(`prefetch:${href}`)
    },
  }

  const declaration = extractArrowFunctionSource(chatSource, "groupDeletedHandler")
  const context = vm.createContext({ toast, router })
  const handler = vm.runInContext(
    `${declaration}\n;groupDeletedHandler`,
    context
  ) as (payload?: unknown) => void

  return { handler, toasts, navigations }
}

describe("Chat groupDeletedHandler", () => {
  it("new: surfaces an error toast saying the group is no longer available", () => {
    const { handler, toasts } = loadGroupDeletedHandler()

    assert.equal(handler(), undefined)
    assert.deepEqual(toasts, [
      { channel: "error", message: "This group is no longer available" },
    ])
  })

  it("new: navigates back to the chat list with router.push", () => {
    const { handler, navigations } = loadGroupDeletedHandler()

    handler()

    assert.deepEqual(navigations, ["push:/dashboard/chats"])
  })

  it("new: ignores the payload Pusher hands to the listener", () => {
    const { handler, toasts, navigations } = loadGroupDeletedHandler()

    handler({ groupId: "group-42", deletedBy: "someone-else" })
    handler(undefined)

    assert.deepEqual(toasts, [
      { channel: "error", message: "This group is no longer available" },
      { channel: "error", message: "This group is no longer available" },
    ])
    assert.deepEqual(navigations, [
      "push:/dashboard/chats",
      "push:/dashboard/chats",
    ])
  })

  it("new: emits no success/default toast and no non-push navigation", () => {
    const { handler, toasts, navigations } = loadGroupDeletedHandler()

    handler({ groupId: "group-42" })

    assert.equal(toasts.length, 1)
    assert.equal(toasts[0].channel, "error")
    assert.equal(navigations.length, 1)
    assert.equal(navigations[0], "push:/dashboard/chats")
  })

  it("new: is subscribed to group_deleted on the private channel and unsubscribed on cleanup", () => {
    assert.match(
      chatSource,
      /privateChannel\.bind\(\s*['"]group_deleted['"]\s*,\s*groupDeletedHandler\s*\)/
    )
    assert.match(
      chatSource,
      /privateChannel\.unbind\(\s*['"]group_deleted['"]\s*,\s*groupDeletedHandler\s*\)/
    )
  })
})
