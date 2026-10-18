import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { FiChevronRight, FiEdit2, FiMessageSquare, FiPlus, FiSidebar, FiTrash2 } from 'react-icons/fi'
import { LuGitBranch } from 'react-icons/lu'
import { db } from '../db/db'
import { deleteConversation } from '../db/ops'
import { threadSubtree } from '../db/tree'
import type { Conversation, Thread } from '../db/types'
import { closeBranch } from '../lib/branches'
import { AccountMenu } from './AccountMenu'
import { Logo } from './Logo'
import { navigate, useUI } from '../store/ui'

export function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const conversations = useLiveQuery(() => db.conversations.orderBy('updatedAt').reverse().toArray(), [])
  // Oldest first, so the newest branch sits at the bottom of each list.
  const threads = useLiveQuery(async () => (await db.threads.toArray()).sort((a, b) => a.createdAt - b.createdAt), [])

  return (
    <aside className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-4">
        <Logo className="size-5 shrink-0" />
        <span className="flex-1 font-brand text-lg font-semibold text-fg">Dendra</span>
        <button
          type="button"
          onClick={onCollapse}
          className="rounded-lg p-2 text-faint transition hover:bg-surface hover:text-fg"
          title="Hide sidebar"
        >
          <FiSidebar />
        </button>
      </div>
      <div className="px-2 pb-4">
        <button
          type="button"
          onClick={() => navigate(null)}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-fg transition hover:bg-surface"
        >
          <FiPlus className="text-base" /> New chat
        </button>
      </div>
      <div className="px-5 pb-2 text-[13px] text-faint">Conversations</div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-4">
        {conversations?.length === 0 && <p className="px-3 py-2 text-sm text-faint">No conversations yet.</p>}
        {conversations?.map((c) => (
          <ConversationItem
            key={c.id}
            conversation={c}
            threads={(threads ?? []).filter((t) => t.conversationId === c.id)}
          />
        ))}
      </div>
      <AccountMenu />
    </aside>
  )
}

function ConversationItem({ conversation, threads }: { conversation: Conversation; threads: Thread[] }) {
  const currentThreadId = useUI((s) => s.currentThreadId)
  const active = threads.some((t) => t.id === currentThreadId)
  const branches = threads.filter((t) => t.parentThreadId === conversation.mainThreadId)
  const [open, setOpen] = useState(true)

  return (
    <div className="mb-0.5">
      <Row
        active={currentThreadId === conversation.mainThreadId}
        highlighted={active}
        icon={<FiMessageSquare />}
        title={conversation.title}
        onClick={() => navigate(conversation.mainThreadId)}
        toggle={branches.length ? { open, onToggle: () => setOpen(!open) } : undefined}
        hiddenUnread={!open && threads.some((t) => t.unread)}
        onRename={(title) => db.conversations.update(conversation.id, { title, titled: true })}
        onDelete={async () => {
          if (!confirm(`Delete "${conversation.title}" and all ${threads.length - 1} branches?`)) return
          if (active) navigate(null, undefined, { replace: true })
          await deleteConversation(conversation.id)
        }}
      />
      {open &&
        branches.map((b) => (
          <BranchItem key={b.id} thread={b} threads={threads} depth={1} activeId={currentThreadId} />
        ))}
    </div>
  )
}

function BranchItem({
  thread,
  threads,
  depth,
  activeId,
}: {
  thread: Thread
  threads: Thread[]
  depth: number
  activeId: string | null
}) {
  const children = threads.filter((t) => t.parentThreadId === thread.id)
  const [open, setOpen] = useState(true)
  return (
    <>
      <Row
        depth={depth}
        active={activeId === thread.id}
        icon={<LuGitBranch className="text-faint" />}
        title={thread.title}
        onClick={() => navigate(thread.id)}
        unread={!!thread.unread}
        toggle={children.length ? { open, onToggle: () => setOpen(!open) } : undefined}
        hiddenUnread={!open && threadSubtree(threads, thread.id).some((t) => t.id !== thread.id && t.unread)}
        onRename={(title) => db.threads.update(thread.id, { title, titled: true })}
        onDelete={() => closeBranch(thread.id)}
      />
      {open &&
        children.map((c) => (
          <BranchItem key={c.id} thread={c} threads={threads} depth={depth + 1} activeId={activeId} />
        ))}
    </>
  )
}

interface RowProps {
  depth?: number
  active: boolean
  highlighted?: boolean
  icon: React.ReactNode
  title: string
  onClick: () => void
  toggle?: { open: boolean; onToggle: () => void }
  /** Never opened: bright title and a white dot until visited. */
  unread?: boolean
  /** Collapsed, with an unread branch hidden inside. */
  hiddenUnread?: boolean
  onRename: (title: string) => void
  onDelete: () => void
}

function Row({
  depth = 0,
  active,
  highlighted,
  icon,
  title,
  onClick,
  toggle,
  unread,
  hiddenUnread,
  onRename,
  onDelete,
}: RowProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  return (
    <div
      className={`group relative flex items-center gap-1.5 rounded-xl py-2 pr-1.5 text-sm transition ${
        active
          ? 'bg-surface text-fg'
          : highlighted || unread
            ? 'text-fg hover:bg-surface'
            : 'text-muted hover:bg-surface hover:text-fg'
      }`}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      {depth > 0 && <span className="absolute top-0 bottom-0 w-px bg-line" style={{ left: depth * 14 - 2 }} />}
      <button
        type="button"
        onClick={toggle?.onToggle}
        className={`shrink-0 rounded p-0.5 text-faint hover:text-fg ${toggle ? '' : 'invisible'}`}
      >
        <FiChevronRight className={`text-xs transition ${toggle?.open ? 'rotate-90' : ''}`} />
      </button>
      <span className="shrink-0 text-muted">{icon}</span>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            setEditing(false)
            if (value.trim() && value !== title) onRename(value.trim())
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setValue(title)
              setEditing(false)
            }
          }}
          className="min-w-0 flex-1 rounded-md bg-raised px-1.5 text-sm text-fg focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={onClick}
          onDoubleClick={() => setEditing(true)}
          className="min-w-0 flex-1 truncate text-left"
        >
          {title}
        </button>
      )}
      {!editing && (unread || hiddenUnread) && (
        <span
          className="mr-1.5 size-2 shrink-0 rounded-full bg-fg group-hover:hidden"
          title={unread ? 'New: not opened yet' : 'Has a new branch'}
        />
      )}
      {!editing && (
        <div className="hidden shrink-0 items-center group-hover:flex">
          <button
            type="button"
            onClick={() => {
              setValue(title)
              setEditing(true)
            }}
            className="rounded-md p-1 text-faint hover:text-fg"
            title="Rename"
          >
            <FiEdit2 className="text-xs" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1 text-faint hover:text-red-300"
            title="Delete"
          >
            <FiTrash2 className="text-xs" />
          </button>
        </div>
      )}
    </div>
  )
}
