import { nanoid } from 'nanoid'
import { db } from './db'
import { threadSubtree } from './tree'
import type { Bookmark, Conversation, MsgNode, Role, TextSpan, Thread } from './types'

const now = () => Date.now()

export async function createConversation(title = 'New chat'): Promise<Conversation> {
  const t = now()
  const conv: Conversation = {
    id: nanoid(),
    title,
    titled: false,
    mainThreadId: nanoid(),
    createdAt: t,
    updatedAt: t,
  }
  const main: Thread = {
    id: conv.mainThreadId,
    conversationId: conv.id,
    parentThreadId: null,
    headNodeId: null,
    forkNodeId: null,
    title: 'Main',
    titled: true,
    createdAt: t,
    updatedAt: t,
  }
  await db.transaction('rw', db.conversations, db.threads, async () => {
    await db.conversations.add(conv)
    await db.threads.add(main)
  })
  return conv
}

/** Append a message to the end of a thread and move the thread's head to it. */
export async function appendMessage(
  threadId: string,
  role: Role,
  content: string,
  extra: Partial<Pick<MsgNode, 'status' | 'model' | 'anchor'>> = {},
): Promise<MsgNode> {
  return db.transaction('rw', db.threads, db.nodes, db.conversations, async () => {
    const thread = await db.threads.get(threadId)
    if (!thread) throw new Error(`Thread ${threadId} not found`)
    const t = now()
    const node: MsgNode = {
      id: nanoid(),
      conversationId: thread.conversationId,
      threadId,
      parentId: thread.headNodeId,
      role,
      content,
      status: 'complete',
      createdAt: t,
      ...extra,
    }
    await db.nodes.add(node)
    await db.threads.update(threadId, { headNodeId: node.id, updatedAt: t })
    await db.conversations.update(thread.conversationId, { updatedAt: t })
    return node
  })
}

/**
 * Start a branch off `parentThreadId`. The branch hangs off the parent's current head,
 * so it inherits the entire current thread as context without copying any message.
 */
export async function createBranch(
  parentThreadId: string,
  anchor?: TextSpan,
  opts: { unread?: boolean } = {},
): Promise<Thread> {
  const parent = await db.threads.get(parentThreadId)
  if (!parent) throw new Error(`Thread ${parentThreadId} not found`)
  const t = now()
  const thread: Thread = {
    id: nanoid(),
    conversationId: parent.conversationId,
    parentThreadId,
    headNodeId: parent.headNodeId,
    forkNodeId: parent.headNodeId,
    anchor,
    title: anchor ? truncate(anchor.text, 40) : 'Branch',
    titled: false,
    ...(opts.unread ? { unread: true } : {}),
    createdAt: t,
    updatedAt: t,
  }
  await db.threads.add(thread)
  return thread
}

export interface DeletePlan {
  threadIds: string[]
  nodeIds: string[]
  bookmarkIds: string[]
}

/** What deleting a branch would remove: it, its sub-branches, their messages and bookmarks. */
export async function planThreadDelete(threadId: string): Promise<DeletePlan> {
  const thread = await db.threads.get(threadId)
  if (!thread) return { threadIds: [], nodeIds: [], bookmarkIds: [] }
  const threads = await db.threads.where('conversationId').equals(thread.conversationId).toArray()
  const threadIds = threadSubtree(threads, threadId).map((t) => t.id)
  const nodeIds = (await db.nodes.where('threadId').anyOf(threadIds).primaryKeys()) as string[]
  // Bookmarks on the branch's own messages, plus ones made while viewing it (on inherited messages).
  const onNodes = (await db.bookmarks.where('nodeId').anyOf(nodeIds).primaryKeys()) as string[]
  const madeHere = (await db.bookmarks.where('threadId').anyOf(threadIds).primaryKeys()) as string[]
  return { threadIds, nodeIds, bookmarkIds: [...new Set([...onNodes, ...madeHere])] }
}

/** Everything a branch delete removed, so it can be put back. */
export interface BranchSnapshot {
  threads: Thread[]
  nodes: MsgNode[]
  bookmarks: Bookmark[]
}

/** Delete a branch and its sub-branches, returning a snapshot for undo. */
export async function deleteThread(threadId: string): Promise<BranchSnapshot | null> {
  const thread = await db.threads.get(threadId)
  if (!thread) return null
  if (!thread.parentThreadId) {
    await deleteConversation(thread.conversationId)
    return null
  }
  const plan = await planThreadDelete(threadId)
  return db.transaction('rw', db.threads, db.nodes, db.bookmarks, async () => {
    const snapshot: BranchSnapshot = {
      threads: (await db.threads.bulkGet(plan.threadIds)).filter((t): t is Thread => !!t),
      nodes: (await db.nodes.bulkGet(plan.nodeIds)).filter((n): n is MsgNode => !!n),
      bookmarks: (await db.bookmarks.bulkGet(plan.bookmarkIds)).filter((b): b is Bookmark => !!b),
    }
    await db.bookmarks.bulkDelete(plan.bookmarkIds)
    await db.nodes.bulkDelete(plan.nodeIds)
    await db.threads.bulkDelete(plan.threadIds)
    return snapshot
  })
}

/** Undo a branch delete. Interrupted replies come back as "stopped" so they can be retried. */
export async function restoreSnapshot(snapshot: BranchSnapshot): Promise<void> {
  await db.transaction('rw', db.threads, db.nodes, db.bookmarks, async () => {
    await db.threads.bulkPut(snapshot.threads)
    await db.nodes.bulkPut(
      snapshot.nodes.map((n) => (n.status === 'streaming' ? { ...n, status: 'stopped' as const } : n)),
    )
    await db.bookmarks.bulkPut(snapshot.bookmarks)
  })
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await db.transaction('rw', [db.conversations, db.threads, db.nodes, db.bookmarks], async () => {
    await db.bookmarks.where('conversationId').equals(conversationId).delete()
    await db.nodes.where('conversationId').equals(conversationId).delete()
    await db.threads.where('conversationId').equals(conversationId).delete()
    await db.conversations.delete(conversationId)
  })
}

export async function addBookmark(b: Omit<Bookmark, 'id' | 'createdAt'>): Promise<Bookmark> {
  const bookmark: Bookmark = { ...b, id: nanoid(), createdAt: now() }
  await db.bookmarks.add(bookmark)
  return bookmark
}

/** Streams interrupted by a reload or closed tab can never finish; mark them stopped. */
export async function recoverInterruptedStreams(): Promise<void> {
  await db.nodes.where('status').equals('streaming').modify({ status: 'stopped' })
}

export function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat
}
