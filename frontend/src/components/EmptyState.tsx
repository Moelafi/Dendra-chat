import { FiBookmark } from 'react-icons/fi'
import { LuGitBranch, LuNetwork } from 'react-icons/lu'
import { navigate } from '../store/ui'
import { Composer } from './Composer'

const tips = [
  { icon: FiBookmark, title: 'Bookmark', body: 'Highlight any text to save it with a tag and a note.' },
  { icon: LuGitBranch, title: 'Branch', body: 'Ask about a snippet without derailing the main thread.' },
  { icon: LuNetwork, title: 'Map', body: 'See every branch at a glance and jump between them.' },
]

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 pb-16 md:px-6">
      <h1 className="mb-8 text-center text-3xl font-normal tracking-tight text-fg md:text-[40px]">
        What would you like to explore?
      </h1>
      <Composer threadId={null} streamingNodeId={null} autoFocus onStarted={(id) => navigate(id, undefined, { replace: true })} />
      <div className="mt-14 grid w-full max-w-3xl gap-6 sm:grid-cols-3">
        {tips.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex flex-col items-center text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-surface text-lg text-muted">
              <Icon />
            </div>
            <div className="text-sm text-fg">{title}</div>
            <div className="mt-1 max-w-52 text-[13px] leading-relaxed text-faint">{body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
