import { useCallback, useState } from 'react'
import { useCopyToClipboard, useTimeout } from 'usehooks-ts'

/** Copy text and expose a "copied" flag that resets after a moment. */
export function useCopy(): [boolean, (text: string) => void] {
  const [, copyToClipboard] = useCopyToClipboard()
  const [copiedAt, setCopiedAt] = useState<number | null>(null)
  useTimeout(() => setCopiedAt(null), copiedAt ? 1500 : null)
  const copy = useCallback(
    (text: string) => {
      void copyToClipboard(text).then((ok) => ok && setCopiedAt(Date.now()))
    },
    [copyToClipboard],
  )
  return [copiedAt !== null, copy]
}
