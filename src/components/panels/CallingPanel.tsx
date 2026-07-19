import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useConversation } from '@elevenlabs/react'
import {
  approveVenues,
  callApprovedVenues,
  discoverVenues,
  getEventBidConfiguration,
  importModule2Handoff,
  prepareCalls,
  registerBrowserConversation,
  resumeEventWorkflow,
  simulateApprovedVenues,
} from '../../lib/eventbidApi'
import type {
  EventBidCallPhase,
  EventBidConfiguration,
  EventBidVendor,
  EventBidWorkflow,
  Module1EventPayload,
} from '../../lib/eventbidTypes'

type CallingPanelProps = {
  eventPayload: Module1EventPayload
  onContinue: (workflow: EventBidWorkflow) => void
  onStartOver: () => void
}

type Phase = 'ready' | 'loading' | 'venues' | 'prepared' | 'calling' | 'simulating' | 'browser'
type ExecutionMode = 'simulation' | 'browser' | 'real'
type TranscriptEntry = { role: 'user' | 'agent'; message: string }

const buttonPrimary =
  'rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
const buttonSecondary =
  'rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40'

function formatDistance(value: number | null) {
  return value === null ? 'Not provided' : `${value.toFixed(1)} km`
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function CallingPanel({ eventPayload, onContinue, onStartOver }: CallingPanelProps) {
  const [provider, setProvider] = useState<'mock' | 'google'>('mock')
  const [phase, setPhase] = useState<Phase>('ready')
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('simulation')
  const [workflow, setWorkflow] = useState<EventBidWorkflow | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [configuration, setConfiguration] = useState<EventBidConfiguration | null>(null)
  const [confirmRealCalls, setConfirmRealCalls] = useState(false)
  const [browserVendorId, setBrowserVendorId] = useState('')
  const [browserCallPhase, setBrowserCallPhase] =
    useState<EventBidCallPhase>('quote_collection')
  const [browserTranscript, setBrowserTranscript] = useState<TranscriptEntry[]>([])
  const [browserActive, setBrowserActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const module2FileRef = useRef<HTMLInputElement | null>(null)
  const browserConversationIdRef = useRef<string | null>(null)
  const browserContextRef = useRef<{
    eventId: string
    vendorId: string
    callPhase: EventBidCallPhase
  } | null>(null)

  const browserConversation = useConversation({
    onConnect: ({ conversationId }) => {
      browserConversationIdRef.current = conversationId
      setBrowserActive(true)
      setPhase('browser')
    },
    onMessage: ({ message, role }) => {
      setBrowserTranscript((current) => [...current, { message, role }])
    },
    onDisconnect: () => {
      const context = browserContextRef.current
      const conversationId = browserConversationIdRef.current
      setBrowserActive(false)
      if (!context || !conversationId) {
        setPhase('prepared')
        return
      }
      setPhase('loading')
      registerBrowserConversation(
        context.eventId,
        context.vendorId,
        conversationId,
        context.callPhase,
      )
        .then((next) => {
          setWorkflow(next)
          if (context.callPhase === 'quote_collection') {
            const completed = new Set(
              next.jobs
                .filter(
                  (job) =>
                    job.execution_mode === 'browser_voice' &&
                    job.call_phase === 'quote_collection' &&
                    job.success,
                )
                .map((job) => job.vendor_id),
            )
            const nextOpening = next.prepared.find((item) => !completed.has(item.vendor_id))
            if (nextOpening) setBrowserVendorId(nextOpening.vendor_id)
          }
          setPhase('prepared')
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Could not save the browser conversation.')
          setPhase('prepared')
        })
    },
    onError: (message) => {
      setBrowserActive(false)
      setError(message)
      setPhase('prepared')
    },
  })

  useEffect(() => {
    let active = true
    getEventBidConfiguration().then(setConfiguration).catch(() => setConfiguration(null))
    resumeEventWorkflow(eventPayload)
      .then((saved) => {
        if (!active || !saved?.vendors.length) return
        const approvedIds = saved.vendors
          .filter((vendor) => vendor.approved_for_contact)
          .map((vendor) => vendor.vendor_id)
        setWorkflow(saved)
        setSelectedIds(approvedIds)
        setProvider(saved.metadata.provider === 'google' ? 'google' : 'mock')
        setBrowserVendorId(saved.prepared[0]?.vendor_id ?? approvedIds[0] ?? '')
        setPhase(saved.prepared.length > 0 ? 'prepared' : 'venues')
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [eventPayload])

  const loadDiscovery = async () => {
    setError(null)
    setPhase('loading')
    try {
      const next = await discoverVenues(eventPayload, provider)
      setWorkflow(next)
      setSelectedIds([])
      setPhase('venues')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Venue discovery failed.')
      setPhase('ready')
    }
  }

  const handleModule2File = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setPhase('loading')
    try {
      const handoff = JSON.parse(await file.text())
      const next = await importModule2Handoff(eventPayload, handoff)
      setWorkflow(next)
      setSelectedIds([])
      setPhase('venues')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import the Module 2 handoff.')
      setPhase('ready')
    }
  }

  const toggleVendor = (vendor: EventBidVendor) => {
    setError(null)
    setSelectedIds((current) => {
      if (current.includes(vendor.vendor_id)) return current.filter((id) => id !== vendor.vendor_id)
      if (current.length >= 5) {
        setError('Choose up to five venues for simulation.')
        return current
      }
      return [...current, vendor.vendor_id]
    })
  }

  const approveAndPrepare = async () => {
    if (!workflow || selectedIds.length === 0) return
    setError(null)
    setPhase('loading')
    try {
      const approved = await approveVenues(workflow.event.event_id, selectedIds)
      const prepared = await prepareCalls(approved.event.event_id)
      setWorkflow(prepared)
      setBrowserVendorId(selectedIds[0])
      setBrowserCallPhase('quote_collection')
      setPhase('prepared')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversation preparation failed.')
      setPhase('venues')
    }
  }

  const runSimulations = async () => {
    if (!workflow) return
    setError(null)
    setPhase('simulating')
    try {
      const simulated = await simulateApprovedVenues(workflow.event.event_id, eventPayload)
      setWorkflow(simulated)
      const successful = simulated.jobs.filter(
        (job) => job.execution_mode === 'agent_simulation' && job.success,
      )
      if (!successful.length) {
        const failure = simulated.jobs.find((job) => job.execution_mode === 'agent_simulation')
        throw new Error(failure?.message || 'No venue simulation completed.')
      }
      onContinue(simulated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The agent simulations could not be completed.')
      setPhase('prepared')
    }
  }

  const startBrowserVoice = async () => {
    if (!workflow || !configuration?.venueAgentId || !browserVendorId) return
    const prepared = workflow.prepared.find((item) => item.vendor_id === browserVendorId)
    if (!prepared) return
    const variables =
      browserCallPhase === 'leverage_negotiation'
        ? prepared.negotiation_dynamic_variables
        : prepared.dynamic_variables
    if (!variables) {
      setError('Choose the venue marked as the leverage target for the negotiation round.')
      return
    }
    setError(null)
    setBrowserTranscript([])
    setPhase('browser')
    browserConversationIdRef.current = null
    browserContextRef.current = {
      eventId: workflow.event.event_id,
      vendorId: browserVendorId,
      callPhase: browserCallPhase,
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      browserConversation.startSession({
        agentId: configuration.venueAgentId,
        connectionType: 'webrtc',
        dynamicVariables: variables,
      })
    } catch {
      setError('Could not access the microphone. Check browser permissions and try again.')
      setPhase('prepared')
    }
  }

  const startCalls = async () => {
    if (!workflow || !confirmRealCalls) return
    setError(null)
    setPhase('calling')
    try {
      const called = await callApprovedVenues(workflow.event.event_id, true)
      setWorkflow(called)
      setPhase('prepared')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The calls could not be started.')
      setPhase('prepared')
    }
  }

  const selectedVendors =
    workflow?.vendors.filter((vendor) => selectedIds.includes(vendor.vendor_id)) ?? []
  const contactableSelection =
    selectedVendors.length > 0 && selectedVendors.every((vendor) => vendor.contactable)
  const realCallsAvailable =
    Boolean(configuration?.realCallingConfigured) &&
    contactableSelection &&
    selectedIds.length <= 3 &&
    phase === 'prepared'
  const preparedPhase = phase === 'prepared' || phase === 'browser'
  const browserOpeningIds = new Set(
    workflow?.jobs
      .filter(
        (job) =>
          job.execution_mode === 'browser_voice' &&
          job.call_phase === 'quote_collection' &&
          job.success,
      )
      .map((job) => job.vendor_id) ?? [],
  )
  const leveragePrepared = workflow?.prepared.find(
    (item) => item.negotiation_dynamic_variables !== null,
  )
  const browserOpeningComplete =
    Boolean(workflow?.prepared.length) &&
    (workflow?.prepared.every((item) => browserOpeningIds.has(item.vendor_id)) ?? false)
  const selectedBrowserRole = workflow?.prepared.find(
    (item) => item.vendor_id === browserVendorId,
  )
  const selectedRoleplayQuote =
    browserCallPhase === 'leverage_negotiation'
      ? selectedBrowserRole?.roleplay.negotiated_quote
      : selectedBrowserRole?.roleplay.opening_quote
  const browserLeverageComplete =
    workflow?.jobs.some(
      (job) =>
        job.execution_mode === 'browser_voice' &&
        job.call_phase === 'leverage_negotiation' &&
        job.success,
    ) ?? false

  const chooseBrowserPhase = (nextPhase: EventBidCallPhase) => {
    setBrowserCallPhase(nextPhase)
    setError(null)
    if (nextPhase === 'leverage_negotiation' && leveragePrepared) {
      setBrowserVendorId(leveragePrepared.vendor_id)
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Source venue quotations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build the shortlist, choose a conversation mode, and compare fixed prices.
          </p>
        </div>
        <button type="button" onClick={onStartOver} className={buttonSecondary}>
          Start over
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-5">
        {[
          ['Event', eventPayload.variables.event_type],
          ['Guests', eventPayload.variables.guest_count ?? '-'],
          ['Location', eventPayload.variables.location],
          ['Date', eventPayload.variables.fixed_date ?? eventPayload.variables.date_range_start ?? 'Flexible'],
          ['Budget', eventPayload.variables.budget_per_guest ? `${eventPayload.variables.budget_per_guest} ${eventPayload.variables.budget_currency} / guest` : 'Not disclosed'],
        ].map(([label, value]) => (
          <div key={String(label)} className="min-w-0 bg-card px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs md:grid-cols-4">
        {[
          ['1', 'Event ready', true],
          ['2', 'Vendors sourced', Boolean(workflow)],
          ['3', 'Conversations', Boolean(workflow?.jobs.length)],
          ['4', 'Price ranking', false],
        ].map(([number, label, complete]) => (
          <li key={String(number)} className="flex items-center gap-2 bg-background px-4 py-3">
            <span className={`font-semibold ${complete ? 'text-primary' : 'text-muted-foreground'}`}>
              {number}
            </span>
            <span className={complete ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
          </li>
        ))}
      </ol>

      {!workflow && (
        <section className="border-b border-border pb-6">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-52 flex-col gap-1.5 text-sm font-medium text-foreground">
              Venue source
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as 'mock' | 'google')}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="mock">Fictional vendors (demo)</option>
                <option value="google">Google Places</option>
              </select>
            </label>
            <button type="button" onClick={loadDiscovery} disabled={phase === 'loading'} className={buttonPrimary}>
              {phase === 'loading' ? 'Finding venues...' : 'Find venues'}
            </button>
            <button
              type="button"
              onClick={() => module2FileRef.current?.click()}
              disabled={phase === 'loading'}
              className={buttonSecondary}
            >
              Import Module 2 JSON
            </button>
            <input
              ref={module2FileRef}
              type="file"
              accept="application/json"
              onChange={handleModule2File}
              className="hidden"
            />
          </div>
          {provider === 'google' && !configuration?.googleConfigured && (
            <p className="mt-3 text-sm text-muted-foreground">
              Google discovery requires <code>GOOGLE_MAPS_API_KEY</code> in the local environment.
            </p>
          )}
        </section>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {workflow && (
        <>
          <section className="overflow-hidden rounded-lg border border-border">
            <div className="flex flex-col justify-between gap-2 border-b border-border bg-card px-4 py-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Venue candidates</h2>
                <p className="text-xs text-muted-foreground">
                  {workflow.vendors.length} candidates · {selectedIds.length} selected
                </p>
              </div>
              {phase === 'venues' && (
                <button
                  type="button"
                  onClick={approveAndPrepare}
                  disabled={selectedIds.length === 0}
                  className={buttonPrimary}
                >
                  Approve and prepare
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-200 border-collapse text-left text-sm">
                <thead className="bg-background text-xs text-muted-foreground">
                  <tr>
                    <th className="w-14 px-4 py-3">Use</th>
                    <th className="px-4 py-3">Venue</th>
                    <th className="px-4 py-3">Scenario</th>
                    <th className="px-4 py-3">Distance</th>
                    <th className="px-4 py-3">Rating</th>
                    <th className="px-4 py-3">Telephone</th>
                    <th className="px-4 py-3">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {workflow.vendors.map((vendor) => {
                    const selected = selectedIds.includes(vendor.vendor_id)
                    const preparedVenue = workflow.prepared.find(
                      (item) => item.vendor_id === vendor.vendor_id,
                    )
                    return (
                      <tr key={vendor.vendor_id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={phase !== 'venues'}
                            onChange={() => toggleVendor(vendor)}
                            aria-label={`Select ${vendor.name}`}
                            className="h-4 w-4 accent-primary"
                          />
                        </td>
                        <td className="max-w-80 px-4 py-3">
                          <p className="font-semibold text-foreground">{vendor.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {vendor.address ?? 'Address unavailable'}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {preparedVenue?.style_label ?? (selected ? 'Assigned on approval' : '-')}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatDistance(vendor.distance_km)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {vendor.rating === null
                            ? '-'
                            : `${vendor.rating.toFixed(1)}${vendor.review_count === null ? '' : ` (${vendor.review_count})`}`}
                        </td>
                        <td className="px-4 py-3">
                          <span className={vendor.contactable ? 'text-foreground' : 'text-muted-foreground'}>
                            {vendor.contactable ? vendor.phone_e164 : 'Not required for simulation'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {Math.round(vendor.relevance_score)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {preparedPhase && (
            <section className="border-t border-border pt-6">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Conversation mode</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {workflow.prepared.length} venue{workflow.prepared.length === 1 ? '' : 's'} prepared.
                  </p>
                  <button
                    type="button"
                    onClick={() => setPhase('venues')}
                    disabled={browserActive}
                    className="mt-2 text-sm font-semibold text-primary hover:underline disabled:opacity-40"
                  >
                    Edit shortlist
                  </button>
                </div>
                <div className="inline-flex w-full overflow-hidden rounded-lg border border-border md:w-auto" role="tablist">
                  {[
                    ['simulation', 'AI simulation'],
                    ['browser', 'Browser voice'],
                    ['real', 'Real phone'],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={executionMode === mode}
                      onClick={() => setExecutionMode(mode as ExecutionMode)}
                      disabled={browserActive}
                      className={`flex-1 px-4 py-2 text-sm font-semibold md:flex-none ${
                        executionMode === mode
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {executionMode === 'simulation' && (
                <div className="mt-5 border-t border-border pt-5">
                  <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
                    {workflow.prepared.slice(0, 3).map((item) => (
                      <div key={item.vendor_id} className="bg-card px-4 py-3">
                        <p className="text-xs font-semibold text-primary">{item.style_label}</p>
                        <p className="mt-1 text-sm font-medium text-foreground">{item.vendor_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.style_summary}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div>
                    <p className="text-sm font-medium text-foreground">Three-style negotiation run</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Collects opening quotes, then uses the lowest genuine quote in a follow-up.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This automatic mode is text-based. Use Browser voice for live recorded calls.
                    </p>
                    {selectedIds.length < 3 && (
                      <p className="mt-2 text-sm text-destructive">
                        Select at least three venues to demonstrate all negotiation styles.
                      </p>
                    )}
                    {!configuration?.simulationConfigured && (
                      <p className="mt-2 text-sm text-destructive">
                        Add <code>ELEVENLABS_API_KEY</code> and <code>ELEVENLABS_AGENT_ID</code> to <code>.env</code>.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={runSimulations}
                    disabled={!configuration?.simulationConfigured || selectedIds.length < 3}
                    className={buttonPrimary}
                  >
                    Run negotiation demo
                  </button>
                  </div>
                </div>
              )}

              {executionMode === 'browser' && (
                <div className="mt-5 border-t border-border pt-5">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div
                        className="inline-flex overflow-hidden rounded-lg border border-border"
                        role="tablist"
                        aria-label="Conversation round"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={browserCallPhase === 'quote_collection'}
                          onClick={() => chooseBrowserPhase('quote_collection')}
                          disabled={browserActive}
                          className={`px-4 py-2 text-sm font-semibold ${
                            browserCallPhase === 'quote_collection'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background text-muted-foreground'
                          }`}
                        >
                          Opening quotes
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={browserCallPhase === 'leverage_negotiation'}
                          onClick={() => chooseBrowserPhase('leverage_negotiation')}
                          disabled={browserActive || !browserOpeningComplete || !leveragePrepared}
                          className={`px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                            browserCallPhase === 'leverage_negotiation'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background text-muted-foreground'
                          }`}
                        >
                          Leverage follow-up
                        </button>
                      </div>
                      <label className="flex min-w-64 flex-col gap-1.5 text-sm font-medium text-foreground">
                        Venue role
                        <select
                          value={browserVendorId}
                          onChange={(event) => setBrowserVendorId(event.target.value)}
                          disabled={browserActive || browserCallPhase === 'leverage_negotiation'}
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                          {workflow.prepared.map((item) => (
                            <option key={item.vendor_id} value={item.vendor_id}>
                              {browserOpeningIds.has(item.vendor_id) ? 'Completed - ' : ''}
                              {item.vendor_name} - {item.style_label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {!browserActive ? (
                      <button
                        type="button"
                        onClick={startBrowserVoice}
                        disabled={
                          !configuration?.venueAgentId ||
                          !browserVendorId ||
                          (browserCallPhase === 'leverage_negotiation' &&
                            (!browserOpeningComplete || browserLeverageComplete))
                        }
                        className={buttonPrimary}
                      >
                        {browserCallPhase === 'leverage_negotiation'
                          ? browserLeverageComplete
                            ? 'Follow-up completed'
                            : 'Start leverage follow-up'
                          : 'Start live voice role-play'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => browserConversation.endSession()}
                        className={buttonSecondary}
                      >
                        End conversation
                      </button>
                    )}
                  </div>

                  {selectedBrowserRole && selectedRoleplayQuote && (
                    <div className="mt-4 grid gap-5 border-y border-border py-4 md:grid-cols-[1.1fr_1fr]">
                      <div>
                        <p className="text-xs font-semibold text-primary">
                          {selectedBrowserRole.style_label}
                        </p>
                        <h3 className="mt-1 text-sm font-semibold text-foreground">
                          Play {selectedBrowserRole.roleplay.contact_name} at{' '}
                          {selectedBrowserRole.vendor_name}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {selectedBrowserRole.roleplay.behavior}
                        </p>
                        {browserCallPhase === 'leverage_negotiation' &&
                          selectedBrowserRole.roleplay.concession_trigger && (
                            <p className="mt-3 border-l-2 border-primary pl-3 text-sm font-medium text-foreground">
                              {selectedBrowserRole.roleplay.concession_trigger}
                            </p>
                          )}
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                        {[
                          ['Venue', selectedRoleplayQuote.venue_fee_eur],
                          ['Catering', selectedRoleplayQuote.catering_fee_eur],
                          ['Cleaning', selectedRoleplayQuote.cleaning_fee_eur],
                          ['Equipment', selectedRoleplayQuote.equipment_fee_eur],
                          ['Service', selectedRoleplayQuote.service_fee_eur],
                          ['Fixed total', selectedRoleplayQuote.fixed_total_eur],
                        ].map(([label, amount]) => (
                          <div key={String(label)}>
                            <dt className="text-xs text-muted-foreground">{label}</dt>
                            <dd className="mt-0.5 font-semibold text-foreground">
                              {formatMoney(Number(amount))}
                            </dd>
                          </div>
                        ))}
                        <div>
                          <dt className="text-xs text-muted-foreground">Capacity</dt>
                          <dd className="mt-0.5 font-semibold text-foreground">
                            {selectedRoleplayQuote.capacity}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Deposit</dt>
                          <dd className="mt-0.5 font-semibold text-foreground">
                            {selectedRoleplayQuote.deposit_percent}%
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Tax included</dt>
                          <dd className="mt-0.5 font-semibold text-foreground">
                            {selectedRoleplayQuote.tax_included ? 'Yes' : 'No'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}

                  {!browserOpeningComplete && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {browserOpeningIds.size} of {workflow.prepared.length} opening voice conversations completed.
                    </p>
                  )}
                  {browserOpeningComplete && !browserLeverageComplete && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Opening round complete. The leverage follow-up is now ready.
                    </p>
                  )}
                  {phase === 'browser' && (
                    <div className="mt-4 rounded-lg border border-border bg-card px-4 py-4">
                      <p className="text-sm font-semibold text-foreground">
                        {browserActive
                          ? browserConversation.isSpeaking
                            ? 'Venue-calling agent is speaking'
                            : 'Listening to venue representative'
                          : 'Connecting...'}
                      </p>
                      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                        {browserTranscript.length === 0 && (
                          <p className="text-sm text-muted-foreground">Transcript will appear here.</p>
                        )}
                        {browserTranscript.map((entry, index) => (
                          <p key={`${entry.role}-${index}`} className="text-sm">
                            <span className="font-semibold text-foreground">
                              {entry.role === 'agent' ? 'Agent: ' : 'Venue: '}
                            </span>
                            <span className="text-muted-foreground">{entry.message}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {executionMode === 'real' && (
                <div className="mt-5 flex flex-col justify-between gap-4 border-t border-border pt-5 sm:flex-row sm:items-end">
                  <div>
                    {!contactableSelection && (
                      <p className="text-sm text-muted-foreground">
                        Every selected venue needs a validated telephone number.
                      </p>
                    )}
                    {selectedIds.length > 3 && (
                      <p className="text-sm text-muted-foreground">
                        Real phone mode supports up to three venues per run.
                      </p>
                    )}
                    {contactableSelection && !configuration?.realCallingConfigured && (
                      <p className="text-sm text-muted-foreground">
                        Add the ElevenLabs phone number setting to <code>.env</code>.
                      </p>
                    )}
                    {realCallsAvailable && (
                      <label className="flex items-start gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={confirmRealCalls}
                          onChange={(event) => setConfirmRealCalls(event.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-primary"
                        />
                        I confirm these are authorised real calls to the selected venues.
                      </label>
                    )}
                  </div>
                  {realCallsAvailable && (
                    <button
                      type="button"
                      onClick={startCalls}
                      disabled={!confirmRealCalls}
                      className={buttonPrimary}
                    >
                      Start {selectedIds.length} authorised call{selectedIds.length === 1 ? '' : 's'}
                    </button>
                  )}
                </div>
              )}

              <div className="mt-5 flex justify-end border-t border-border pt-5">
                <button type="button" onClick={() => onContinue(workflow)} className={buttonSecondary}>
                  Review analysis
                </button>
              </div>
            </section>
          )}

          {phase === 'simulating' && (
            <div className="rounded-lg border border-border bg-card px-4 py-4 text-sm text-foreground">
              Running agent conversations and extracting quotations...
            </div>
          )}

          {phase === 'calling' && (
            <div className="rounded-lg border border-border bg-card px-4 py-4 text-sm text-foreground">
              Starting authorised calls sequentially...
            </div>
          )}

          {phase === 'loading' && workflow && (
            <div className="rounded-lg border border-border bg-card px-4 py-4 text-sm text-foreground">
              Updating the workflow...
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default CallingPanel
