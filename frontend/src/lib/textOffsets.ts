/**
 * Character offsets into a message's rendered text. UI chrome inside the message
 * (code block headers, copy buttons) is marked `data-hl-ignore` and skipped so
 * offsets only cover the actual content.
 */

function textWalker(root: Node): TreeWalker {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('[data-hl-ignore]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    },
  })
}

export function contentText(root: Node): string {
  const walker = textWalker(root)
  let s = ''
  while (walker.nextNode()) s += walker.currentNode.textContent ?? ''
  return s
}

/** Offset of a DOM position (container + offset) relative to `root`'s content text. */
export function offsetOf(root: Node, container: Node, offset: number): number {
  if (container.nodeType !== Node.TEXT_NODE) {
    // Element position: convert to the text position just before child[offset].
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(container, offset)
    return contentText(range.cloneContents()).length
  }
  const walker = textWalker(root)
  let total = 0
  while (walker.nextNode()) {
    if (walker.currentNode === container) return total + offset
    total += walker.currentNode.textContent?.length ?? 0
  }
  return total
}

/** Build a DOM Range covering content-text offsets [start, end) inside `root`. */
export function rangeFromOffsets(root: Node, start: number, end: number): Range | null {
  const walker = textWalker(root)
  const range = document.createRange()
  let total = 0
  let startSet = false
  while (walker.nextNode()) {
    const node = walker.currentNode
    const len = node.textContent?.length ?? 0
    if (!startSet && start <= total + len) {
      range.setStart(node, start - total)
      startSet = true
    }
    if (startSet && end <= total + len) {
      range.setEnd(node, end - total)
      return range
    }
    total += len
  }
  return null
}

/**
 * Find the span again: trust the stored offsets when they still match, otherwise
 * search for the text (preferring the occurrence with matching prefix).
 */
export function resolveSpan(
  text: string,
  span: { text: string; start: number; end: number; prefix?: string },
): { start: number; end: number } | null {
  if (text.slice(span.start, span.end) === span.text) return { start: span.start, end: span.end }
  if (span.prefix) {
    const i = text.indexOf(span.prefix + span.text)
    if (i !== -1) return { start: i + span.prefix.length, end: i + span.prefix.length + span.text.length }
  }
  const i = text.indexOf(span.text)
  return i === -1 ? null : { start: i, end: i + span.text.length }
}
