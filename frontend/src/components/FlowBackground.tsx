import { useEffect, useRef } from 'react'
import { startFlow } from '../lib/flow'

/** Particles drifting on a current that fills their container (see lib/flow.ts). Decorative only. Currently unused; the sign-in screen uses DeltaBackground. */
export function FlowBackground({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(
    () => startFlow(ref.current!, { reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches }),
    [],
  )
  return (
    <canvas ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-0 size-full ${className}`} />
  )
}
