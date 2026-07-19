import type { ReactNode } from 'react'
import BrandMark from '../BrandMark'

type LegalLayoutProps = {
  title: string
  onBack: () => void
  children: ReactNode
}

function LegalLayout({ title, onBack, children }: LegalLayoutProps) {
  return (
    <div className="min-h-full bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <button type="button" onClick={onBack} className="cursor-pointer">
          <BrandMark />
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-card"
        >
          Back to home
        </button>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </main>
    </div>
  )
}

type LegalSectionProps = {
  title: string
  children: ReactNode
}

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  )
}

export default LegalLayout
