import { useMemo, useState } from 'react'
import { conversationRecordingUrl, fetchCallResult } from '../../lib/eventbidApi'
import type {
  EventBidCallResult,
  EventBidExecutionMode,
  EventBidWorkflow,
} from '../../lib/eventbidTypes'

type AnalysisPanelProps = {
  workflow: EventBidWorkflow
  onStartOver: () => void
}

const buttonSecondary =
  'rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40'

function formatMoney(value: number | null) {
  return value === null
    ? 'Not confirmed'
    : new Intl.NumberFormat('en-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function eligibilityLabel(value: boolean | null) {
  if (value === true) return 'Eligible'
  if (value === false) return 'Not eligible'
  return 'Pending'
}

function modeLabel(mode: EventBidExecutionMode) {
  if (mode === 'agent_simulation') return 'AI simulation'
  if (mode === 'browser_voice') return 'Browser voice'
  return 'Real phone'
}

function transcriptEntries(value: unknown): { role: string; message: string }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const message =
      typeof item.message === 'string'
        ? item.message
        : typeof item.text === 'string'
          ? item.text
          : ''
    if (!message) return []
    return [{ role: typeof item.role === 'string' ? item.role : 'speaker', message }]
  })
}

function AnalysisPanel({ workflow, onStartOver }: AnalysisPanelProps) {
  const [results, setResults] = useState<Record<string, EventBidCallResult>>(() =>
    Object.fromEntries(
      workflow.jobs
        .filter((job) => job.result)
        .map((job) => [
          `${job.vendor_id}:${job.call_phase}`,
          job.result as EventBidCallResult,
        ]),
    ),
  )
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allResults = useMemo(() => Object.values(results), [results])
  const finalResults = useMemo(() => {
    const byVendor = new Map<string, EventBidCallResult>()
    for (const result of allResults) {
      const current = byVendor.get(result.vendor_id)
      if (!current || result.call_phase === 'leverage_negotiation') {
        byVendor.set(result.vendor_id, result)
      }
    }
    return [...byVendor.values()]
  }, [allResults])
  const openingResults = useMemo(
    () =>
      new Map(
        allResults
          .filter((result) => result.call_phase === 'quote_collection')
          .map((result) => [result.vendor_id, result]),
      ),
    [allResults],
  )
  const rankedResults = useMemo(
    () =>
      [...finalResults].sort((a, b) => {
        if (a.quote.fixed_total_eur === null) return 1
        if (b.quote.fixed_total_eur === null) return -1
        return a.quote.fixed_total_eur - b.quote.fixed_total_eur
      }),
    [finalResults],
  )
  const recommendation =
    rankedResults.find(
      (result) => result.eligibility.eligible !== false && result.quote.quote_complete,
    ) ?? rankedResults[0]

  const pendingJobs = workflow.jobs.filter(
    (job) => job.success && job.conversation_id && !job.result,
  )
  const failedJobs = workflow.jobs.filter((job) => !job.success)

  const refreshResults = async () => {
    if (!pendingJobs.length) return
    setRefreshing(true)
    setError(null)
    const fetched = await Promise.allSettled(
      pendingJobs.map(async (job) => ({
        key: `${job.vendor_id}:${job.call_phase}`,
        result: await fetchCallResult(
          workflow.event.event_id,
          job.vendor_id,
          job.conversation_id as string,
        ),
      })),
    )
    const completed = fetched.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : []))
    if (completed.length) {
      setResults((current) => ({
        ...current,
        ...Object.fromEntries(completed.map((item) => [item.key, item.result])),
      }))
    }
    const unavailable = fetched.length - completed.length
    if (unavailable > 0) {
      setError(`${unavailable} conversation result${unavailable === 1 ? ' is' : 's are'} still processing.`)
    }
    setRefreshing(false)
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Quote analysis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Offers are ranked by confirmed fixed price only.
          </p>
        </div>
        <div className="flex gap-3">
          {pendingJobs.length > 0 && (
            <button type="button" onClick={refreshResults} disabled={refreshing} className={buttonSecondary}>
              {refreshing ? 'Refreshing...' : 'Refresh results'}
            </button>
          )}
          <button type="button" onClick={onStartOver} className={buttonSecondary}>
            Start over
          </button>
        </div>
      </div>

      <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs md:grid-cols-4">
        {[
          ['1', 'Event ready', true],
          ['2', `${workflow.vendors.filter((vendor) => vendor.approved_for_contact).length} vendors approved`, true],
          ['3', `${workflow.jobs.filter((job) => job.success).length} conversations`, workflow.jobs.some((job) => job.success)],
          ['4', `${rankedResults.length} quotes ranked`, rankedResults.length > 0],
        ].map(([number, label, complete]) => (
          <li key={String(number)} className="flex items-center gap-2 bg-background px-4 py-3">
            <span className={`font-semibold ${complete ? 'text-primary' : 'text-muted-foreground'}`}>
              {number}
            </span>
            <span className={complete ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
          </li>
        ))}
      </ol>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {failedJobs.length > 0 && (
        <section className="border-b border-border pb-5">
          <h2 className="text-sm font-semibold text-foreground">Incomplete conversations</h2>
          {failedJobs.map((job) => (
            <p key={`${job.vendor_id}-${job.timestamp}`} className="mt-1 text-sm text-muted-foreground">
              {job.vendor_name}: {job.message}
            </p>
          ))}
        </section>
      )}

      {workflow.jobs.length === 0 && (
        <section className="border-b border-border pb-6">
          <h2 className="text-base font-semibold text-foreground">No conversations completed</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Return to the calling step and choose AI simulation, browser voice, or an authorised phone call.
          </p>
        </section>
      )}

      {workflow.jobs.length > 0 && rankedResults.length === 0 && (
        <section className="border-b border-border pb-6">
          <h2 className="text-base font-semibold text-foreground">
            {workflow.jobs.length} conversation job{workflow.jobs.length === 1 ? '' : 's'} recorded
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Refresh after ElevenLabs finishes processing the transcript and analysis.
          </p>
        </section>
      )}

      {recommendation && (
        <section className="border-y border-border py-5">
          <p className="text-xs font-semibold text-primary">Recommended deal</p>
          <div className="mt-1 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-xl font-semibold text-foreground">
                {recommendation.vendor_name}
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Lowest complete fixed price among the eligible quotations. The recommendation uses
                price as the only ranking criterion.
              </p>
              {recommendation.negotiation?.price_changed && (
                <p className="mt-2 text-sm font-medium text-foreground">
                  Leverage reduced the offer by{' '}
                  {formatMoney(recommendation.negotiation.savings_eur)} from{' '}
                  {formatMoney(recommendation.negotiation.opening_total_eur)}.
                </p>
              )}
            </div>
            <p className="text-xl font-semibold text-foreground">
              {formatMoney(recommendation.quote.fixed_total_eur)}
            </p>
          </div>
        </section>
      )}

      {rankedResults.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-200 border-collapse text-left text-sm">
              <thead className="bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Venue</th>
                  <th className="px-4 py-3">Fixed total</th>
                  <th className="px-4 py-3">Eligibility</th>
                  <th className="px-4 py-3">Quote</th>
                  <th className="px-4 py-3">Negotiation</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {rankedResults.map((result, index) => (
                  <tr key={result.vendor_id} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-foreground">{index + 1}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{result.vendor_name}</td>
                    <td className="px-4 py-3 text-foreground">{formatMoney(result.quote.fixed_total_eur)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {eligibilityLabel(result.eligibility.eligible)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {result.quote.quote_complete ? 'Complete' : 'Incomplete'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {result.negotiation?.price_changed
                        ? `${formatMoney(result.negotiation.savings_eur)} saved`
                        : 'Opening price'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {modeLabel(result.execution_mode)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {rankedResults.map((result) => {
        const openingResult = openingResults.get(result.vendor_id)
        const evidenceRounds =
          result.call_phase === 'leverage_negotiation' && openingResult
            ? [openingResult, result]
            : [result]
        return (
          <section key={result.vendor_id} className="border-b border-border pb-6">
            <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-base font-semibold text-foreground">{result.vendor_name}</h2>
                  <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {modeLabel(result.execution_mode)}
                  </span>
                  {result.negotiation?.style_label && (
                    <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {result.negotiation.style_label}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {String(result.call_summary ?? 'No conversation summary is available yet.')}
                </p>
                {result.negotiation?.price_changed && (
                  <div className="mt-4 border-l-2 border-primary pl-3">
                    <p className="text-sm font-semibold text-foreground">
                      Price moved from {formatMoney(result.negotiation.opening_total_eur)} to{' '}
                      {formatMoney(result.negotiation.final_total_eur)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {result.negotiation.evidence}
                    </p>
                  </div>
                )}
                <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Fixed total</dt>
                    <dd className="mt-0.5 font-semibold text-foreground">
                      {formatMoney(result.quote.fixed_total_eur)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Venue fee</dt>
                    <dd className="mt-0.5 text-foreground">{formatMoney(result.quote.venue_fee_eur)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Catering</dt>
                    <dd className="mt-0.5 text-foreground">{formatMoney(result.quote.catering_fee_eur)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Cleaning</dt>
                    <dd className="mt-0.5 text-foreground">{formatMoney(result.quote.cleaning_fee_eur)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Deposit</dt>
                    <dd className="mt-0.5 text-foreground">
                      {result.commercial_terms.deposit_percent === null
                        ? 'Not confirmed'
                        : `${result.commercial_terms.deposit_percent}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Tax included</dt>
                    <dd className="mt-0.5 text-foreground">
                      {result.quote.tax_included === null
                        ? 'Unknown'
                        : result.quote.tax_included
                          ? 'Yes'
                          : 'No'}
                    </dd>
                  </div>
                </dl>
                {result.simulation_ground_truth && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    {result.simulation_ground_truth.note}
                  </p>
                )}
                {result.recording?.available && result.conversation_id && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-muted-foreground">Call recording</p>
                    <audio
                      controls
                      preload="none"
                      className="mt-2 h-10 w-full"
                      src={conversationRecordingUrl(
                        workflow.event.event_id,
                        result.conversation_id,
                      )}
                    >
                      Audio playback is not supported by this browser.
                    </audio>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {result.recording.note}
                    </p>
                  </div>
                )}
              </div>
              <details className="rounded-lg border border-border bg-card px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-foreground">
                  Transcript evidence
                </summary>
                <div className="mt-3 max-h-96 space-y-4 overflow-y-auto">
                  {evidenceRounds.map((round) => {
                    const transcript = transcriptEntries(round.transcript)
                    return (
                      <div key={`${round.vendor_id}-${round.call_phase}`}>
                        <p className="mb-2 text-xs font-semibold text-primary">
                          {round.call_phase === 'leverage_negotiation'
                            ? 'Leverage follow-up'
                            : 'Opening quote'}
                        </p>
                        {transcript.length > 0 ? (
                          transcript.map((entry, index) => (
                            <p key={`${entry.role}-${index}`} className="mb-2 text-xs">
                              <span className="font-semibold text-foreground">
                                {entry.role === 'agent' ? 'Agent: ' : 'Venue: '}
                              </span>
                              <span className="text-muted-foreground">{entry.message}</span>
                            </p>
                          ))
                        ) : (
                          <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                            {JSON.stringify(round.transcript, null, 2)}
                          </pre>
                        )}
                      </div>
                    )
                  })}
                </div>
              </details>
            </div>
          </section>
        )
      })}

      <p className="text-xs text-muted-foreground">
        Automatic simulations are text-only demo data. Live browser and phone recordings appear
        when ElevenLabs retention permits retrieval. Bidly does not book venues or make binding
        commitments.
      </p>
    </div>
  )
}

export default AnalysisPanel
