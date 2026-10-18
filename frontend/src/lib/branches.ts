import { db } from '../db/db'
import { deleteThread, planThreadDelete, restoreSnapshot, truncate } from '../db/ops'
import { navigate, useUI } from '../store/ui'
import { stop } from './chat'

/**
 * Close a branch: stop its replies, delete it with its sub-branches, messages and
 * bookmarks, step back to where it started if we're inside it, and offer Undo.
 */
export async function closeBranch(threadId: string): Promise<void> {
  const thread = await db.threads.get(threadId)
  if (!thread?.parentThreadId) return
  const plan = await planThreadDelete(threadId)
  for (const nodeId of plan.nodeIds) stop(nodeId)

  const current = useUI.getState().currentThreadId
  const wasInside = !!current && plan.threadIds.includes(current)
  if (wasInside) {
    const at = thread.anchor
      ? { nodeId: thread.anchor.sourceNodeId, start: thread.anchor.start, end: thread.anchor.end }
      : thread.forkNodeId
        ? { nodeId: thread.forkNodeId }
        : undefined
    navigate(thread.parentThreadId, at, { replace: true })
  }

  const snapshot = await deleteThread(threadId)
  if (!snapshot) return
  const subs = snapshot.threads.length - 1
  const parts = [
    subs ? `${subs} sub-branch${subs === 1 ? '' : 'es'}` : '',
    snapshot.bookmarks.length ? `${snapshot.bookmarks.length} bookmark${snapshot.bookmarks.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  useUI.getState().showNotice({
    icon: 'trash',
    text: `Deleted “${truncate(thread.title, 36)}”${parts.length ? ` with ${parts.join(' and ')}` : ''}`,
    duration: 10000,
    action: {
      label: 'Undo',
      run: async () => {
        await restoreSnapshot(snapshot)
        if (wasInside) navigate(threadId)
      },
    },
  })
}
