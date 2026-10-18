import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useRef, useState } from 'react'
import { FiArrowLeft, FiArrowRight, FiChevronDown, FiChevronRight, FiMessageSquare, FiX } from 'react-icons/fi'
import { LuGitBranch } from 'react-icons/lu'
import { useOnClickOutside } from 'usehooks-ts'
import { db } from '../db/db'
import { threadAncestry } from '../db/tree'
import type { Thread } from '../db/types'
import { closeBranch } from '../lib/branches'
import { navigate, useUI } from '../store/ui'

/**
 * Browser-style bar: Back / Forward, a breadcrumb trail from the conversation
 * down to the current branch, and a menu of branches that start here.
 */
export function ThreadHeader({ thread, threads }: { thread: Thread | undefined; threads: Thread[] }) {
  const canBack = useUI((s) => s.canBack)
  const canForward = useUI((s) => s.canForward)
  const conversation = useLiveQuery(
    () => (thread ? db.conversations.get(thread.conversationId) : undefined),
    [thread?.conversationId],
  )
  const crumbs = thread ? threadAncestry(threads, thread.id) : []
  const children = thread ? threads.filter((t) => t.parentThreadId === thread.id) : []

  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-3">
      <NavButton title="Back" disabled={!canBack} onClick={() => history.back()}>
        <FiArrowLeft />
      </NavButton>
      <NavButton title="Forward" disabled={!canForward} onClick={() => history.forward()}>
        <FiArrowRight />
      </NavButton>

      <nav
        aria-label="Thread path"
        className="scrollbar-none ml-1.5 flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-sm"
      >
        {!thread && <span className="px-2 text-fg">New chat</span>}
        {crumbs.map((t, i) => {
          const last = i === crumbs.length - 1
          const isRoot = !t.parentThreadId
          // Going up lands on the spot the next branch was started from.
          const child = crumbs[i + 1]
          const target = child?.anchor
            ? { nodeId: child.anchor.sourceNodeId, start: child.anchor.start, end: child.anchor.end }
            : child?.forkNodeId
              ? { nodeId: child.forkNodeId }
              : undefined
          return (
            <Fragment key={t.id}>
              {i > 0 && <FiChevronRight className="shrink-0 text-faint" />}
              <button
                type="button"
                disabled={last}
                onClick={() => navigate(t.id, target)}
                title={isRoot ? conversation?.title : t.title}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition ${
                  last ? 'min-w-0 text-fg' : 'min-w-0 max-w-44 shrink text-muted hover:bg-surface hover:text-fg'
                }`}
              >
                {isRoot ? (
                  <FiMessageSquare className="shrink-0 text-faint" />
                ) : (
                  <LuGitBranch className="shrink-0 text-faint" />
                )}
                <span className="truncate">{isRoot ? (conversation?.title ?? 'Main') : t.title}</span>
              </button>
              {last && !isRoot && (
                <button
                  type="button"
                  onClick={() => closeBranch(t.id)}
                  title="Close and delete this branch (you can undo)"
                  aria-label="Close branch"
                  className="-ml-1 shrink-0 rounded-md p-1 text-faint transition hover:bg-surface hover:text-fg"
                >
                  <FiX />
                </button>
              )}
            </Fragment>
          )
        })}
      </nav>

      {children.length > 0 && <BranchMenu branches={children} />}
    </div>
  )
}

function NavButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg p-2 text-muted transition hover:bg-surface hover:text-fg disabled:text-line-strong disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function BranchMenu({ branches }: { branches: Thread[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOnClickOutside(ref as React.RefObject<HTMLElement>, () => setOpen(false))
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-line-strong hover:text-fg"
      >
        <LuGitBranch />
        {branches.length} branch{branches.length === 1 ? '' : 'es'}
        <FiChevronDown className="text-faint" />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-40 mt-2 w-72 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl shadow-black">
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setOpen(false)
                navigate(b.id)
              }}
              className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-surface"
            >
              <LuGitBranch className="mt-0.5 shrink-0 text-faint" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-fg">{b.title}</span>
                {b.anchor && <span className="mt-0.5 line-clamp-1 block text-xs text-faint">“{b.anchor.text}”</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
