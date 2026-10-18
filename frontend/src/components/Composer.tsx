import { useRef, useState } from 'react'
import { FiArrowUp, FiCheck, FiChevronDown, FiSquare } from 'react-icons/fi'
import { useOnClickOutside } from 'usehooks-ts'
import { sendMessage, stop } from '../lib/chat'
import { desktop } from '../api/desktop'
import { useUI, type Verbosity } from '../store/ui'

interface Props {
  threadId: string | null
  /** Id of the assistant message currently streaming in this thread, if any. */
  streamingNodeId: string | null
  placeholder?: string
  onStarted?: (threadId: string) => void
  autoFocus?: boolean
}

export function Composer({ threadId, streamingNodeId, placeholder, onStarted, autoFocus }: Props) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const model = useUI((s) => s.model)

  function submit() {
    const value = text.trim()
    if (!value || streamingNodeId || !model) return
    setText('')
    if (ref.current) ref.current.style.height = 'auto'
    void sendMessage(threadId, value, model, undefined, onStarted)
  }

  return (
    <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-line bg-panel transition focus-within:border-line-strong">
      <textarea
        ref={ref}
        value={text}
        autoFocus={autoFocus}
        rows={1}
        onChange={(e) => {
          setText(e.target.value)
          const el = e.target
          el.style.height = 'auto'
          el.style.height = `${Math.min(el.scrollHeight, 240)}px`
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder={placeholder ?? 'Ask anything…'}
        className="scrollbar-thin block max-h-60 w-full resize-none bg-transparent px-5 pt-4 pb-1 text-[15px] text-fg placeholder:text-faint focus:outline-none"
      />
      <div className="flex items-center justify-between px-3 pb-3">
        <div className="flex items-center gap-1.5">
          <ModelPicker />
          {/* Reply length maps to API verbosity, which the ChatGPT-plan route doesn't take. */}
          {!desktop && <LengthPicker />}
        </div>
        {streamingNodeId ? (
          <button
            type="button"
            onClick={() => stop(streamingNodeId)}
            className="flex size-9 items-center justify-center rounded-full bg-fg text-bg transition hover:bg-white"
            title="Stop generating"
          >
            <FiSquare className="size-3 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || !model}
            className="flex size-9 items-center justify-center rounded-full bg-fg text-bg transition hover:bg-white disabled:bg-raised disabled:text-faint"
            title="Send (Enter)"
          >
            <FiArrowUp className="text-lg" />
          </button>
        )}
      </div>
    </div>
  )
}

const LENGTHS: { value: Verbosity; label: string; hint: string }[] = [
  { value: 'low', label: 'Concise', hint: 'Short, to the point' },
  { value: 'medium', label: 'Balanced', hint: 'The model default' },
  { value: 'high', label: 'Detailed', hint: 'Longer, thorough replies' },
]

function LengthPicker() {
  const { verbosity, setVerbosity } = useUI()
  return (
    <Dropdown label={LENGTHS.find((l) => l.value === verbosity)?.label ?? 'Detailed'} title="Reply length">
      {(close) =>
        LENGTHS.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => {
              setVerbosity(l.value)
              close()
            }}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-surface ${
              l.value === verbosity ? 'text-fg' : 'text-muted'
            }`}
          >
            <span>
              <span className="block text-[13px]">{l.label}</span>
              <span className="block text-xs text-faint">{l.hint}</span>
            </span>
            {l.value === verbosity && <FiCheck className="text-fg" />}
          </button>
        ))
      }
    </Dropdown>
  )
}

/** Pill button that opens a small menu above the composer. */
function Dropdown({ label, title, children }: { label: string; title?: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOnClickOutside(ref as React.RefObject<HTMLElement>, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={title}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-line-strong hover:text-fg"
      >
        <span>{label}</span>
        <FiChevronDown className="text-faint" />
      </button>
      {open && (
        <div className="scrollbar-thin absolute bottom-full left-0 z-40 mb-2 max-h-72 w-56 overflow-y-auto rounded-2xl border border-line bg-panel p-1.5 shadow-2xl shadow-black">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function ModelPicker() {
  const { models, modelLabels, model, setModel } = useUI()
  return (
    <Dropdown label={modelLabels[model] ?? (model || (desktop ? 'No models' : 'No backend'))} title="Model">
      {(close) =>
        models.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setModel(m)
              close()
            }}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] hover:bg-surface ${
              m === model ? 'text-fg' : 'text-muted'
            }`}
          >
            {modelLabels[m] ?? m}
            {m === model && <FiCheck className="text-fg" />}
          </button>
        ))
      }
    </Dropdown>
  )
}
