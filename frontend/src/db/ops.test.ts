import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addBookmark,
  appendMessage,
  createBranch,
  createConversation,
  deleteConversation,
  deleteThread,
  restoreSnapshot,
} from './ops'
import { indexNodes, pathTo, threadAncestry, toModelContent } from './tree'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

async function seed() {
  const conv = await createConversation()
  const main = conv.mainThreadId
  await appendMessage(main, 'user', 'q1')
  const a1 = await appendMessage(main, 'assistant', 'a1 with a key insight')
  await appendMessage(main, 'user', 'q2')
  const a2 = await appendMessage(main, 'assistant', 'a2')
  return { conv, main, a1, a2 }
}

async function path(conversationId: string, threadId: string) {
  const nodes = await db.nodes.where('conversationId').equals(conversationId).toArray()
  const thread = await db.threads.get(threadId)
  return pathTo(indexNodes(nodes), thread!.headNodeId).map((n) => n.content)
}

describe('conversation tree', () => {
  it('builds a linear thread', async () => {
    const { conv, main } = await seed()
    expect(await path(conv.id, main)).toEqual(['q1', 'a1 with a key insight', 'q2', 'a2'])
  })

  it('branch inherits the entire current thread without copying nodes', async () => {
    const { conv, main, a1, a2 } = await seed()
    const anchor = { sourceNodeId: a1.id, text: 'key insight', start: 10, end: 21 }
    const branch = await createBranch(main, anchor)
    expect(branch.forkNodeId).toBe(a2.id)
    await appendMessage(branch.id, 'user', 'what is it?', { anchor })
    await appendMessage(branch.id, 'assistant', 'explained')

    expect(await path(conv.id, branch.id)).toEqual([
      'q1',
      'a1 with a key insight',
      'q2',
      'a2',
      'what is it?',
      'explained',
    ])
    // main thread is untouched and can keep going linearly
    await appendMessage(main, 'user', 'q3')
    expect(await path(conv.id, main)).toEqual(['q1', 'a1 with a key insight', 'q2', 'a2', 'q3'])
    expect(await db.nodes.count()).toBe(7)
  })

  it('formats branch questions with the quoted snippet for the model', async () => {
    const { main, a1 } = await seed()
    const anchor = { sourceNodeId: a1.id, text: 'line one\nline two', start: 0, end: 17 }
    const branch = await createBranch(main, anchor)
    const q = await appendMessage(branch.id, 'user', 'why?', { anchor })
    expect(toModelContent(q)).toBe(
      'Regarding this excerpt from earlier in our conversation:\n> line one\n> line two\n\nwhy?',
    )
  })

  it('deleting a branch cascades to sub-branches and their bookmarks only', async () => {
    const { conv, main, a1 } = await seed()
    const b1 = await createBranch(main)
    const b1q = await appendMessage(b1.id, 'user', 'b1q')
    const b2 = await createBranch(b1.id)
    await appendMessage(b2.id, 'user', 'b2q')
    const span = { text: 'x', start: 0, end: 1, prefix: '', suffix: '', color: 'yellow' as const, note: '' }
    await addBookmark({ ...span, conversationId: conv.id, threadId: b1.id, nodeId: b1q.id })
    await addBookmark({ ...span, conversationId: conv.id, threadId: main, nodeId: a1.id })

    await deleteThread(b1.id)
    expect(await db.threads.count()).toBe(1)
    expect(await db.nodes.count()).toBe(4)
    const left = await db.bookmarks.toArray()
    expect(left.map((b) => b.nodeId)).toEqual([a1.id])
  })

  it('restoring a deleted branch puts back exactly what was removed', async () => {
    const { conv, main, a1 } = await seed()
    const b1 = await createBranch(main)
    const q = await appendMessage(b1.id, 'user', 'b1q')
    const b2 = await createBranch(b1.id)
    await appendMessage(b2.id, 'user', 'b2q')
    const span = { text: 'x', start: 0, end: 1, prefix: '', suffix: '', color: 'yellow' as const, note: '' }
    await addBookmark({ ...span, conversationId: conv.id, threadId: b1.id, nodeId: q.id })
    // made while viewing the branch, on a message it inherited from main
    await addBookmark({ ...span, conversationId: conv.id, threadId: b1.id, nodeId: a1.id })
    const before = await Promise.all(db.tables.map((t) => t.count()))

    const snapshot = await deleteThread(b1.id)
    expect(snapshot?.threads).toHaveLength(2)
    expect(snapshot?.bookmarks).toHaveLength(2)
    expect(await db.bookmarks.count()).toBe(0)

    await restoreSnapshot(snapshot!)
    expect(await Promise.all(db.tables.map((t) => t.count()))).toEqual(before)
    expect(await path(conv.id, b1.id)).toEqual(['q1', 'a1 with a key insight', 'q2', 'a2', 'b1q'])
  })

  it('deleting a conversation removes everything in it', async () => {
    const { conv, main } = await seed()
    await createBranch(main)
    await deleteConversation(conv.id)
    for (const t of db.tables) expect(await t.count()).toBe(0)
  })

  it('computes thread ancestry for breadcrumbs', async () => {
    const { main } = await seed()
    const b1 = await createBranch(main)
    const b2 = await createBranch(b1.id)
    const threads = await db.threads.toArray()
    expect(threadAncestry(threads, b2.id).map((t) => t.id)).toEqual([main, b1.id, b2.id])
  })
})
