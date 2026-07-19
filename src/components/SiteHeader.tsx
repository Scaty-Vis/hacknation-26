import { useConversationControls, useConversationStatus } from '@elevenlabs/react'
import BrandMark from './BrandMark'
import type { View } from '../types'

type SiteHeaderProps = {
  view: View
  onGetStarted: () => void
  onHome: () => void
}

function SiteHeader({ view, onGetStarted, onHome }: SiteHeaderProps) {
  const { status } = useConversationStatus()
  const { endSession } = useConversationControls()

  const goHome = () => {
    if (status === 'connected' || status === 'connecting') {
      endSession()
    }
    onHome()
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
      <button type="button" onClick={goHome} className="cursor-pointer">
        <BrandMark />
      </button>
      {view === 'landing' ? (
        <button
          type="button"
          onClick={onGetStarted}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Get started
        </button>
      ) : (
        <button
          type="button"
          onClick={goHome}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-background"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 11.5 12 4l9 7.5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
          </svg>
          Home
        </button>
      )}
    </header>
  )
}

export default SiteHeader
