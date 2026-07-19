import type { ReactNode } from 'react'

type LegalLayoutProps = {
  title: string
  children: ReactNode
}

function LegalLayout({ title, children }: LegalLayoutProps) {
  return (
    <div className="flex-1 bg-background">
      <main className="mx-auto max-w-3xl px-6 pt-10 pb-24">
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
