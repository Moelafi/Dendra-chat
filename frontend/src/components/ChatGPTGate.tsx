import { useState } from 'react'
import { FiAlertTriangle, FiArrowUpRight, FiLoader } from 'react-icons/fi'
import { desktop, type SessionState } from '../api/desktop'
import { DeltaBackground } from './DeltaBackground'
import { Logo } from './Logo'

/**
 * Desktop only: shown until the user is signed in with ChatGPT and has allowed
 * Dendra to use their plan. Requests are billed to their ChatGPT plan.
 */
export function ChatGPTGate({ session }: { session: SessionState | null }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connecting = session?.status === 'connecting' || busy
  const needsSharing = session?.status === 'connected' && !session.sharing
  const reauth = session?.status === 'reauth_required'
  const message = error ?? (session?.error && session.error.code !== 'cancelled' ? session.error.message : null)

  async function signIn() {
    setError(null)
    setBusy(true)
    const res = await desktop!.signIn(needsSharing ? { reconsent: true } : undefined)
    setBusy(false)
    if (!res.ok && res.error.code !== 'cancelled') setError(res.error.message)
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-bg px-6">
      {/* Alternatives kept for comparison: <FlowBackground />, or the orb (<ShaderCanvas> with lib/orb.ts shaders). */}
      <DeltaBackground className="opacity-80" />
      {/* Darkens the middle so the text stays readable over the branches. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_32rem_24rem_at_center,var(--color-bg)_35%,transparent)]" />
      <div className="relative w-full max-w-sm text-center">
        <div className="mb-10 flex items-center justify-center gap-3">
          <Logo className="size-11" />
          <span className="font-brand text-3xl font-semibold text-fg">Dendra</span>
        </div>
        <h1 className="text-xl font-normal tracking-tight text-fg">
          {needsSharing ? 'Allow plan usage' : reauth ? 'Sign in again' : 'Sign in with ChatGPT'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {needsSharing
            ? 'You’re signed in, but Dendra isn’t allowed to use your ChatGPT plan yet. Grant access to start chatting.'
            : 'Dendra uses your own ChatGPT Plus or Pro plan. Your conversations stay on this computer.'}
        </p>

        {connecting ? (
          <div className="mt-8 space-y-3">
            <div className="flex items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-muted">
              <FiLoader className="animate-spin" /> Finish signing in in your browser…
            </div>
            <button type="button" onClick={() => desktop!.cancelSignIn()} className="text-xs text-faint hover:text-fg">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={signIn}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-fg py-2.5 text-sm font-medium text-bg transition hover:bg-white"
          >
            {needsSharing ? 'Allow access' : 'Continue with ChatGPT'} <FiArrowUpRight />
          </button>
        )}

        {message && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/25 px-3 py-2.5 text-left text-xs text-red-300">
            <FiAlertTriangle className="mt-0.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}
      </div>
    </div>
  )
}
