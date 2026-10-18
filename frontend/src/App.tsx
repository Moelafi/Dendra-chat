import { useEffect, useRef, useState } from 'react'
import { FiAlertTriangle, FiSidebar } from 'react-icons/fi'
import { LuPanelRight } from 'react-icons/lu'
import { useEventListener, useLocalStorage, useMediaQuery } from 'usehooks-ts'
import { fetchModels } from './api/client'
import { desktop } from './api/desktop'
import { BookmarksPanel } from './components/BookmarksPanel'
import { ChatGPTGate } from './components/ChatGPTGate'
import { ChatPane } from './components/ChatPane'
import { GraphPanel } from './components/GraphView'
import { clamp, ResizeHandle } from './components/ResizeHandle'
import { Notice } from './components/Notice'
import { SelectionToolbar } from './components/SelectionToolbar'
import { Sidebar } from './components/Sidebar'
import { db } from './db/db'
import { recoverInterruptedStreams } from './db/ops'
import { navigate, useUI } from './store/ui'

const DEFAULTS = { left: 256, right: 320, split: 0.52 }
/** The conversation map (React Flow) under Bookmarks. Hidden for now; flip to bring it back. */
const SHOW_MAP = false

export default function App() {
  const { currentThreadId, setModels, setGraphFullscreen, session, setSession } = useUI()
  // Desktop: chatting needs a ChatGPT sign-in that allows using the plan.
  const canChat = !desktop || (session?.status === 'connected' && session.sharing)
  // Docked sidebars remember their state; on small screens they become drawers that start closed.
  const [leftDocked, setLeftDocked] = useLocalStorage('bc-left-open', true)
  const [rightDocked, setRightDocked] = useLocalStorage('bc-right-open', true)
  const [leftDrawer, setLeftDrawer] = useState(false)
  const [rightDrawer, setRightDrawer] = useState(false)
  const md = useMediaQuery('(min-width: 768px)')
  const lg = useMediaQuery('(min-width: 1024px)')
  const leftOpen = md ? leftDocked : leftDrawer
  const rightOpen = lg ? rightDocked : rightDrawer
  const setLeftOpen = md ? setLeftDocked : setLeftDrawer
  const setRightOpen = lg ? setRightDocked : setRightDrawer

  // Resizable panel sizes (px, except the bookmarks/map split which is a fraction).
  const [leftW, setLeftW] = useLocalStorage('bc-left-w', DEFAULTS.left)
  const [rightW, setRightW] = useLocalStorage('bc-right-w', DEFAULTS.right)
  const [split, setSplit] = useLocalStorage('bc-right-split', DEFAULTS.split)
  const rightColRef = useRef<HTMLDivElement>(null)
  const leftSize = clamp(leftW, 200, 420)
  const rightSize = clamp(rightW, 260, 560)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void recoverInterruptedStreams()
  }, [])

  // Desktop: follow the ChatGPT session from the main process.
  useEffect(() => {
    if (!desktop) return
    void desktop.getSession().then((res) => res.ok && setSession(res.value))
    return desktop.onSession(setSession)
  }, [setSession])

  // Models come from the signed-in ChatGPT account (desktop app only).
  const accountKey = desktop ? (canChat ? session?.profileId ?? 'connected' : null) : 'web'
  useEffect(() => {
    if (!accountKey) return
    fetchModels()
      .then((r) => {
        setModels(r.models, r.default, r.labels)
        if (r.error) setLoadError(r.error)
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [accountKey, setModels])

  // On small screens, picking something in a drawer should reveal the chat.
  useEffect(() => {
    setLeftDrawer(false)
    setRightDrawer(false)
  }, [currentThreadId])

  // Opening a thread marks it read. A history entry or old URL may also point
  // at a thread that was deleted since; fall back to a new chat then.
  useEffect(() => {
    if (!currentThreadId) return
    void db.threads.get(currentThreadId).then((t) => {
      if (!t && useUI.getState().currentThreadId === currentThreadId) navigate(null, undefined, { replace: true })
      else if (t?.unread) void db.threads.update(t.id, { unread: false })
    })
  }, [currentThreadId])

  useEventListener('keydown', (e) => {
    if (e.key === 'Escape' && useUI.getState().graphFullscreen) setGraphFullscreen(false)
  })

  if (desktop && !session) return <div className="h-full bg-bg" />
  if (!canChat) return <ChatGPTGate session={session} />

  return (
    <div className="flex h-full overflow-hidden bg-bg text-fg">
      {leftOpen && (
        <div
          className="relative w-64 shrink-0 border-r border-line bg-panel max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40"
          style={md ? { width: leftSize } : undefined}
        >
          <Sidebar onCollapse={() => setLeftOpen(false)} />
          {md && (
            <ResizeHandle axis="x" edge="right" getSize={() => leftSize} onResize={(w) => setLeftW(clamp(w, 200, 420))} onReset={() => setLeftW(DEFAULTS.left)} />
          )}
        </div>
      )}

      <main className="relative flex min-w-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <div className="absolute top-3 left-2 z-10 flex gap-1">
            {!leftOpen && (
              <button type="button" onClick={() => setLeftOpen(true)} className="rounded-lg p-2 text-faint transition hover:bg-surface hover:text-fg" title="Show sidebar">
                <FiSidebar />
              </button>
            )}
          </div>
          <div className={`h-full ${!leftOpen ? 'pl-10' : ''} ${!rightOpen ? 'pr-10' : ''}`}>
            <ChatPane key={currentThreadId ?? 'new'} threadId={currentThreadId} />
          </div>
          {!rightOpen && (
            <button
              type="button"
              onClick={() => setRightOpen(true)}
              className="absolute top-3 right-2 z-10 rounded-lg p-2 text-faint transition hover:bg-surface hover:text-fg"
              title="Show bookmarks & map"
            >
              <LuPanelRight />
            </button>
          )}
        </div>

      </main>

      {(leftOpen && !md) || (rightOpen && !lg) ? (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => {
            if (!md) setLeftDrawer(false)
            if (!lg) setRightDrawer(false)
          }}
        />
      ) : null}

      {rightOpen && (
        <div
          ref={rightColRef}
          className="relative flex w-80 shrink-0 flex-col border-l border-line bg-panel max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40"
          style={lg ? { width: rightSize } : undefined}
        >
          {lg && (
            <ResizeHandle axis="x" edge="left" getSize={() => rightSize} onResize={(w) => setRightW(clamp(w, 260, 560))} onReset={() => setRightW(DEFAULTS.right)} />
          )}
          <div className="flex min-h-0 flex-col" style={{ flex: SHOW_MAP ? `${split} 1 0` : '1 1 0' }}>
            <div className="flex justify-end px-2 pt-2">
              <button type="button" onClick={() => setRightOpen(false)} className="rounded-lg p-1.5 text-faint transition hover:bg-surface hover:text-fg" title="Hide panel">
                <LuPanelRight />
              </button>
            </div>
            <BookmarksPanel />
          </div>
          {SHOW_MAP && (
            <div className="relative min-h-0 border-t border-line" style={{ flex: `${1 - split} 1 0` }}>
              <ResizeHandle
                axis="y"
                edge="top"
                getSize={() => (rightColRef.current?.clientHeight ?? 1) * (1 - split)}
                onResize={(h) => setSplit(clamp(1 - h / (rightColRef.current?.clientHeight ?? 1), 0.15, 0.85))}
                onReset={() => setSplit(DEFAULTS.split)}
              />
              <GraphPanel />
            </div>
          )}
        </div>
      )}

      {loadError && (
        <div className="fixed bottom-4 left-1/2 z-50 flex max-w-lg -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-red-500/25 bg-panel px-4 py-3 text-sm text-red-300 shadow-2xl shadow-black">
          <FiAlertTriangle className="shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button type="button" onClick={() => setLoadError(null)} className="text-red-300 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      <SelectionToolbar />
      <Notice />
    </div>
  )
}
