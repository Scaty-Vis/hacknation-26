type SiteFooterProps = {
  onNavigateLegal: (page: 'imprint' | 'privacy') => void
}

function SiteFooter({ onNavigateLegal }: SiteFooterProps) {
  return (
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
  )
}

export default SiteFooter
