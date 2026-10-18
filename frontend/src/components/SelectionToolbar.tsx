import { useEffect, useRef, useState } from 'react'
import { FiArrowUpRight, FiBookmark, FiCheck, FiCopy, FiCornerDownLeft, FiMessageCircle } from 'react-icons/fi'
import { useOnClickOutside } from 'usehooks-ts'
import { db } from '../db/db'
import { addBookmark, createBranch, truncate } from '../db/ops'
import { BOOKMARK_COLORS, type BookmarkColor } from '../db/types'
import { useCopy } from '../hooks/useCopy'
import { sendMessage } from '../lib/chat'
import { contentText, offsetOf } from '../lib/textOffsets'
import { openThread, useUI } from '../store/ui'
import { colorClass } from './colors'

interface Captured {
  nodeId: string
  threadId: string
  text: string
  start: number
  end: number
  prefix: string
  suffix: string
  rect: DOMRect
  /** Why actions are unavailable, if they are. */
  blocked?: string
}

type Mode = 'menu' | 'bookmark' | 'ask'

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

function capture(): Captured | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const el = (n: Node) => (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement)
  const startMsg = el(range.startContainer)?.closest<HTMLElement>('[data-msg-content]')
  const endMsg = el(range.endContainer)?.closest<HTMLElement>('[data-msg-content]')
  if (!startMsg && !endMsg) return null
  const rect = range.getBoundingClientRect()
  if (!startMsg || startMsg !== endMsg) {
    return { nodeId: '', threadId: '', text: '', start: 0, end: 0, prefix: '', suffix: '', rect, blocked: 'Select text within a single message' }
  }
  const full = contentText(startMsg)
  const start = offsetOf(startMsg, range.startContainer, range.startOffset)
  const end = offsetOf(startMsg, range.endContainer, range.endOffset)
  const text = full.slice(start, end)
  if (!text.trim()) return null
  return {
    nodeId: startMsg.dataset.nodeId!,
    threadId: startMsg.dataset.threadId!,
    text,
    start,
    end,
    prefix: full.slice(Math.max(0, start - 32), start),
    suffix: full.slice(end, end + 32),
    rect,
    blocked: startMsg.dataset.status === 'streaming' ? 'Wait for the reply to finish' : undefined,
  }
}

export function SelectionToolbar() {
  const [cap, setCap] = useState<Captured | null>(null)
  const [mode, setMode] = useState<Mode>('menu')
  const [color, setColor] = useState<BookmarkColor>('yellow')
  const [note, setNote] = useState('')
  const [question, setQuestion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, copy] = useCopy()
  const ref = useRef<HTMLDivElement>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  function close() {
    setCap(null)
    setMode('menu')
    setNote('')
    setQuestion('')
    setError(null)
  }

  useEffect(() => {
    const onUp = (e: MouseEvent | KeyboardEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      // Let the browser finalise the selection first.
      setTimeout(() => {
        const c = capture()
        if (c) {
          setCap(c)
          setMode('menu')
          setError(null)
        } else if (modeRef.current === 'menu') setCap(null)
      }, 0)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mouseup', onUp)
    document.addEventListener('keyup', onUp)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('keyup', onUp)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // The captured selection belongs to the view; drop it when navigating.
  const currentThreadId = useUI((s) => s.currentThreadId)
  useEffect(() => close(), [currentThreadId])

  useOnClickOutside(ref as React.RefObject<HTMLElement>, () => {
    if (modeRef.current !== 'menu') close()
  })

  if (!cap) return null

  async function saveBookmark() {
    if (!cap) return
    const node = await db.nodes.get(cap.nodeId)
    if (!node) return
    await addBookmark({
      conversationId: node.conversationId,
      threadId: cap.threadId,
      nodeId: cap.nodeId,
      text: cap.text,
      start: cap.start,
      end: cap.end,
      prefix: cap.prefix,
      suffix: cap.suffix,
      color,
      note: note.trim(),
    })
    window.getSelection()?.removeAllRanges()
    close()
  }

  /** Ask in a new branch, then either jump into it or stay here while it answers. */
  async function ask(stay: boolean) {
    if (!cap || !question.trim()) return
    const thread = await db.threads.get(cap.threadId)
    const head = thread?.headNodeId ? await db.nodes.get(thread.headNodeId) : undefined
    if (head?.status === 'streaming') return setError('This thread is still replying; try again in a moment.')
    const model = useUI.getState().model
    const anchor = { sourceNodeId: cap.nodeId, text: cap.text, start: cap.start, end: cap.end }
    const branch = await createBranch(cap.threadId, anchor, { unread: stay })
    const q = question.trim()
    window.getSelection()?.removeAllRanges()
    close()
    if (stay) {
      useUI.getState().showNotice({ text: `Asking in a new branch: “${truncate(q, 48)}”`, threadId: branch.id })
    } else {
      openThread(branch.id)
    }
    void sendMessage(branch.id, q, model, anchor)
  }

  const width = mode === 'menu' ? 320 : 340
  const left = Math.max(8, Math.min(cap.rect.left + cap.rect.width / 2 - width / 2, window.innerWidth - width - 8))
  // Keep the toolbar on screen even when the selection is partly scrolled out of view.
  const above = cap.rect.top > 220
  const anchorY = Math.max(80, Math.min(above ? cap.rect.top - 10 : cap.rect.bottom + 10, window.innerHeight - 80))
  const style = { left, top: anchorY, width: mode === 'menu' ? 'max-content' : width, transform: above ? 'translateY(-100%)' : undefined }

  return (
    <div
      ref={ref}
      style={style}
      className="fixed z-50 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl shadow-black"
      onMouseDown={(e) => {
        // Keep the text selection while clicking toolbar buttons.
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault()
      }}
    >
      {cap.blocked ? (
        <div className="px-2.5 py-1.5 text-xs text-muted">{cap.blocked}</div>
      ) : mode === 'menu' ? (
        <div className="flex items-center gap-1">
          <ToolButton onClick={() => setMode('bookmark')} icon={<FiBookmark />} label="Bookmark" />
          <ToolButton onClick={() => setMode('ask')} icon={<FiMessageCircle />} label="Ask about this" />
          <ToolButton
            onClick={() => copy(cap.text)}
            icon={copied ? <FiCheck /> : <FiCopy />}
            label=""
            title="Copy"
          />
        </div>
      ) : mode === 'bookmark' ? (
        <div className="space-y-2 p-1.5">
          <div className="flex items-center gap-2">
            {BOOKMARK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                title={colorClass[c].label}
                className={`size-5 rounded-full ${colorClass[c].dot} transition ${
                  color === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-panel' : 'opacity-50 hover:opacity-100'
                }`}
              />
            ))}
            <span className="ml-auto text-xs text-muted">{colorClass[color].label}</span>
          </div>
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveBookmark()}
            placeholder="Add a note (optional)"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
          <button
            type="button"
            onClick={saveBookmark}
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-fg py-2 text-sm font-medium text-bg transition hover:bg-white"
          >
            <FiBookmark /> Save bookmark
          </button>
        </div>
      ) : (
        <div className="space-y-2 p-1.5">
          <div className="line-clamp-2 border-l-2 border-line-strong pl-2.5 text-xs text-muted">{cap.text}</div>
          <textarea
            autoFocus
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void ask(e.metaKey || e.ctrlKey)
              }
            }}
            placeholder="Ask about this snippet…"
            className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
          {error && <div className="text-xs text-red-300">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => ask(true)}
              disabled={!question.trim()}
              title={`Ask in a new branch and stay here (${MOD}+Enter)`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line py-2 text-sm text-fg transition hover:border-line-strong hover:bg-surface disabled:text-faint disabled:hover:bg-transparent"
            >
              Ask &amp; stay
              <kbd className="font-sans text-[11px] text-faint">{MOD}↵</kbd>
            </button>
            <button
              type="button"
              onClick={() => ask(false)}
              disabled={!question.trim()}
              title="Ask in a new branch and open it (Enter)"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-fg py-2 text-sm font-medium text-bg transition hover:bg-white disabled:bg-raised disabled:text-faint"
            >
              <FiArrowUpRight /> Ask &amp; open
              <FiCornerDownLeft className="text-[11px] opacity-50" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolButton({ onClick, icon, label, title }: { onClick: () => void; icon: React.ReactNode; label: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm whitespace-nowrap text-fg transition hover:bg-surface"
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  )
}
