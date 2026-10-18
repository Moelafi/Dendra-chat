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
 * The model is reached through the Electron main process, which calls ChatGPT
 * with the user's own plan. Outside the desktop app there is no bridge.
 */

const NO_BRIDGE = 'Dendra needs the desktop app to reach the model (cd desktop && npm run dev).'

export async function fetchModels(): Promise<ModelList> {
  if (!desktop) return { models: [], default: '', error: NO_BRIDGE }
  const res = await desktop.listModels()
  if (!res.ok) return { models: [], default: '', error: res.error.message }
  const models = res.value.map((m) => m.id)
  return { models, labels: Object.fromEntries(res.value.map((m) => [m.id, m.name])), default: models[0] ?? '' }
}

export async function fetchTitle(messages: ApiMessage[], model: string): Promise<string | null> {
  if (!desktop) return null
  const res = await desktop.title({ model, messages })
  return res.ok ? res.value || null : null
}

/** Stream a reply, calling `onDelta` for every text chunk. Rejects on error; aborts via `signal`. */
export async function streamChat(
  model: string,
  messages: ApiMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!desktop) throw new Error(NO_BRIDGE)
  const bridge = desktop
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
