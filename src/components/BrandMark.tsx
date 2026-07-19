function SparkleMark() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-[0_20px_60px_-20px_oklch(0.72_0.16_42_/_0.45)]">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-primary-foreground" fill="currentColor">
        <path d="M12 2l1.8 5.6L19 9.4l-5.2 1.8L12 17l-1.8-5.8L5 9.4l5.2-1.8L12 2z" />
      </svg>
    </div>
  )
}

type BrandMarkProps = {
  className?: string
}

function BrandMark({ className }: BrandMarkProps) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <SparkleMark />
      <span className="font-display text-lg font-semibold tracking-tight">Bidly</span>
    </div>
  )
}

export default BrandMark
