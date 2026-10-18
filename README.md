<div align="center">

<img src="frontend/public/favicon.svg" width="72" alt="Dendra logo" />

# Dendra

**A chat app for thinking in branches, not in one long scroll.**

Highlight any part of a reply to bookmark it, or ask about it in a side branch without derailing the main conversation.
Your chats never leave your computer.

React · TypeScript · IndexedDB · FastAPI · Electron

</div>

<!-- Add a screenshot or short GIF here, e.g. ![Dendra](docs/screenshot.png) -->

---

## The problem

Chat apps are linear. Real thinking isn't.

You ask a question, get a long answer, and three paragraphs in there's a term you don't understand. In a normal chat you have two bad options:

- **Ask about it inline.** The tangent buries the main thread. Ten messages later you're scrolling up trying to find where you left off, and the model's context is cluttered with side discussions.
- **Open a new chat.** You lose all the context, so you have to re-explain everything, and now your thinking is scattered across tabs.

Long answers also make good ideas hard to find again. The one sentence you cared about is somewhere in a wall of text from an hour ago.

## How Dendra solves it

Dendra treats a conversation as a **tree** instead of a list.

- **Branch from any snippet.** Select text in a reply and choose *Ask about this*. Your question opens in a new branch that already knows the whole conversation up to that point, quoted snippet included. The main thread stays clean.
- **Stay or jump in.** *Ask & open* (<kbd>Enter</kbd>) takes you into the branch. *Ask & stay* (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd>) lets it answer in the background while you keep reading.
- **Branches of branches.** Branch from a branch as deep as you like. A breadcrumb shows where you are (*Main › Branch › Sub-branch*), and Back / Forward work like in a browser.
- **Bookmarks with colours and notes.** Highlight a sentence and save it with a colour tag and an optional note. Bookmarks are painted right on the text and collected in a side panel you can search and filter by colour. Click one to jump straight back to that exact sentence.
- **Your messages as a table of contents.** The *Messages* tab lists every message you've sent in the chat, across all branches. Click one to jump to it.
- **Reading-friendly streaming.** When you send a message it moves to the top of the screen and the reply fills in below it. The page doesn't scroll on its own, so you can read at your own pace.
- **Close branches you're done with.** Delete a branch (and its sub-branches) from the breadcrumb, with undo.

## Your data stays on your machine

Dendra has **no server-side storage and no account system of its own.**

- **All chats live in your browser's IndexedDB** (via [Dexie](https://dexie.org)): conversations, branches, messages and bookmarks. Nothing is synced or uploaded anywhere.
- **The web version's backend is a stateless proxy.** It holds your OpenAI API key and streams the model's reply back, and that's it. It has no database and writes nothing to disk.
- **The model only sees what it needs.** Each request sends just the path from the start of the conversation to the message being answered, not your other branches or other chats.
- **In the desktop app, sign-in tokens never reach the UI.** They stay in Electron's main process, encrypted with the macOS Keychain (`safeStorage`) under `~/Library/Application Support/Dendra/`. The interface only ever sees your session status and the text of replies.
- **Deleting is really deleting.** Remove a chat or branch and it's gone from local storage. The desktop app and the browser version keep separate data.

Because storage is local, clearing your browser's site data (or deleting the app's data folder) erases your chats. There's no cloud copy.

### How conversations are stored

Every message is stored **once**, as a node that points to its parent, so a conversation is a tree. A *thread* is a named path through that tree. A branch hangs off a point in its parent thread, so it inherits all of that context without copying a single message.

| Store           | Holds                                                         |
|-----------------|---------------------------------------------------------------|
| `conversations` | title, main thread                                            |
| `threads`       | parent thread, head message, fork point, snippet it came from |
| `nodes`         | one message each: role, text, parent, status, quoted snippet  |
| `bookmarks`     | message + character range, colour, note                       |

Highlights are drawn with the [CSS Custom Highlight API](https://developer.mozilla.org/docs/Web/API/CSS_Custom_Highlight_API), so the rendered Markdown is never modified, and bookmarks are stored as plain character offsets.

## Two ways to run it

|                 | Desktop app (macOS)                                      | Web version                                  |
|-----------------|----------------------------------------------------------|----------------------------------------------|
| Pays for usage  | Your own **ChatGPT Plus or Pro** plan                    | Your **OpenAI API key** (pay per token)      |
| Needs           | macOS 14+, Node 22.12+                                    | Node 22.12+, Python 3.14+, [uv](https://docs.astral.sh/uv/) |
| How it connects | Sign in with ChatGPT, directly from the app              | A small local Python server holds the key   |

Both run the exact same React app. At runtime it checks whether it's inside Electron and picks the matching way to reach the model.

### Desktop app

```bash
cd desktop
npm install
npm run dev
```

This starts the frontend dev server if it isn't already running, builds the Electron main process and opens the Dendra window. Click **Continue with ChatGPT**, sign in in your browser and allow plan usage. Requests are then billed to your ChatGPT plan, which you can manage from the account menu at the bottom of the sidebar.

> If `npm run dev` starts Electron as plain Node, your terminal has `ELECTRON_RUN_AS_NODE` set (VS Code's terminal does this). The dev script removes it for the Electron process, but launching Electron another way may need `unset ELECTRON_RUN_AS_NODE`.

### Web version

```bash
# 1. Backend: put your key in backend/.env (see backend/.env.example)
cd backend
cp .env.example .env        # then edit OPENAI_API_KEY
uv run uvicorn main:app --host 127.0.0.1 --port 8765 --reload

# 2. Frontend, in a second terminal (proxies /api to :8765)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Optional backend settings in `backend/.env`:

- `MAX_OUTPUT_TOKENS`: caps reply length (unset means the model's maximum).
- The default model is `DEFAULT_MODEL` in `backend/main.py`. The model picker lists the chat models your key can use.

The backend runs on port 8765 because 8000 is often taken (e.g. by Docker).

## Project structure

```
frontend/   React app shared by both versions
  src/db/       IndexedDB schema, tree helpers and all data operations
  src/lib/      streaming, highlights, text offsets, splash animation
  src/api/      the two ways of reaching the model (Electron bridge or HTTP)
  src/components/
backend/    FastAPI proxy for the web version (one file: main.py)
desktop/    Electron shell with Sign in with ChatGPT
  src/main.ts     window, IPC handlers, ChatGPT session
  src/preload.ts  the only API the UI gets: session state and text streaming
```

## Development

```bash
cd frontend
npm test          # Vitest: data operations and conversation-tree logic
npm run lint      # oxlint
npm run build     # type-check and production build

cd desktop
npm run typecheck
```

**Tech stack:** React 19, TypeScript, Vite, Tailwind CSS 4, Dexie (IndexedDB), Zustand, react-markdown with syntax highlighting, FastAPI and the OpenAI Responses API (web), Electron (desktop).

## Licensing note

The desktop app's sign-in uses OpenAI's Sign in with ChatGPT SDK (`@siwc/local`). It isn't published on npm, so it's vendored unmodified in [`desktop/vendor/siwc-local`](desktop/vendor/siwc-local). It's under OpenAI's **noncommercial** DevKit license: fine for personal and open-source apps that run on your own machine, not for a paid product.
