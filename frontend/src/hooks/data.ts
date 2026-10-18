import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../db/db'
import { indexNodes, pathTo } from '../db/tree'
import type { Bookmark, MsgNode, Thread } from '../db/types'
import { useUI } from '../store/ui'

export function useThread(threadId: string | null) {
  return useLiveQuery(() => (threadId ? db.threads.get(threadId) : undefined), [threadId])
}

/** Conversation currently on screen. */
export function useActiveConversationId(): string | null {
  const currentThreadId = useUI((s) => s.currentThreadId)
  return useThread(currentThreadId)?.conversationId ?? null
}

export function useConversationData(conversationId: string | null) {
  const nodes = useLiveQuery(
    () => (conversationId ? db.nodes.where('conversationId').equals(conversationId).toArray() : []),
    [conversationId],
  )
  const threads = useLiveQuery(
    // Oldest first: branch menus and chips list the newest last.
    async () => (conversationId ? (await db.threads.where('conversationId').equals(conversationId).toArray()).sort((a, b) => a.createdAt - b.createdAt) : []),
    [conversationId],
  )
  const bookmarks = useLiveQuery(
    () => (conversationId ? db.bookmarks.where('conversationId').equals(conversationId).toArray() : []),
    [conversationId],
  )
  return { nodes: nodes ?? [], threads: threads ?? [], bookmarks: bookmarks ?? [] }
}

const NONE = { nodes: [] as MsgNode[], threads: [] as Thread[], bookmarks: [] as Bookmark[] }

export interface ThreadView {
  thread: Thread | undefined
  path: MsgNode[]
  /** Number of leading messages inherited from parent threads. */
  inheritedCount: number
  threads: Thread[]
  bookmarks: Bookmark[]
  /** Threads with a reply still streaming (e.g. a branch asked in the background). */
  busyThreadIds: Set<string>
  loading: boolean
}

export function useThreadView(threadId: string | null): ThreadView {
  // One read transaction, so the thread's head and its nodes come from the same snapshot.
  // Separate queries can briefly see a head whose node isn't loaded yet: an empty path,
  // which collapses the chat and resets its scroll position.
  const data = useLiveQuery(
    () =>
      threadId
        ? db.transaction('r', db.threads, db.nodes, db.bookmarks, async () => {
            const thread = await db.threads.get(threadId)
            if (!thread) return undefined
            const byConversation = { conversationId: thread.conversationId }
            const [nodes, threads, bookmarks] = await Promise.all([
              db.nodes.where(byConversation).toArray(),
              // Oldest first: branch menus and chips list the newest last.
              db.threads.where(byConversation).toArray().then((ts) => ts.sort((a, b) => a.createdAt - b.createdAt)),
              db.bookmarks.where(byConversation).toArray(),
            ])
            return { thread, nodes, threads, bookmarks }
          })
        : undefined,
    [threadId],
  )
  const thread = data?.thread
  const nodes = data?.nodes ?? NONE.nodes
  const threads = data?.threads ?? NONE.threads
  const bookmarks = data?.bookmarks ?? NONE.bookmarks
  return useMemo(() => {
    const path = thread ? pathTo(indexNodes(nodes), thread.headNodeId) : []
    let inheritedCount = 0
    if (thread?.forkNodeId) {
      const i = path.findIndex((n) => n.id === thread.forkNodeId)
      inheritedCount = i + 1
    }
    const busyThreadIds = new Set(nodes.filter((n) => n.status === 'streaming').map((n) => n.threadId))
    return { thread, path, inheritedCount, threads, bookmarks, busyThreadIds, loading: !!threadId && !thread }
  }, [thread, nodes, threads, bookmarks, threadId])
}
