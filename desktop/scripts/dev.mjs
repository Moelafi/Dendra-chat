// Dev runner: Vite (renderer, hot reload) + esbuild watch (main/preload) + Electron.
// Reuses a Vite server already running on the renderer URL. Electron restarts
// when main or preload code changes. Closing the window stops everything.
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import * as esbuild from 'esbuild'
import { builds } from './build-config.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RENDERER_URL = process.env.DENDRA_RENDERER_URL ?? 'http://localhost:5173'

const isUp = () => fetch(RENDERER_URL).then((r) => r.ok, () => false)

let vite
if (await isUp()) {
  console.log(`[dev] using renderer already running at ${RENDERER_URL}`)
} else {
  console.log('[dev] starting Vite…')
  vite = spawn('npm', ['run', 'dev'], { cwd: resolve(root, '../frontend'), stdio: 'inherit' })
  for (let i = 0; !(await isUp()); i++) {
    if (i > 120) throw new Error(`Renderer did not start at ${RENDERER_URL}`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

let electron
let quitting = false
function startElectron() {
  // VS Code terminals export ELECTRON_RUN_AS_NODE=1, which would run Electron as plain Node.
  const env = { ...process.env, DENDRA_RENDERER_URL: RENDERER_URL }
  delete env.ELECTRON_RUN_AS_NODE
  electron = spawn(electronPath, ['.'], { cwd: root, env, stdio: 'inherit' })
  electron.on('exit', (_code, signal) => {
    if (signal !== 'SIGTERM' && !quitting) shutdown()
  })
}
function restartElectron() {
  if (!electron) return startElectron()
  electron.once('exit', startElectron)
  electron.kill('SIGTERM')
}
function shutdown() {
  quitting = true
  electron?.kill('SIGTERM')
  vite?.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', shutdown)

// Start Electron once every bundle has built; restart it on any later rebuild.
let pending = builds.length
for (const options of builds) {
  let first = true
  const ctx = await esbuild.context({
    ...options,
    plugins: [{
      name: 'restart-electron',
      setup: (b) => b.onEnd((r) => {
        if (r.errors.length) return
        if (first) {
          first = false
          if (--pending === 0) startElectron()
        } else {
          restartElectron()
        }
      }),
    }],
  })
  await ctx.watch()
}
