import { useRef, useState } from 'react'
import { FiActivity, FiLogOut } from 'react-icons/fi'
import { useOnClickOutside } from 'usehooks-ts'
import { desktop } from '../api/desktop'
import { useUI } from '../store/ui'

/** Desktop only: the signed-in ChatGPT account, with usage and sign-out. */
export function AccountMenu() {
  const session = useUI((s) => s.session)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOnClickOutside(ref as React.RefObject<HTMLElement>, () => setOpen(false))
  if (!desktop || session?.status !== 'connected') return null

  const name = session.identity?.name || session.identity?.email || session.profileLabel || 'ChatGPT account'
  const email = session.identity?.name ? session.identity.email : undefined

  return (
    <div ref={ref} className="relative border-t border-line p-2">
      {open && (
        <div className="absolute right-2 bottom-full left-2 mb-1 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl shadow-black">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              desktop!.openUsage()
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg hover:bg-surface"
          >
            <FiActivity className="text-muted" /> Manage usage
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              void desktop!.signOut()
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg hover:bg-surface"
          >
            <FiLogOut className="text-muted" /> Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-surface"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-xs text-fg">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm text-fg">{name}</span>
          <span className="block truncate text-xs text-faint">{email ?? 'ChatGPT plan'}</span>
        </span>
      </button>
    </div>
  )
}
