import { Graph, layout } from '@dagrejs/dagre'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { memo, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { FiMaximize2, FiX } from 'react-icons/fi'
import { LuGitBranch, LuNetwork } from 'react-icons/lu'
import { indexNodes, pathTo } from '../db/tree'
import type { Bookmark, BookmarkColor, MsgNode, Thread } from '../db/types'
import { useActiveConversationId, useConversationData } from '../hooks/data'
import { openThread, useUI } from '../store/ui'
import { colorClass, THREAD_COLORS } from './colors'

const W = 190
const H = 54

type ExchangeData = {
  question: string
  color: string
  onPath: boolean
  current: boolean
  bookmarkColors: BookmarkColor[]
  isBranchStart: boolean
  streaming: boolean
  threadId: string
}

const ExchangeNode = memo(function ExchangeNode({ data }: NodeProps<Node<ExchangeData>>) {
  return (
    <div
      className={`rounded-xl border px-2.5 py-1.5 text-left transition ${
        data.current ? 'border-fg bg-raised' : data.onPath ? 'border-line-strong bg-surface' : 'border-line bg-panel opacity-60'
      }`}
      style={{ width: W, height: H }}
    >
      <Handle type="target" position={Position.Top} className="!size-1 !border-0 !bg-transparent" />
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: data.color }} />
        {data.isBranchStart && <LuGitBranch className="shrink-0 text-[10px] text-muted" />}
        {data.bookmarkColors.map((c) => (
          <span key={c} className={`size-1.5 shrink-0 rounded-full ${colorClass[c].dot}`} title="Has bookmarks" />
        ))}
        {data.streaming && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-fg" />}
      </div>
      <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{data.question}</div>
      <Handle type="source" position={Position.Bottom} className="!size-1 !border-0 !bg-transparent" />
    </div>
  )
})

const nodeTypes = { exchange: ExchangeNode }

/** One graph node per exchange (a user message and its reply). */
function buildGraph(nodes: MsgNode[], threads: Thread[], bookmarks: Bookmark[], currentId: string | null) {
  const index = indexNodes(nodes)
  const exchangeOf = (id: string | null | undefined): string | null => {
    const n = id ? index.get(id) : undefined
    if (!n) return null
    return n.role === 'user' ? n.id : n.parentId
  }
  const threadColor = new Map(
    [...threads].sort((a, b) => a.createdAt - b.createdAt).map((t, i) => [t.id, THREAD_COLORS[i % THREAD_COLORS.length]]),
  )
  const head = (tid: string | null) => threads.find((t) => t.id === tid)?.headNodeId ?? null
  const onPath = new Set(pathTo(index, head(currentId)).map((n) => n.id))
  const currentEx = exchangeOf(head(currentId))

  // Assistant replies and bookmarks fold into their exchange.
  const replyOf = new Map<string, MsgNode>()
  for (const n of nodes) if (n.role === 'assistant' && n.parentId) replyOf.set(n.parentId, n)

  const users = nodes.filter((n) => n.role === 'user')
  const rfNodes: Node<ExchangeData>[] = users.map((u) => {
    const reply = replyOf.get(u.id)
    return {
      id: u.id,
      type: 'exchange',
      position: { x: 0, y: 0 },
      data: {
        question: u.content,
        color: threadColor.get(u.threadId) ?? THREAD_COLORS[0],
        onPath: onPath.has(u.id),
        current: u.id === currentEx,
        bookmarkColors: [
          ...new Set(bookmarks.filter((b) => b.nodeId === u.id || b.nodeId === reply?.id).map((b) => b.color)),
        ],
        isBranchStart: !!u.anchor || threads.some((t) => t.id === u.threadId && t.parentThreadId && t.forkNodeId === u.parentId),
        streaming: reply?.status === 'streaming',
        threadId: u.threadId,
      },
    }
  })

  const edges: Edge[] = []
  for (const u of users) {
    const parent = exchangeOf(u.parentId)
    if (parent)
      edges.push({
        id: `t-${u.id}`,
        source: parent,
        target: u.id,
        type: 'smoothstep',
        style: { stroke: onPath.has(u.id) ? '#8a8a8a' : '#2a2a2a', strokeWidth: onPath.has(u.id) ? 1.5 : 1 },
      })
  }

  const g = new Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 36 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of rfNodes) g.setNode(n.id, { width: W, height: H })
  for (const e of edges) g.setEdge(e.source, e.target)
  layout(g)
  for (const n of rfNodes) {
    const p = g.node(n.id)
    n.position = { x: p.x - W / 2, y: p.y - H / 2 }
  }
  return { rfNodes, edges }
}

function Flow({ fullscreen }: { fullscreen: boolean }) {
  const conversationId = useActiveConversationId()
  const { nodes, threads, bookmarks } = useConversationData(conversationId)
  const currentThreadId = useUI((s) => s.currentThreadId)
  const { fitView } = useReactFlow()

  const { rfNodes, edges } = useMemo(
    () => buildGraph(nodes, threads, bookmarks, currentThreadId),
    [nodes, threads, bookmarks, currentThreadId],
  )

  // Refit when nodes are added or the panel is resized (debounced while dragging).
  const paneSize = useStore((st) => `${Math.round(st.width / 20)}x${Math.round(st.height / 20)}`)
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 250, maxZoom: 1.1 }), 60)
    return () => clearTimeout(t)
  }, [rfNodes.length, fullscreen, paneSize, fitView])

  if (!rfNodes.length)
    return <div className="flex h-full items-center justify-center px-6 text-center text-xs text-faint">The conversation map appears here once you start chatting.</div>

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      minZoom={0.15}
      onNodeClick={(_, n) => {
        void openThread(n.data.threadId, { nodeId: n.id })
        if (fullscreen) useUI.getState().setGraphFullscreen(false)
      }}
      colorMode="dark"
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#1c1c1c" />
      {fullscreen && <Controls showInteractive={false} />}
    </ReactFlow>
  )
}

export function GraphPanel() {
  const { graphFullscreen, setGraphFullscreen } = useUI()
  return (
    <>
      <section className="flex h-full min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 px-4">
          <LuNetwork className="text-muted" />
          <h2 className="flex-1 text-sm text-fg">Conversation map</h2>
          <button type="button" onClick={() => setGraphFullscreen(true)} className="rounded-lg p-1.5 text-faint transition hover:bg-surface hover:text-fg" title="Full screen">
            <FiMaximize2 />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {!graphFullscreen && (
            <ReactFlowProvider>
              <Flow fullscreen={false} />
            </ReactFlowProvider>
          )}
        </div>
      </section>
      {graphFullscreen &&
        createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-bg">
          <div className="flex h-14 items-center gap-2 border-b border-line px-5">
            <LuNetwork className="text-muted" />
            <h2 className="flex-1 text-sm text-fg">Conversation map</h2>
            <button type="button" onClick={() => setGraphFullscreen(false)} className="rounded-lg p-2 text-muted transition hover:bg-surface hover:text-fg" title="Close (Esc)">
              <FiX />
            </button>
          </div>
          <div className="flex-1">
            <ReactFlowProvider>
              <Flow fullscreen />
            </ReactFlowProvider>
          </div>
        </div>,
          document.body,
        )}
    </>
  )
}
