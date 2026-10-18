import Dexie, { type EntityTable } from 'dexie'
import type { Bookmark, Conversation, MsgNode, Thread } from './types'

// Storage names keep the app's old name (BranchChat) so existing data survives the rename.
export const db = new Dexie('branchchat') as Dexie & {
  conversations: EntityTable<Conversation, 'id'>
  threads: EntityTable<Thread, 'id'>
  nodes: EntityTable<MsgNode, 'id'>
  bookmarks: EntityTable<Bookmark, 'id'>
}

db.version(1).stores({
  conversations: 'id, updatedAt',
  threads: 'id, conversationId, parentThreadId',
  nodes: 'id, conversationId, threadId, parentId, status',
  bookmarks: 'id, conversationId, nodeId, threadId, color, createdAt',
})
