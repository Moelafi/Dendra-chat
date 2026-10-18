import { useRef, useState } from 'react'

interface Props {
  /** 'x' resizes widths (vertical bar), 'y' resizes heights (horizontal bar). */
  axis: 'x' | 'y'
  /** Which edge of the resized element the handle sits on. */
  edge: 'left' | 'right' | 'top' | 'bottom'
  /** Current size when the drag starts. */
  getSize: () => number
  onResize: (size: number) => void
  onReset?: () => void
}

/**
 * Invisible hit area on a panel edge that shows a thin line on hover and
 * resizes by dragging. Pointer capture keeps the drag alive over iframes,
 * the graph canvas and text. Double-click resets.
 */
export function ResizeHandle({ axis, edge, getSize, onResize, onReset }: Props) {
  const start = useRef<{ pos: number; size: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // Dragging towards the panel shrinks it.
  const sign = edge === 'right' || edge === 'bottom' ? 1 : -1

  const position =
    axis === 'x'
      ? `top-0 bottom-0 w-2 cursor-col-resize ${edge === 'right' ? '-right-1' : '-left-1'}`
      : `left-0 right-0 h-2 cursor-row-resize ${edge === 'bottom' ? '-bottom-1' : '-top-1'}`
  const line = axis === 'x' ? 'inset-y-0 left-1/2 w-px -translate-x-1/2' : 'inset-x-0 top-1/2 h-px -translate-y-1/2'

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      title="Drag to resize · double-click to reset"
      className={`group absolute z-20 touch-none ${position}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Synthetic pointers can't be captured; the drag still works over the handle.
        }
        start.current = { pos: axis === 'x' ? e.clientX : e.clientY, size: getSize() }
        setDragging(true)
        document.documentElement.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
        document.documentElement.style.userSelect = 'none'
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        const delta = (axis === 'x' ? e.clientX : e.clientY) - start.current.pos
        onResize(start.current.size + sign * delta)
      }}
      onPointerUp={(e) => {
        start.current = null
        setDragging(false)
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        document.documentElement.style.cursor = ''
        document.documentElement.style.userSelect = ''
      }}
      onDoubleClick={onReset}
    >
      <span
        className={`pointer-events-none absolute transition-colors ${line} ${
          dragging ? 'bg-fg/50' : 'bg-transparent group-hover:bg-fg/25'
        }`}
      />
    </div>
  )
}

export const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))
