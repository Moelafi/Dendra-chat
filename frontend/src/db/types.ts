export type Role = 'user' | 'assistant'
export type NodeStatus = 'complete' | 'streaming' | 'error' | 'stopped'

/** A span of text inside one message, addressed by character offsets into its rendered text. */
export interface TextSpan {
  sourceNodeId: string
  text: string
  start: number
  end: number
}

/**
 * One message. Stored exactly once; the conversation is a tree linked by `parentId`.
 * The context for any message is simply the path from the root down to it.
 */
export interface MsgNode {
  id: string
  conversationId: string
  /** Thread the message was written in (used for colouring and navigation). */
  threadId: string
  parentId: string | null
  role: Role
  content: string
  model?: string
  status: NodeStatus
  error?: string
  /** Set on the first user message of a branch created from a highlighted snippet. */
  anchor?: TextSpan
  createdAt: number
}

/** A named path through the tree. The main thread has no parent thread. */
export interface Thread {
  id: string
  conversationId: string
  parentThreadId: string | null
  /** Last message of the thread (null for an empty main thread). */
  headNodeId: string | null
  /** Node the branch hangs off (the parent thread's head at branch time). */
  forkNodeId: string | null
  anchor?: TextSpan
  title: string
  /** True once the user renamed it or an auto title was generated. */
  titled: boolean
  /** Created in the background and not opened yet (missing = read). */
  unread?: boolean
  createdAt: number
  updatedAt: number
}

export interface Conversation {
  id: string
  title: string
  titled: boolean
  mainThreadId: string
  createdAt: number
  updatedAt: number
}

export const BOOKMARK_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const
export type BookmarkColor = (typeof BOOKMARK_COLORS)[number]

export interface Bookmark {
  id: string
  conversationId: string
  /** Thread the user was viewing when they bookmarked (where "jump to" opens). */
  threadId: string
  nodeId: string
  text: string
  start: number
  end: number
  prefix: string
  suffix: string
  color: BookmarkColor
  note: string
  createdAt: number
}
