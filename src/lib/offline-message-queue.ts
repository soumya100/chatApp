"use client"

export interface OfflineMessageRecord {
  id: string
  chatId: string
  payload: {
    text: string
    chatId: string
    requestId: string
    mediaUrl?: string
    mediaType?: string
    fileName?: string
    fileSize?: number
    duration?: number
    replyTo?: Message["replyTo"]
  }
  createdAt: number
}

const DATABASE_NAME = "chatapp-offline-queue"
const STORE_NAME = "messages"
const DATABASE_VERSION = 1
const MAX_QUEUED_MESSAGES_PER_CHAT = 200

function openQueueDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Offline storage is unavailable"))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" })
        store.createIndex("chatId", "chatId", { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("Unable to open offline queue"))
    request.onblocked = () => reject(new Error("Offline queue upgrade is blocked by another tab"))
  })
}

export async function enqueueOfflineMessage(record: OfflineMessageRecord): Promise<void> {
  const database = await openQueueDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      let queueFull = false
      const existing = store.get(record.id)
      existing.onsuccess = () => {
        if (existing.result) {
          store.put(record)
          return
        }
        const count = store.index("chatId").count(record.chatId)
        count.onsuccess = () => {
          if (count.result >= MAX_QUEUED_MESSAGES_PER_CHAT) {
            queueFull = true
            transaction.abort()
            return
          }
          store.put(record)
        }
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error("Unable to save offline message"))
      transaction.onabort = () => reject(new Error(queueFull ? "Offline message queue is full for this chat" : "Offline message save was aborted"))
    })
  } finally {
    database.close()
  }
}

export async function listOfflineMessages(chatId: string): Promise<OfflineMessageRecord[]> {
  const database = await openQueueDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly")
      const request = transaction.objectStore(STORE_NAME).index("chatId").getAll(chatId)
      request.onsuccess = () => resolve((request.result as OfflineMessageRecord[]).sort((a, b) => a.createdAt - b.createdAt))
      request.onerror = () => reject(request.error || new Error("Unable to read offline messages"))
    })
  } finally {
    database.close()
  }
}

export async function removeOfflineMessage(id: string): Promise<void> {
  const database = await openQueueDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite")
      transaction.objectStore(STORE_NAME).delete(id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error("Unable to remove offline message"))
    })
  } finally {
    database.close()
  }
}
