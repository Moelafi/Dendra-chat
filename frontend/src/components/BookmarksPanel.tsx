import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { FiBookmark, FiEdit2, FiMessageSquare, FiSearch, FiTrash2 } from 'react-icons/fi'
import { LuGitBranch } from 'react-icons/lu'
import { useDebounceValue, useLocalStorage } from 'usehooks-ts'
import { db } from '../db/db'
import { BOOKMARK_COLORS, type Bookmark, type BookmarkColor, type MsgNode, type Thread } from '../db/types'
import { useActiveConversationId } from '../hooks/data'
import { openThread } from '../store/ui'
import { colorClass } from './colors'

type Tab = 'bookmarks' | 'messages'

/** Right panel: bookmarks and your own messages in the current chat, each a jump target. */
export function BookmarksPanel() {
  const conversationId = useActiveConversationId()
  const [tab, setTab] = useLocalStorage<Tab>('bc-right-tab', 'bookmarks')
  const [query, setQuery] = useState('')
  const [debounced] = useDebounceValue(query, 200)
  const [colors, setColors] = useState<BookmarkColor[]>([])

  const data = useLiveQuery(async () => {
    if (!conversationId) return { bookmarks: [], messages: [], threads: new Map<string, Thread>() }
    const [bookmarks, nodes, threads] = await Promise.all([
      db.bookmarks.where('conversationId').equals(conversationId).toArray(),
      db.nodes.where('conversationId').equals(conversationId).toArray(),
      db.threads.where('conversationId').equals(conversationId).toArray(),
    ])
    return {
      bookmarks: bookmarks.sort((a, b) => b.createdAt - a.createdAt),
      // Conversation order, across the main thread and every branch.
      messages: nodes.filter((n) => n.role === 'user').sort((a, b) => a.createdAt - b.createdAt),
      threads: new Map(threads.map((t) => [t.id, t])),
    }
  }, [conversationId])

  const q = debounced.trim().toLowerCase()
  const bookmarks = (data?.bookmarks ?? []).filter(
    (b) =>
      (!colors.length || colors.includes(b.color)) &&
      (!q || b.text.toLowerCase().includes(q) || b.note.toLowerCase().includes(q)),
  )
  const messages = (data?.messages ?? []).filter((n) => !q || n.content.toLowerCase().includes(q))
  /** Branch title for items inside a branch; null on the main thread. */
  const branchTitle = (threadId: string) => {
    const t = data?.threads.get(threadId)
    return t?.parentThreadId ? t.title : null
  }

  const tabs = [
    { id: 'bookmarks', label: 'Bookmarks', icon: FiBookmark },
    { id: 'messages', label: 'Messages', icon: FiMessageSquare },
  ] as const

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center px-3">
        <div className="flex rounded-full border border-line p-0.5 text-xs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition ${tab === id ? 'bg-raised text-fg' : 'text-faint hover:text-fg'}`}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3 px-3 pb-3">
        <label className="flex items-center gap-2 rounded-full border border-line px-3.5 py-2 transition focus-within:border-line-strong">
          <FiSearch className="text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'bookmarks' ? 'Search bookmarks' : 'Search your messages'}
            className="w-full bg-transparent text-sm text-fg placeholder:text-faint focus:outline-none"
          />
        </label>
        {tab === 'bookmarks' && (
          <div className="flex items-center gap-1 px-1">
            {BOOKMARK_COLORS.map((c) => {
              const on = colors.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  title={`Filter: ${colorClass[c].label}`}
                  onClick={() => setColors(on ? colors.filter((x) => x !== c) : [...colors, c])}
                  className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] transition ${
                    on ? 'bg-raised text-fg' : 'text-faint hover:bg-surface'
                  }`}
                >
                  <span className={`size-2 rounded-full ${colorClass[c].dot}`} />
                  {on && colorClass[c].label}
                </button>
              )
            })}
            {colors.length > 0 && (
              <button
                type="button"
                onClick={() => setColors([])}
                className="ml-auto text-[11px] text-faint hover:text-fg"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {tab === 'bookmarks' ? (
          <>
            {bookmarks.length === 0 && (
              <Empty>
                {data?.bookmarks.length
                  ? 'No bookmarks match.'
                  : 'Highlight text in any message and choose Bookmark to save it here.'}
              </Empty>
            )}
            {bookmarks.map((b) => (
              <BookmarkItem key={b.id} bookmark={b} threadTitle={branchTitle(b.threadId)} />
            ))}
          </>
        ) : (
          <>
            {messages.length === 0 && (
              <Empty>
                {data?.messages.length ? 'No messages match.' : 'Messages you send in this chat show up here.'}
              </Empty>
            )}
            <div className="space-y-2 px-1">
              {messages.map((n) => (
                <MessageItem key={n.id} node={n} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-xs leading-relaxed text-faint">{children}</p>
}

function BranchLabel({ title }: { title: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <LuGitBranch className="shrink-0" />
      <span className="truncate">{title}</span>
    </span>
  )
}

/** Styled like the user's chat bubble in the conversation. */
function MessageItem({ node }: { node: MsgNode }) {
  return (
    <button
      type="button"
      onClick={() => openThread(node.threadId, { nodeId: node.id })}
      className="block w-full rounded-2xl bg-surface px-3.5 py-2.5 text-left transition hover:bg-raised"
    >
      <div className="line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg">
        {node.content}
      </div>
    </button>
  )
}

function BookmarkItem({ bookmark: b, threadTitle }: { bookmark: Bookmark; threadTitle: string | null }) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(b.note)
  return (
    <div
      className="group cursor-pointer rounded-xl px-3 py-2.5 transition hover:bg-surface"
      onClick={() => !editing && openThread(b.threadId, { nodeId: b.nodeId, start: b.start, end: b.end })}
    >
      <div className="flex gap-2.5">
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${colorClass[b.color].dot}`} />
        <div className="min-w-0 flex-1">
          {b.note && !editing && <div className="mb-0.5 text-[13px] text-fg">{b.note}</div>}
          <div className="line-clamp-3 text-xs leading-relaxed text-muted">{b.text}</div>
          {editing && (
            <input
              autoFocus
              value={note}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                setEditing(false)
                void db.bookmarks.update(b.id, { note: note.trim() })
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              placeholder="Note"
              className="mt-1.5 w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg focus:outline-none"
            />
          )}
          <div className="mt-1.5 flex min-h-5 items-center gap-1 text-[11px] text-faint">
            {threadTitle && <BranchLabel title={threadTitle} />}
            <div className="ml-auto hidden items-center gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
              {BOOKMARK_COLORS.filter((c) => c !== b.color).map((c) => (
                <button
                  key={c}
                  type="button"
                  title={colorClass[c].label}
                  onClick={() => db.bookmarks.update(b.id, { color: c })}
                  className="p-0.5"
                >
                  <span className={`block size-2 rounded-full ${colorClass[c].dot} opacity-60 hover:opacity-100`} />
                </button>
              ))}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded p-1 hover:text-fg"
                title="Edit note"
              >
                <FiEdit2 />
              </button>
              <button
                type="button"
                onClick={() => db.bookmarks.delete(b.id)}
                className="rounded p-1 hover:text-red-300"
                title="Delete"
              >
                <FiTrash2 />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
