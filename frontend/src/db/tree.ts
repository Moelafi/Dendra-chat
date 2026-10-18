import type { MsgNode, Thread } from './types'

export type NodeIndex = Map<string, MsgNode>

export function indexNodes(nodes: MsgNode[]): NodeIndex {
  return new Map(nodes.map((n) => [n.id, n]))
}

/** Root-first list of messages from the tree root down to `headId`. */
export function pathTo(index: NodeIndex, headId: string | null): MsgNode[] {
  const path: MsgNode[] = []
  const seen = new Set<string>()
  let cur = headId ? index.get(headId) : undefined
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    path.push(cur)
    cur = cur.parentId ? index.get(cur.parentId) : undefined
  }
  return path.reverse()
}

/** `threadId` plus every thread branched (directly or transitively) from it. */
export function threadSubtree(threads: Thread[], threadId: string): Thread[] {
  const out: Thread[] = []
  const queue = [threadId]
  while (queue.length) {
    const id = queue.shift()!
    const t = threads.find((x) => x.id === id)
    if (!t) continue
    out.push(t)
    for (const c of threads) if (c.parentThreadId === id) queue.push(c.id)
  }
  return out
}

/** Root-first chain of threads: main › branch › sub-branch. */
export function threadAncestry(threads: Thread[], threadId: string): Thread[] {
  const byId = new Map(threads.map((t) => [t.id, t]))
  const chain: Thread[] = []
  let cur = byId.get(threadId)
  while (cur && !chain.includes(cur)) {
    chain.push(cur)
    cur = cur.parentThreadId ? byId.get(cur.parentThreadId) : undefined
  }
  return chain.reverse()
}

export const ANCHOR_INTRO = 'Regarding this excerpt from earlier in our conversation:'

/** What the model actually sees for a message (branch questions get the quoted snippet). */
export function toModelContent(node: MsgNode): string {
  if (!node.anchor) return node.content
  const quoted = node.anchor.text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n')
  return `${ANCHOR_INTRO}\n${quoted}\n\n${node.content}`
}
