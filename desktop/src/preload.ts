import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/**
 * The only surface the renderer gets: session state, sign-in actions and text
 * streaming. No tokens, no Node APIs. Mirrors `DesktopBridge` in
 * frontend/src/api/desktop.ts; keep the two in sync.
 */
contextBridge.exposeInMainWorld('dendra', {
  isDesktop: true,

  getSession: () => ipcRenderer.invoke('chatgpt:getSession'),
  onSession: (listener: (session: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, session: unknown) => listener(session)
    ipcRenderer.on('chatgpt:session', handler)
    return () => ipcRenderer.removeListener('chatgpt:session', handler)
  },
  signIn: (opts?: { reconsent?: boolean }) => ipcRenderer.invoke('chatgpt:signIn', opts),
  cancelSignIn: () => ipcRenderer.send('chatgpt:cancelSignIn'),
  signOut: () => ipcRenderer.invoke('chatgpt:disconnect'),
  openUsage: () => ipcRenderer.send('chatgpt:openUsage'),
  listModels: () => ipcRenderer.invoke('chatgpt:listModels'),

  stream: (
    id: string,
    payload: { model: string; messages: { role: 'user' | 'assistant'; content: string }[] },
    onDelta: (delta: string) => void,
  ) => {
    const handler = (_event: IpcRendererEvent, requestId: string, delta: string) => {
      if (requestId === id) onDelta(delta)
    }
    ipcRenderer.on('chat:delta', handler)
    return ipcRenderer
      .invoke('chat:stream', { id, ...payload })
      .finally(() => ipcRenderer.removeListener('chat:delta', handler))
  },
  cancel: (id: string) => ipcRenderer.send('chat:cancel', id),
  title: (payload: { model: string; messages: { role: 'user' | 'assistant'; content: string }[] }) =>
    ipcRenderer.invoke('chat:title', payload),
})
