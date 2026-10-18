import { app, BrowserWindow, ipcMain, safeStorage, shell, type IpcMainInvokeEvent } from 'electron'
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHATGPT_USAGE_URL, ChatGPTError, createChatGPT, type SessionState } from '../vendor/siwc-local/src/index.js'
import { createElectronCredentialEncryption } from './credential-encryption.js'

/**
 * Dendra desktop shell. The renderer is the React app in frontend/;
 * here it talks to ChatGPT through the user's own plan via Sign in with ChatGPT.
 * Tokens stay in this process (encrypted with the Keychain); the renderer only
 * ever sees session state and text.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const RENDERER_URL = process.env.DENDRA_RENDERER_URL ?? 'http://localhost:5173'
const rendererOrigin = new URL(RENDERER_URL).origin

const SYSTEM_PROMPT =
  "You are a capable, thoughtful, and precise assistant. Your goal is to deeply understand the user's intent, ask clarifying questions when needed, think step-by - step through complex problems, provide clear and accurate answers. Always prioritize being truthful, nuanced, insightful, and efficient, tailoring your responses specifically to the user's needs and preferences" +
  'Use Markdown for formatting and fenced code blocks with a language tag for code. ' +
  'When the user quotes an excerpt from earlier in the conversation, focus your answer on that excerpt.'

app.setName('Dendra')
app.setPath('userData', migrateUserData(app.getPath('appData')))

/**
 * The app used to be called BranchChat. Move its data folder (chats live in its IndexedDB) once.
 * Saved ChatGPT credentials are set aside: they're encrypted with a Keychain key tied to the
 * old app name, so the user signs in again once.
 */
function migrateUserData(appData: string): string {
  const dir = join(appData, 'Dendra')
  const legacy = join(appData, 'BranchChat')
  if (!existsSync(dir) && existsSync(legacy)) {
    renameSync(legacy, dir)
    const creds = join(dir, 'chatgpt')
    if (existsSync(creds)) renameSync(creds, join(dir, 'chatgpt-branchchat'))
  }
  return dir
}

const chatgpt = createChatGPT({
  appName: 'Dendra',
  appId: 'dendra',
  redirectPort: Number(process.env.DENDRA_REDIRECT_PORT ?? 8787),
  storageDir: join(app.getPath('userData'), 'chatgpt'),
  credentialEncryption: createElectronCredentialEncryption(safeStorage, () => app.isReady()),
  sendHostId: true,
  openBrowser: async (url: string) => {
    const target = new URL(url)
    if (target.origin !== 'https://auth.openai.com') throw new Error('Unexpected sign-in destination.')
    await shell.openExternal(target.href)
  },
})

type AppError = { code: string; message: string; retryable: boolean }
type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }

function toAppError(error: unknown): AppError {
  if (error instanceof ChatGPTError) return { code: error.code, message: error.message, retryable: error.retryable }
  return { code: 'unexpected', message: error instanceof Error ? error.message : String(error), retryable: true }
}

async function result<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await work() }
  } catch (error) {
    return { ok: false, error: toAppError(error) }
  }
}

/** Only our own renderer may call into the main process. */
function trusted(event: { senderFrame: { url: string } | null }): boolean {
  try {
    return !!event.senderFrame && new URL(event.senderFrame.url).origin === rendererOrigin
  } catch {
    return false
  }
}

function handle<A extends unknown[], T>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: A) => Promise<Result<T>>,
) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event))
      return { ok: false, error: { code: 'forbidden', message: 'Untrusted caller.', retryable: false } }
    return fn(event, ...(args as A))
  })
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function registerIpc() {
  handle('chatgpt:getSession', () => result(() => chatgpt.getSession()))
  handle('chatgpt:signIn', (_e, opts?: { reconsent?: boolean }) =>
    result(() => chatgpt.signIn(opts?.reconsent ? { reconsent: true } : {})),
  )
  handle('chatgpt:disconnect', () => result(() => chatgpt.disconnect()))
  handle('chatgpt:listModels', () =>
    result(async () => (await chatgpt.listModels()).map((m) => ({ id: m.slug, name: m.displayName }))),
  )
  ipcMain.on('chatgpt:cancelSignIn', (event) => trusted(event) && chatgpt.cancelSignIn())
  ipcMain.on('chatgpt:openUsage', (event) => trusted(event) && void shell.openExternal(CHATGPT_USAGE_URL))

  // Streaming: deltas go back as 'chat:delta' events tagged with the request id.
  const streams = new Map<string, AbortController>()
  handle('chat:stream', (event, req: { id: string; model: string; messages: ChatMessage[] }) =>
    result(async () => {
      const controller = new AbortController()
      streams.set(req.id, controller)
      try {
        await chatgpt.streamResponse({
          model: req.model,
          input: req.messages.map((m) => ({ role: m.role, content: m.content })),
          instructions: SYSTEM_PROMPT,
          signal: controller.signal,
          onDelta: (delta) => {
            if (!event.sender.isDestroyed()) event.sender.send('chat:delta', req.id, delta)
          },
        })
      } finally {
        streams.delete(req.id)
      }
    }),
  )
  ipcMain.on('chat:cancel', (event, id: string) => trusted(event) && streams.get(id)?.abort())

  handle('chat:title', (_e, req: { model: string; messages: ChatMessage[] }) =>
    result(async () => {
      const transcript = req.messages
        .slice(-4)
        .map((m) => `${m.role}: ${m.content.slice(0, 1500)}`)
        .join('\n\n')
      const { text } = await chatgpt.streamResponse({
        model: req.model,
        instructions:
          'Write a short title (max 6 words) for this conversation. Reply with the title only, no quotes or punctuation at the end.',
        input: transcript,
      })
      return text.trim().replace(/^"|"$/g, '').trim().slice(0, 80)
    }),
  )
}

function broadcastSession(session: SessionState) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('chatgpt:session', session)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    title: 'Dendra',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  // Links in replies open in the default browser; the window never leaves the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== rendererOrigin) {
      event.preventDefault()
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    }
  })

  void win.loadURL(RENDERER_URL)
}

app.whenReady().then(() => {
  registerIpc()
  chatgpt.subscribe(broadcastSession)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
