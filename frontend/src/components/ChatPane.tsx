import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LuLayers, LuGitBranch } from 'react-icons/lu'
import { useResizeObserver } from 'usehooks-ts'
import type { Bookmark, MsgNode, Thread } from '../db/types'
import { useThreadView } from '../hooks/data'
import { rangeFromOffsets } from '../lib/textOffsets'
import { isFreshFocus, useUI } from '../store/ui'
import { Composer } from './Composer'
import { EmptyState } from './EmptyState'
import { Message } from './Message'
import { ThreadHeader } from './ThreadHeader'

const EMPTY: never[] = []

/** Gap kept above a just-sent message once it's scrolled to the top of the pane. */
const PIN_GAP = 16
/** Bottom padding of the message column (py-6). */
const COLUMN_PAD = 24

/** Scroll position per thread for this session, restored on Back like a browser. */
const scrollMemory = new Map<string, { top: number; atBottom: boolean }>()

export function ChatPane({ threadId }: { threadId: string | null }) {
  const paneId = useId()
  const view = useThreadView(threadId)
  const { thread, path, inheritedCount, threads, bookmarks, busyThreadIds } = view
  const focus = useUI((s) => s.focus)
  const scrollRef = useRef<HTMLDivElement>(null)
  const turnRef = useRef<HTMLDivElement>(null)
  const { height: viewportHeight = 0 } = useResizeObserver({ ref: scrollRef as React.RefObject<HTMLElement> })
  const [showInherited, setShowInherited] = useState(false)
  /** The user message just sent here: its turn fills the viewport so the reply streams in without scrolling. */
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  const bookmarksByNode = useMemo(() => groupBy(bookmarks, (b) => b.nodeId), [bookmarks])
  const branchesByNode = useMemo(
    () =>
      groupBy(
        threads.filter((t) => t.anchor),
        (t) => t.anchor!.sourceNodeId,
      ),
    [threads],
  )
  const streamingNodeId = path.at(-1)?.status === 'streaming' ? path.at(-1)!.id : null

  const handledFocus = useRef(0)

  useEffect(() => setShowInherited(false), [threadId])

  // On open, restore where the user was in this thread (or start at the bottom). Never follow the stream.
  const restored = useRef(false)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (restored.current || !el || !path.length) return
    restored.current = true
    const saved = threadId ? scrollMemory.get(threadId) : undefined
    el.scrollTop = saved && !saved.atBottom ? saved.top : el.scrollHeight
  }, [path, threadId])

  // A message just sent in this thread becomes the pinned turn.
  const lastUser = path.findLast((n) => n.role === 'user' && n.threadId === threadId)
  const lastUserId = lastUser?.id
  const lastUserAt = lastUser?.createdAt ?? 0
  useEffect(() => {
    if (lastUserId && Date.now() - lastUserAt < 3000) setPinnedId(lastUserId)
  }, [lastUserId, lastUserAt])

  // Scroll the pinned turn to the top once; its min-height leaves room for the reply below.
  useLayoutEffect(() => {
    const container = scrollRef.current
    const turn = turnRef.current
    if (!pinnedId || !container || !turn) return
    const top = turn.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    container.scrollTo({ top: top - PIN_GAP, behavior: 'smooth' })
  }, [pinnedId])

  // Jump requests (bookmarks, graph, anchor chips) scroll the message into view.
  useEffect(() => {
    if (!isFreshFocus(focus) || handledFocus.current === focus.nonce) return
    const idx = path.findIndex((n) => n.id === focus.nodeId)
    if (idx === -1) return
    if (idx < inheritedCount && !showInherited) {
      setShowInherited(true)
      return
    }
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-node-id="${focus.nodeId}"]`)
    if (!el) return
    handledFocus.current = focus.nonce
    // Centre the exact span when we have one (long messages), else the whole message.
    const content = el.querySelector('[data-msg-content]')
    const span = content && focus.start !== undefined ? rangeFromOffsets(content, focus.start, focus.end!) : null
    const container = scrollRef.current!
    if (span) {
      const r = span.getBoundingClientRect()
      const c = container.getBoundingClientRect()
      container.scrollBy({ top: r.top - c.top - c.height / 2 + r.height / 2, behavior: 'smooth' })
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.remove('flash-ring')
      void el.offsetWidth
      el.classList.add('flash-ring')
    }
  }, [focus, path, inheritedCount, showInherited])

  if (!threadId)
    return (
      <div className="flex h-full min-w-0 flex-col">
        <ThreadHeader thread={undefined} threads={EMPTY} />
        <div className="min-h-0 flex-1">
          <EmptyState />
        </div>
      </div>
    )

  const visible = showInherited ? path : path.slice(inheritedCount)
  const offset = showInherited ? 0 : inheritedCount
  const pinIndex = pinnedId ? visible.findIndex((n) => n.id === pinnedId) : -1

  const renderNode = (node: MsgNode, absolute: number) => (
    <Fragment key={node.id}>
      {absolute === inheritedCount && inheritedCount > 0 && <ForkDivider thread={thread} />}
      <Message
        node={node}
        viewThreadId={threadId}
        paneId={paneId}
        bookmarks={bookmarksByNode.get(node.id) ?? (EMPTY as Bookmark[])}
        branches={branchesByNode.get(node.id) ?? (EMPTY as Thread[])}
        busyThreadIds={busyThreadIds}
        focus={focus}
        dimmed={absolute < inheritedCount}
      />
    </Fragment>
  )

  return (
    <div className="flex h-full min-w-0 flex-col">
      <ThreadHeader thread={thread} threads={threads} />
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          scrollMemory.set(threadId, {
            top: el.scrollTop,
            atBottom: el.scrollHeight - el.scrollTop - el.clientHeight < 80,
          })
        }}
        className="scrollbar-thin flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl py-6">
          {inheritedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowInherited(!showInherited)}
              className="mx-auto mb-3 flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-xs text-muted transition hover:border-line-strong hover:text-fg"
            >
              <LuLayers />
              {showInherited ? 'Hide' : 'Show'} {inheritedCount} message{inheritedCount === 1 ? '' : 's'} of context
              from the parent thread
            </button>
          )}
          {pinIndex === -1 ? (
            visible.map((node, i) => renderNode(node, i + offset))
          ) : (
            <>
              {visible.slice(0, pinIndex).map((node, i) => renderNode(node, i + offset))}
              <div ref={turnRef} style={{ minHeight: Math.max(0, viewportHeight - PIN_GAP - COLUMN_PAD) }}>
                {visible.slice(pinIndex).map((node, i) => renderNode(node, i + pinIndex + offset))}
              </div>
            </>
          )}
          {path.length === inheritedCount && thread?.parentThreadId && (
            <>
              <ForkDivider thread={thread} />
              <p className="px-6 py-8 text-center text-sm text-faint">Ask something to start this branch.</p>
            </>
          )}
        </div>
      </div>
      <div className="px-4 pt-1 pb-4 md:px-6">
        <Composer
          threadId={threadId}
          streamingNodeId={streamingNodeId}
          placeholder={thread?.parentThreadId ? 'Continue this branch…' : undefined}
        />
      </div>
    </div>
  )
}

function ForkDivider({ thread }: { thread: Thread | undefined }) {
  return (
    <div className="my-4 flex items-center gap-3 px-6 text-xs text-faint">
      <div className="h-px flex-1 bg-line" />
      <LuGitBranch />
      <span className="truncate">Branched: {thread?.title}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  )
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const k = key(it)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(it)
  }
  return m
}
