import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SessionState } from '../api/desktop'

export interface Notice {
  id: number
  text: string
  /** Optional thread the notice's "Open" action navigates to. */
  threadId?: string
  /** Optional custom action, e.g. Undo. */
  action?: { label: string; run: () => void | Promise<void> }
  icon?: 'branch' | 'trash'
  /** Auto-hide delay in ms (default 6000). */
  duration?: number
}

export interface Focus {
  nodeId: string
  start?: number
  end?: number
  /** Creation time; also identifies the request. */
  nonce: number
}

/** Jump requests only apply briefly, so views mounted later don't replay old jumps. */
export const isFreshFocus = (f: Focus | null): f is Focus => !!f && Date.now() - f.nonce < 4000

interface UIState {
  /** Thread on screen (null = new chat screen). Like the URL of a browser tab. */
  currentThreadId: string | null
  focus: Focus | null
  /** Position in this tab's history, for enabling back/forward. */
  historyIndex: number
  historyLength: number
  canBack: boolean
  canForward: boolean
  models: string[]
  /** Display names for model ids, when the provider has them. */
  modelLabels: Record<string, string>
  model: string
  /** ChatGPT account session (desktop app only; null in the browser). */
  session: SessionState | null
  graphFullscreen: boolean
  /** Small transient message, e.g. "Asked in a new branch · Open". */
  notice: Notice | null
  showNotice: (n: Omit<Notice, 'id'>) => void
  dismissNotice: () => void
  setModels: (models: string[], fallback: string, labels?: Record<string, string>) => void
  setSession: (session: SessionState) => void
  setModel: (model: string) => void
  setGraphFullscreen: (v: boolean) => void
  focusNode: (nodeId: string, start?: number, end?: number) => void
}

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      currentThreadId: null,
      focus: null,
      historyIndex: 0,
      historyLength: 1,
      canBack: false,
      canForward: false,
      models: [],
      modelLabels: {},
      model: '',
      session: null,
      graphFullscreen: false,
      notice: null,
      showNotice: (n) => set({ notice: { ...n, id: Date.now() } }),
      dismissNotice: () => set({ notice: null }),
      setModels: (models, fallback, labels = {}) =>
        set({ models, modelLabels: labels, model: models.includes(get().model) ? get().model : fallback }),
      setSession: (session) => set({ session }),
      setModel: (model) => set({ model }),
      setGraphFullscreen: (graphFullscreen) => set({ graphFullscreen }),
      focusNode: (nodeId, start, end) => set({ focus: { nodeId, start, end, nonce: Date.now() } }),
    }),
    {
      name: 'branchchat-ui',
      partialize: (s) => ({ currentThreadId: s.currentThreadId, model: s.model }),
    },
  ),
)

type FocusTarget = { nodeId: string; start?: number; end?: number }
interface HistoryState {
  threadId: string | null
  index: number
}

const urlFor = (threadId: string | null) => (threadId ? `#/t/${threadId}` : '#/')

/**
 * Go to a thread (or the new chat screen with null), pushing a browser history
 * entry so Back/Forward, mouse buttons and Cmd+[ / Cmd+] all work.
 */
export function navigate(threadId: string | null, focus?: FocusTarget, opts: { replace?: boolean } = {}) {
  const ui = useUI.getState()
  if (threadId !== ui.currentThreadId || opts.replace) {
    if (opts.replace) {
      history.replaceState({ threadId, index: ui.historyIndex } satisfies HistoryState, '', urlFor(threadId))
      useUI.setState({ currentThreadId: threadId })
    } else {
      const index = ui.historyIndex + 1
      history.pushState({ threadId, index } satisfies HistoryState, '', urlFor(threadId))
      useUI.setState({ currentThreadId: threadId, historyIndex: index, historyLength: index + 1 })
    }
    syncHistoryFlags()
  }
  if (focus) useUI.getState().focusNode(focus.nodeId, focus.start, focus.end)
}

/** Alias kept for call sites that open a thread from a link, chip, bookmark or graph node. */
export const openThread = (threadId: string, focus?: FocusTarget) => navigate(threadId, focus)

/** The Navigation API (Chromium) knows about entries from before a reload; fall back to our own counter. */
type NavigationLike = { canGoBack: boolean; canGoForward: boolean; addEventListener: (t: string, f: () => void) => void }
const nav = (window as unknown as { navigation?: NavigationLike }).navigation

function syncHistoryFlags() {
  const { historyIndex, historyLength } = useUI.getState()
  useUI.setState(
    nav
      ? { canBack: nav.canGoBack, canForward: nav.canGoForward }
      : { canBack: historyIndex > 0, canForward: historyIndex < historyLength - 1 },
  )
}

/** Wire the store to browser history. Call once at startup. */
export function initHistory() {
  const fromHash = /^#\/t\/(.+)$/.exec(location.hash)?.[1] ?? null
  // The URL wins over the persisted thread so links and reloads land where expected.
  const start = location.hash ? fromHash : useUI.getState().currentThreadId
  history.replaceState({ threadId: start, index: 0 } satisfies HistoryState, '', urlFor(start))
  useUI.setState({ currentThreadId: start, historyIndex: 0, historyLength: 1 })

  window.addEventListener('popstate', (e) => {
    const state = e.state as HistoryState | null
    const threadId = state?.threadId ?? /^#\/t\/(.+)$/.exec(location.hash)?.[1] ?? null
    useUI.setState({ currentThreadId: threadId, historyIndex: state?.index ?? 0 })
    syncHistoryFlags()
  })
  nav?.addEventListener('currententrychange', syncHistoryFlags)
  syncHistoryFlags()
}
