type CallingPanelProps = {
  onStartOver: () => void
}

function CallingPanel({ onStartOver }: CallingPanelProps) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Calling vendors</h1>
        <p className="mt-1 text-muted-foreground">This step isn't built yet.</p>
      </div>

      <button
        type="button"
        onClick={onStartOver}
        className="self-start rounded-lg border border-border px-6 py-3 font-semibold text-foreground transition-colors hover:bg-card"
      >
        Start over
      </button>
    </div>
  )
}

export default CallingPanel
