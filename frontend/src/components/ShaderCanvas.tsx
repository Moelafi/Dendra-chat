import { useEffect, useRef } from 'react'
import { startShader } from '../lib/shader'

/** A canvas running a fragment shader (see lib/shader.ts). Decorative only. Currently unused (the orb experiment). */
export function ShaderCanvas({ frag, scale, className = '' }: { frag: string; scale?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    // Reduced motion: one still frame, picked to look good.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : undefined
    return startShader(ref.current!, frag, { scale, stillAt: still })
  }, [frag, scale])
  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none ${className}`} />
}
