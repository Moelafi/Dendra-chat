/**
 * Registry over the CSS Custom Highlight API. Each rendered message registers its
 * ranges under an owner key; we rebuild one global `Highlight` per style name.
 * Nothing in the rendered markdown DOM is mutated.
 */

export type HighlightStyle = 'bm-yellow' | 'bm-green' | 'bm-blue' | 'bm-pink' | 'bm-purple' | 'anchor' | 'flash'

const owners = new Map<string, { style: HighlightStyle; range: Range }[]>()
const supported = typeof CSS !== 'undefined' && 'highlights' in CSS

function rebuild() {
  if (!supported) return
  const byStyle = new Map<HighlightStyle, Range[]>()
  for (const entries of owners.values())
    for (const { style, range } of entries) {
      if (!byStyle.has(style)) byStyle.set(style, [])
      byStyle.get(style)!.push(range)
    }
  CSS.highlights.clear()
  for (const [style, ranges] of byStyle) {
    const h = new Highlight(...ranges)
    // Flash and anchors paint above bookmark colours.
    h.priority = style === 'flash' ? 2 : style === 'anchor' ? 1 : 0
    CSS.highlights.set(style, h)
  }
}

export function setHighlights(owner: string, entries: { style: HighlightStyle; range: Range }[]) {
  if (entries.length) owners.set(owner, entries)
  else owners.delete(owner)
  rebuild()
}

export function clearHighlights(owner: string) {
  if (owners.delete(owner)) rebuild()
}
