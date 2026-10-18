import { useId } from 'react'

/** The Dendra mark: a circle in an earthy blue to phosphor green gradient. Same artwork as public/favicon.svg. */
export function Logo({ className }: { className?: string }) {
  // useId contains characters like ":" or "«", which break url(#…) references.
  const id = `logo${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={id} cx=".7" cy=".25" r=".95">
          <stop offset="0" stopColor="#7dffb0" />
          <stop offset=".35" stopColor="#3fbf86" />
          <stop offset=".7" stopColor="#2b7f95" />
          <stop offset="1" stopColor="#1f4f78" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#${id})`} />
    </svg>
  )
}
