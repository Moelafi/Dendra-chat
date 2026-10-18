import { desktop } from './desktop'

export interface ApiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ModelList {
  models: string[]
  /** Display names, when the provider has them (desktop / ChatGPT plan). */
  labels?: Record<string, string>
  default: string
  error?: string
}

/*
 * Two transports with the same surface:
 * - desktop (Electron): the main process calls ChatGPT with the user's own plan.
 * - web: the Python backend calls the OpenAI API with the server's key.
 */

export async function fetchModels(): Promise<ModelList> {
  if (desktop) {
    const res = await desktop.listModels()
    if (!res.ok) return { models: [], default: '', error: res.error.message }
    const models = res.value.map((m) => m.id)
    return { models, labels: Object.fromEntries(res.value.map((m) => [m.id, m.name])), default: models[0] ?? '' }
  }
  const res = await fetch('/api/models')
  if (!res.ok) throw new Error(`Backend unavailable (${res.status})`)
  return res.json()
}

export async function fetchTitle(messages: ApiMessage[], model: string): Promise<string | null> {
  if (desktop) {
    const res = await desktop.title({ model, messages })
    return res.ok ? res.value || null : null
  }
  try {
    const res = await fetch('/api/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    })
    if (!res.ok) return null
    return (await res.json()).title ?? null
  } catch {
    return null
  }
}

/** Stream a reply, calling `onDelta` for every text chunk. Rejects on error; aborts via `signal`. */
export async function streamChat(
  model: string,
  messages: ApiMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal,
  verbosity: 'low' | 'medium' | 'high' = 'high',
): Promise<void> {
  if (desktop) return streamDesktop(model, messages, onDelta, signal)

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, verbosity }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`Backend error (${res.status})`)

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const event = /^event: (.*)$/m.exec(raw)?.[1]
      const data = /^data: (.*)$/m.exec(raw)?.[1]
      if (!event || !data) continue
      const payload = JSON.parse(data)
      if (event === 'delta') onDelta(payload.text)
      else if (event === 'error') throw new Error(payload.message)
      else if (event === 'done') return
    }
  }
  throw new Error('Stream ended unexpectedly')
}

async function streamDesktop(model: string, messages: ApiMessage[], onDelta: (text: string) => void, signal: AbortSignal) {
  const bridge = desktop!
  const id = crypto.randomUUID()
  const onAbort = () => bridge.cancel(id)
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    const res = await bridge.stream(id, { model, messages }, onDelta)
    if (!res.ok) {
      if (res.error.code === 'cancelled' || signal.aborted) throw new DOMException('Stopped', 'AbortError')
      throw new Error(res.error.message)
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
