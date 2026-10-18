import { memo, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiAlertTriangle, FiBookmark, FiCheck, FiCopy, FiCornerDownRight, FiRefreshCw, FiTrash2 } from 'react-icons/fi'
import { LuGitBranch } from 'react-icons/lu'
import { useOnClickOutside } from 'usehooks-ts'
import { db } from '../db/db'
import type { Bookmark, MsgNode, Thread } from '../db/types'
import { useCopy } from '../hooks/useCopy'
import { retry } from '../lib/chat'
import { clearHighlights, setHighlights, type HighlightStyle } from '../lib/highlights'
import { contentText, offsetOf, rangeFromOffsets, resolveSpan } from '../lib/textOffsets'
import { isFreshFocus, openThread, useUI, type Focus } from '../store/ui'
import { Markdown } from './Markdown'
import { colorClass } from './colors'

interface Props {
  node: MsgNode
  viewThreadId: string
  paneId: string
  bookmarks: Bookmark[]
  /** Branches whose snippet was highlighted in this message. */
  branches: Thread[]
  /** Branches still answering, shown with a pulse on their chip. */
  busyThreadIds: Set<string>
  focus: Focus | null
  dimmed?: boolean
}

type Hit = { kind: 'bookmark'; bookmark: Bookmark } | { kind: 'branch'; thread: Thread }

export const Message = memo(function Message({
  node,
  viewThreadId,
  paneId,
  bookmarks,
  branches,
  busyThreadIds,
  focus,
  dimmed,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [copied, copy] = useCopy()
  const [hits, setHits] = useState<{ x: number; y: number; items: Hit[] } | null>(null)
  const [flashUntil, setFlashUntil] = useState(0)
  const model = useUI((s) => s.model)
  const owner = `${paneId}:${node.id}`
  const isUser = node.role === 'user'
  const streaming = node.status === 'streaming'

  // A focus request with offsets flashes that exact span for a moment.
  const focusSpan = isFreshFocus(focus) && focus.nodeId === node.id && focus.start !== undefined ? focus : null
  useLayoutEffect(() => {
    if (!focusSpan) return
    setFlashUntil(Date.now() + 1800)
    const t = setTimeout(() => setFlashUntil(0), 1800)
    return () => clearTimeout(t)
  }, [focusSpan?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const root = contentRef.current
    if (!root || streaming) return clearHighlights(owner)
    const text = contentText(root)
    const entries: { style: HighlightStyle; range: Range }[] = []
    const add = (style: HighlightStyle, span: { text: string; start: number; end: number; prefix?: string }) => {
      const pos = resolveSpan(text, span)
      const range = pos && rangeFromOffsets(root, pos.start, pos.end)
      if (range) entries.push({ style, range })
    }
    for (const b of bookmarks) add(`bm-${b.color}`, b)
    for (const t of branches) if (t.anchor) add('anchor', t.anchor)
    if (flashUntil && focusSpan)
      add('flash', { text: text.slice(focusSpan.start, focusSpan.end), start: focusSpan.start!, end: focusSpan.end! })
    setHighlights(owner, entries)
  }, [owner, node.content, streaming, bookmarks, branches, flashUntil, focusSpan])

  useLayoutEffect(() => () => clearHighlights(owner), [owner])

  // Highlights are painted, not DOM elements, so find what was clicked by text offset.
  function onContentClick(e: React.MouseEvent) {
    const root = contentRef.current
    if (!root || !window.getSelection()?.isCollapsed) return
    const caret = caretAt(e.clientX, e.clientY)
    if (!caret || !root.contains(caret.node)) return
    const offset = offsetOf(root, caret.node, caret.offset)
    const text = contentText(root)
    const within = (s: { text: string; start: number; end: number; prefix?: string }) => {
      const pos = resolveSpan(text, s)
      return !!pos && offset >= pos.start && offset <= pos.end
    }
    const items: Hit[] = [
      ...branches.filter((t) => t.anchor && within(t.anchor)).map((thread) => ({ kind: 'branch' as const, thread })),
      ...bookmarks.filter(within).map((bookmark) => ({ kind: 'bookmark' as const, bookmark })),
    ]
    if (!items.length) return
    if (items.length === 1 && items[0].kind === 'branch') return void openThread(items[0].thread.id)
    setHits({ x: e.clientX, y: e.clientY, items })
  }

  return (
    <div
      data-node-id={node.id}
      className={`group flex px-4 py-1.5 transition-opacity md:px-6 ${isUser ? 'justify-end' : ''} ${dimmed ? 'opacity-50 hover:opacity-100' : ''}`}
    >
      <div className={`flex min-w-0 flex-col ${isUser ? 'max-w-[min(36rem,85%)] items-end' : 'w-full'}`}>
        {node.anchor && (
          <button
            type="button"
            onClick={() => useUI.getState().focusNode(node.anchor!.sourceNodeId, node.anchor!.start, node.anchor!.end)}
            className="mb-2 flex max-w-full items-start gap-2 rounded-xl border border-line px-3 py-2 text-left text-[13px] text-muted transition hover:border-line-strong hover:text-fg"
            title="Jump to the highlighted snippet"
          >
            <FiCornerDownRight className="mt-0.5 shrink-0 text-faint" />
            <span className="line-clamp-3">{node.anchor.text}</span>
          </button>
        )}

        <div className={isUser ? 'rounded-3xl bg-surface px-4 py-2.5' : 'w-full'}>
          <div
            ref={contentRef}
            data-msg-content
            data-node-id={node.id}
            data-thread-id={viewThreadId}
            data-status={node.status}
            onClick={onContentClick}
            className={
              isUser
                ? 'whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg'
                : `md prose prose-invert max-w-none text-[15px] leading-7 prose-p:my-3 prose-pre:my-0 ${streaming ? 'caret' : ''}`
            }
          >
            {isUser ? (
              node.content
            ) : node.content ? (
              <Markdown content={node.content} />
            ) : streaming ? (
              <Thinking />
            ) : null}
          </div>
        </div>

        {(node.status === 'error' || node.status === 'stopped') && (
          <div
            className={`mt-3 flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${
              node.status === 'error' ? 'border-red-500/25 text-red-300' : 'border-line text-muted'
            }`}
          >
            <FiAlertTriangle className="shrink-0" />
            <span className="min-w-0 flex-1">{node.status === 'error' ? node.error : 'Stopped'}</span>
            <button
              type="button"
              onClick={() => retry(node.id, model)}
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-fg transition hover:bg-raised"
            >
              <FiRefreshCw /> Retry
            </button>
          </div>
        )}

        <div
          className={`mt-1.5 flex min-h-7 flex-wrap items-center gap-1 text-xs text-faint ${isUser ? 'justify-end' : ''}`}
        >
          {!streaming && node.content && (
            <button
              type="button"
              onClick={() => copy(node.content)}
              className="rounded-lg p-1.5 opacity-0 transition group-hover:opacity-100 hover:bg-surface hover:text-fg"
              title="Copy message"
            >
              {copied ? <FiCheck /> : <FiCopy />}
            </button>
          )}
          {!isUser && node.model && !streaming && (
            <span className="px-1 opacity-0 transition group-hover:opacity-100">{node.model}</span>
          )}
          {bookmarks.length > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-1 text-muted">
              <FiBookmark /> {bookmarks.length}
            </span>
          )}
          {branches.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openThread(t.id)}
              className="flex max-w-60 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-muted transition hover:border-line-strong hover:text-fg"
              title={busyThreadIds.has(t.id) ? 'Answering… click to open' : 'Open branch'}
            >
              {busyThreadIds.has(t.id) ? (
                <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-fg" />
              ) : (
                <LuGitBranch className="shrink-0" />
              )}
              <span className="truncate">{t.title}</span>
            </button>
          ))}
        </div>
      </div>

      {hits && createPortal(<HitPopover hits={hits} onClose={() => setHits(null)} />, document.body)}
    </div>
  )
})

function Thinking() {
  return (
    <span className="inline-flex items-center gap-1.5 py-2">
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  )
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y)
    return p ? { node: p.offsetNode, offset: p.offset } : null
  }
  const r = document.caretRangeFromPoint?.(x, y)
  return r ? { node: r.startContainer, offset: r.startOffset } : null
}

/** Shown when a click lands on a bookmark, or on overlapping highlights. */
function HitPopover({ hits, onClose }: { hits: { x: number; y: number; items: Hit[] }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useOnClickOutside(ref as React.RefObject<HTMLElement>, onClose)
  return (
    <div
      ref={ref}
      className="fixed z-50 w-72 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl shadow-black"
      style={{ left: Math.min(hits.x, window.innerWidth - 300), top: hits.y + 12 }}
    >
      {hits.items.map((h) =>
        h.kind === 'branch' ? (
          <button
            key={h.thread.id}
            type="button"
            onClick={() => {
              onClose()
              void openThread(h.thread.id)
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-fg hover:bg-surface"
          >
            <LuGitBranch className="shrink-0 text-muted" />
            <span className="truncate">Open branch: {h.thread.title}</span>
          </button>
        ) : (
          <div key={h.bookmark.id} className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm">
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${colorClass[h.bookmark.color].dot}`} />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-muted">{h.bookmark.note || h.bookmark.text}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose()
                void db.bookmarks.delete(h.bookmark.id)
              }}
              className="rounded-lg p-1 text-faint hover:bg-surface hover:text-red-300"
              title="Remove bookmark"
            >
              <FiTrash2 />
            </button>
          </div>
        ),
      )}
    </div>
  )
}
