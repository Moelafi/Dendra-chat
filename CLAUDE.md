# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Dendra (formerly BranchChat) is a non-linear chat UI for OpenAI models: highlight text in a reply to bookmark it or ask about it in a branch. A conversation-map graph exists (`GraphView.tsx`) but is hidden behind `SHOW_MAP` in `App.tsx`. See `README.md` for user-facing details.

The sign-in splash uses `lib/delta.ts`. `lib/flow.ts`, `lib/orb.ts` + `lib/shader.ts` and their `*Background`/`ShaderCanvas` components are unused animation experiments kept on purpose.

## Commands

```bash
# Backend (browser version only). Needs backend/.env with OPENAI_API_KEY (see .env.example; optional MAX_OUTPUT_TOKENS)
cd backend && uv run uvicorn main:app --host 127.0.0.1 --port 8765 --reload

# Frontend (Vite on :5173, proxies /api to :8765)
cd frontend && npm install && npm run dev
npm run build          # tsc -b && vite build
npm run lint           # oxlint
npm test               # vitest run
npx vitest run src/db/ops.test.ts -t "<test name>"   # single test

# Desktop (Electron). Starts Vite itself if :5173 isn't already up; esbuild-watches main/preload and restarts Electron
cd desktop && npm install && npm run dev
npm run typecheck      # tsc --noEmit
npm run build          # esbuild -> dist/main.js (ESM) + dist/preload.cjs (CJS, required for sandboxed preload)
```

Backend port is 8765 on purpose (8000 is often taken). Desktop requires macOS 14+, Node 22.12+. The dev script strips `ELECTRON_RUN_AS_NODE` (set by VS Code terminals) so Electron doesn't run as plain Node.

## Architecture

Three packages, one React app:

- `frontend/` — React 19 + TS + Vite, Tailwind v4, React Flow (`@xyflow/react` + dagre) for the map, Dexie (IndexedDB) for all data, zustand for UI state (`src/store/ui.ts`, persisted).
- `backend/main.py` — stateless FastAPI proxy holding the OpenAI key. Endpoints `/api/models`, `/api/chat` (SSE: `delta` / `error` / `done` events, Responses API), `/api/title`. Stores nothing. `DEFAULT_MODEL` lives here.
- `desktop/` — Electron shell that loads the same frontend and calls ChatGPT via "Sign in with ChatGPT" on the user's own plan (no backend, no API key).

### Two transports, one surface

`frontend/src/api/client.ts` (`fetchModels`, `streamChat`, `fetchTitle`) picks the transport at runtime: if `window.dendra` exists (Electron preload bridge) it uses IPC, otherwise it hits the Python backend. When changing the bridge, keep **three places in sync**: `desktop/src/preload.ts`, the `DesktopBridge` type in `frontend/src/api/desktop.ts`, and the IPC handlers in `desktop/src/main.ts`. Each transport has its own `SYSTEM_PROMPT` (`backend/main.py`, `desktop/src/main.ts`); the desktop one deliberately doesn't mention Dendra.

Desktop security model: OAuth tokens never reach the renderer; they stay in the main process, encrypted via `safeStorage` (Keychain). IPC handlers reject callers whose origin isn't the renderer URL (`trusted()` in `main.ts`). The desktop route doesn't take a verbosity setting, so the reply-length picker is hidden there.

`desktop/vendor/siwc-local` is the `@siwc/local` SDK vendored **unmodified** (noncommercial license, not on npm). Don't edit it; to update, replace `src/` and bump the commit in `VENDORED.md`.

### Data model (frontend/src/db)

All conversation state is in IndexedDB (`db.ts`, types in `types.ts`, mutations in `ops.ts`, pure tree helpers in `tree.ts`):

- Every message is a **node** stored once with a `parentId`, so a conversation is a tree.
- A **thread** is a named path through the tree identified by its `headNodeId`; the main thread has `parentThreadId: null`. A branch hangs off the parent thread's head (`forkNodeId`) and inherits its context without copying.
- A message's model context is `pathTo(index, headId)` — root down to that node. Nodes with an `anchor` (snippet a branch was created from) are sent to the model quoted via `toModelContent()`.
- **Bookmarks** reference a node by character offsets into its rendered text.

Mutations go through `ops.ts` in Dexie transactions (append moves the thread head; thread delete returns a snapshot for undo via `restoreSnapshot`). Components read data reactively through `dexie-react-hooks` (`src/hooks/data.ts`).

### Streaming (frontend/src/lib/chat.ts)

`sendMessage` appends a user node and an empty assistant node with `status: 'streaming'`, then streams deltas into it, flushing to IndexedDB every ~50 ms; the UI re-renders from the DB rather than local state. Per-node `AbortController`s back `stop`/`retry`; final status is `complete` / `stopped` / `error`. After the first successful exchange, `autoTitle` names the conversation (main thread) or the branch. `recoverInterruptedStreams` cleans up nodes left `streaming` after a reload.

### Text selection & highlights

Bookmarks, branch anchors and jump-to "flash" are painted with the **CSS Custom Highlight API** (`lib/highlights.ts`), never by mutating the rendered markdown DOM. `lib/textOffsets.ts` converts between DOM ranges and plain-text character offsets of a message's rendered content, which is how spans are persisted.

### Tests

Vitest with `fake-indexeddb/auto`; existing tests (`src/db/ops.test.ts`) cover the DB ops and tree helpers, clearing all tables in `beforeEach`.

### Naming

The app was renamed from BranchChat to Dendra. Browser storage names (`branchchat` IndexedDB, `branchchat-ui` and `bc-*` localStorage keys) deliberately keep the old name so existing data survives; don't rename them without a migration. The desktop app moves `~/Library/Application Support/BranchChat` to `Dendra` once on startup (`migrateUserData` in `desktop/src/main.ts`).
