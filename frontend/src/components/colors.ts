import type { BookmarkColor } from '../db/types'

export const colorClass: Record<BookmarkColor, { dot: string; bar: string; label: string }> = {
  yellow: { dot: 'bg-yellow-400', bar: 'border-yellow-400', label: 'Important' },
  green: { dot: 'bg-emerald-400', bar: 'border-emerald-400', label: 'Insight' },
  blue: { dot: 'bg-sky-400', bar: 'border-sky-400', label: 'To do' },
  pink: { dot: 'bg-pink-400', bar: 'border-pink-400', label: 'Question' },
  purple: { dot: 'bg-violet-400', bar: 'border-violet-400', label: 'Idea' },
}

/** Muted per-thread marker colours for the graph (main thread first). */
export const THREAD_COLORS = ['#e5e5e5', '#7dd3fc', '#c4b5fd', '#86efac', '#fcd34d', '#f9a8d4', '#93c5fd', '#fdba74']
