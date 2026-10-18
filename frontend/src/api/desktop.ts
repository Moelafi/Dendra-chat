/**
 * The Electron preload bridge (desktop/src/preload.ts). Present only in the
 * desktop app; in a normal browser `desktop` is undefined and the app uses the
 * Python backend instead. Keep these types in sync with the preload.
 */

export interface SessionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reauth_required'
  /** Signed in and allowed to use the ChatGPT plan for requests. */
  sharing: boolean
  profileId?: string
  profileLabel?: string
  identity?: { name?: string; email?: string }
  error?: { code: string; message: string; retryable: boolean }
}

export interface DesktopError {
  code: string
  message: string
  retryable: boolean
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: DesktopError }

type Msg = { role: 'user' | 'assistant'; content: string }

export interface DesktopBridge {
  isDesktop: true
  getSession(): Promise<Result<SessionState>>
  onSession(listener: (session: SessionState) => void): () => void
  signIn(opts?: { reconsent?: boolean }): Promise<Result<SessionState>>
  cancelSignIn(): void
  signOut(): Promise<Result<void>>
  openUsage(): void
  listModels(): Promise<Result<{ id: string; name: string }[]>>
  stream(id: string, payload: { model: string; messages: Msg[] }, onDelta: (delta: string) => void): Promise<Result<void>>
  cancel(id: string): void
  title(payload: { model: string; messages: Msg[] }): Promise<Result<string>>
}

declare global {
  interface Window {
    dendra?: DesktopBridge
  }
}

export const desktop: DesktopBridge | undefined = typeof window !== 'undefined' ? window.dendra : undefined
