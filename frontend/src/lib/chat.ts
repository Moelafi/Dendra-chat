import { fetchTitle, streamChat, type ApiMessage } from '../api/client'
import { db } from '../db/db'
import { appendMessage, createConversation, truncate } from '../db/ops'
import { indexNodes, pathTo, toModelContent } from '../db/tree'
import type { MsgNode, TextSpan } from '../db/types'
import { useUI } from '../store/ui'

const controllers = new Map<string, AbortController>()

async function contextFor(conversationId: string, headId: string): Promise<ApiMessage[]> {
  const nodes = await db.nodes.where('conversationId').equals(conversationId).toArray()
  return pathTo(indexNodes(nodes), headId)
    .filter((n) => n.content.trim() || n.anchor)
    .map((n) => ({ role: n.role, content: toModelContent(n) }))
}

/** Stream a reply into an existing assistant node whose parent is the last user message. */
async function runAssistant(node: MsgNode, model: string): Promise<boolean> {
  const messages = await contextFor(node.conversationId, node.parentId!)
  const controller = new AbortController()
  controllers.set(node.id, controller)
  let content = ''
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    flushTimer = null
    void db.nodes.update(node.id, { content })
  }
  try {
    await streamChat(
      model,
      messages,
      (delta) => {
        content += delta
        flushTimer ??= setTimeout(flush, 50)
      },
      controller.signal,
      useUI.getState().verbosity,
    )
    if (flushTimer) clearTimeout(flushTimer)
    await db.nodes.update(node.id, { content, status: 'complete', error: undefined })
    return true
  } catch (err) {
    if (flushTimer) clearTimeout(flushTimer)
    const aborted = controller.signal.aborted
    await db.nodes.update(node.id, {
      content,
      status: aborted ? 'stopped' : 'error',
      error: aborted ? undefined : (err as Error).message,
    })
    return false
  } finally {
    controllers.delete(node.id)
  }
}

/** Send a message at the end of a thread. Creates a conversation when `threadId` is null. */
export async function sendMessage(
  threadId: string | null,
  text: string,
  model: string,
  anchor?: TextSpan,
  onStarted?: (threadId: string) => void,
): Promise<void> {
  if (!threadId) {
    const conv = await createConversation(truncate(text, 40))
    threadId = conv.mainThreadId
  }
  await appendMessage(threadId, 'user', text, { anchor })
  const assistant = await appendMessage(threadId, 'assistant', '', { status: 'streaming', model })
  onStarted?.(threadId)
  const ok = await runAssistant(assistant, model)
  if (ok) void autoTitle(threadId)
}

export function isStreaming(nodeId: string): boolean {
  return controllers.has(nodeId)
}

export async function retry(nodeId: string, model: string): Promise<void> {
  const node = await db.nodes.get(nodeId)
  if (!node || node.role !== 'assistant' || controllers.has(nodeId)) return
  await db.nodes.update(nodeId, { content: '', status: 'streaming', error: undefined, model })
  const ok = await runAssistant({ ...node, model }, model)
  if (ok) void autoTitle(node.threadId)
}

export function stop(nodeId: string): void {
  controllers.get(nodeId)?.abort()
}

/** Title the conversation (main thread) or the branch after its first successful exchange. */
async function autoTitle(threadId: string): Promise<void> {
  const thread = await db.threads.get(threadId)
  if (!thread) return
  const nodes = await db.nodes.where('threadId').equals(threadId).sortBy('createdAt')
  const exchange = nodes.slice(0, 2).map((n) => ({ role: n.role, content: toModelContent(n) }))
  if (thread.parentThreadId === null) {
    const conv = await db.conversations.get(thread.conversationId)
    if (!conv || conv.titled) return
    const title = await fetchTitle(exchange, useUI.getState().model)
    if (title) await db.conversations.update(conv.id, { title, titled: true })
  } else if (!thread.titled) {
    const title = await fetchTitle(exchange, useUI.getState().model)
    if (title) await db.threads.update(thread.id, { title, titled: true })
  }
}
