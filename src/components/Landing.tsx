import BrandMark from './BrandMark'

type LandingProps = {
  onGetStarted: () => void
  onNavigateLegal: (page: 'imprint' | 'privacy') => void
}

const TRUST_ITEMS = ['No forms to fill', 'Real vendor calls', 'Side-by-side offers']

const STEPS = [
  {
    number: '01',
    title: 'Voice intake',
    description: 'A quick call with our AI collects everything about your event — date, guests, budget, vibe.',
  },
  {
    number: '02',
    title: 'We call vendors',
    description: 'Bidly places structured calls to matching vendors and negotiates on your behalf.',
  },
  {
    number: '03',
    title: 'Compare offers',
    description: 'Review every quote side by side and pick the deal that fits you best.',
  },
]

function Landing({ onGetStarted, onNavigateLegal }: LandingProps) {
  return (
    <div className="min-h-full bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandMark />
        <button
          type="button"
          onClick={onGetStarted}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Get started
        </button>
      </header>

      <section
        className="relative overflow-hidden px-6 pt-16 pb-24 text-center"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 60% at 50% 0%, oklch(0.72 0.16 42 / 0.35), transparent 60%)',
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-col items-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Voice-first event sourcing
          </span>

          <h1 className="mt-6 font-display text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
            Talk once.
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Get the best deal
            </span>{' '}
            for your event.
          </h1>

          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Tell Bidly about your event in a short voice call. We'll call vendors on your behalf and bring back the
            best offers — all in one place.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={onGetStarted}
              className="rounded-lg bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-[0_20px_60px_-20px_oklch(0.72_0.16_42_/_0.45)] transition-opacity hover:opacity-90"
            >
              Get started
            </button>
            <a
              href="#how-it-works"
              className="rounded-lg border border-border px-8 py-3 text-base font-semibold text-foreground transition-colors hover:bg-card"
            >
              How it works
            </a>
          </div>

          <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {TRUST_ITEMS.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <span className="text-sm font-semibold tracking-wide text-primary uppercase">The workflow</span>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">Three steps. That's it.</h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="rounded-2xl border border-border bg-card p-6 text-left transition-colors hover:border-primary/50"
            >
              <span className="font-mono text-sm text-muted-foreground">{step.number}</span>
              <h3 className="mt-3 font-display text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-3xl border border-border bg-card px-8 py-12 text-center">
          <h3 className="font-display text-2xl font-semibold tracking-tight">
            Ready to source your next event without lifting a phone?
          </h3>
          <button
            type="button"
            onClick={onGetStarted}
            className="mt-6 rounded-lg bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-[0_20px_60px_-20px_oklch(0.72_0.16_42_/_0.45)] transition-opacity hover:opacity-90"
          >
            Start the voice intake
          </button>
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Bidly. Voice-first event sourcing.</p>
        <p className="mt-2 flex items-center justify-center gap-4">
          <button type="button" onClick={() => onNavigateLegal('imprint')} className="hover:text-foreground">
            Imprint
          </button>
          <button type="button" onClick={() => onNavigateLegal('privacy')} className="hover:text-foreground">
            Privacy Policy
          </button>
        </p>
      </footer>
    </div>
  )
}

export default Landing
