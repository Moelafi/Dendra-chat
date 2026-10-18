import { useEffect, useRef } from 'react'
import { startDelta } from '../lib/delta'

/** Animated branching lines that fill their container (see lib/delta.ts). Decorative only. */
export function DeltaBackground({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(
    () => startDelta(ref.current!, { reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches }),
    [],
  )
  return (
    <canvas ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-0 size-full ${className}`} />
  )
}
