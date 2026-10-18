import { useEffect } from 'react'
import { FiArrowUpRight, FiRotateCcw, FiTrash2, FiX } from 'react-icons/fi'
import { LuGitBranch } from 'react-icons/lu'
import { navigate, useUI } from '../store/ui'

/** Bottom toast for background actions, with an optional "Open" link. Auto-hides. */
export function Notice() {
  const notice = useUI((s) => s.notice)
  const dismiss = useUI((s) => s.dismissNotice)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(dismiss, notice.duration ?? 6000)
    return () => clearTimeout(t)
  }, [notice, dismiss])

  if (!notice) return null
  return (
    <div
      role="status"
      className="fixed top-[72px] left-1/2 z-50 flex max-w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-line bg-panel py-2.5 pr-2 pl-4 text-sm text-muted shadow-2xl shadow-black"
    >
      {notice.icon === 'trash' ? <FiTrash2 className="shrink-0 text-faint" /> : <LuGitBranch className="shrink-0 text-faint" />}
      <span className="min-w-0 truncate">{notice.text}</span>
      {notice.threadId && (
        <button
          type="button"
          onClick={() => {
            navigate(notice.threadId!)
            dismiss()
          }}
          className="flex shrink-0 items-center gap-1 rounded-full bg-fg px-3 py-1 text-xs font-medium text-bg transition hover:bg-white"
        >
          Open <FiArrowUpRight />
        </button>
      )}
      {notice.action && (
        <button
          type="button"
          onClick={() => {
            dismiss()
            void notice.action!.run()
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-fg px-3 py-1 text-xs font-medium text-bg transition hover:bg-white"
        >
          <FiRotateCcw /> {notice.action.label}
        </button>
      )}
      <button type="button" onClick={dismiss} className="shrink-0 rounded-full p-1.5 text-faint hover:bg-surface hover:text-fg" title="Dismiss">
        <FiX />
      </button>
    </div>
  )
}
