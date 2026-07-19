import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useConversation } from '@elevenlabs/react'
import EventDetailsForm from '../EventDetailsForm'
import {
  pollForCollectedVariables,
  ConversationAnalysisError,
  type CollectedVariables,
} from '../../lib/conversationExtraction'
import { normalizeEventDetails, wasLocationRadiusDefaulted, type EventDetails } from '../../lib/eventDetails'
import type { Module1EventPayload } from '../../lib/eventbidTypes'

const INTAKE_AGENT_ID =
  import.meta.env.VITE_ELEVENLABS_INTAKE_AGENT_ID || 'agent_0001kxveg8t5ekzs8pnyf18y4z5f'

type Phase = 'idle' | 'in-call' | 'extracting' | 'ready' | 'error'

type TranscriptEntry = { role: 'user' | 'agent'; message: string }

type InformationGatheringPanelProps = {
  onSubmitted: (payload: Module1EventPayload) => void
}

function InformationGatheringPanel({ onSubmitted }: InformationGatheringPanelProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null)
  const [radiusDefaulted, setRadiusDefaulted] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const conversationIdRef = useRef<string | null>(null)
  const sourceAgentIdRef = useRef(INTAKE_AGENT_ID)
  const collectedAtRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const conversation = useConversation({
    onConnect: ({ conversationId }) => {
      conversationIdRef.current = conversationId
      setPhase('in-call')
    },
    onDisconnect: () => {
      const conversationId = conversationIdRef.current
      if (!conversationId) {
        setErrorMessage('Lost track of the conversation ID — please try again.')
        setPhase('error')
        return
      }
      setPhase('extracting')
      pollForCollectedVariables(conversationId, setAttempt)
        .then((result: CollectedVariables) => {
          setEventDetails(normalizeEventDetails(result))
          setRadiusDefaulted(wasLocationRadiusDefaulted(result))
          setPhase('ready')
        })
        .catch((err) => {
          setErrorMessage(err instanceof ConversationAnalysisError ? err.message : 'Something went wrong while analyzing the call.')
          setPhase('error')
        })
    },
    onMessage: ({ message, role }) => {
      setTranscript((prev) => [...prev, { role, message }])
    },
    onError: (message) => {
      setErrorMessage(message)
      setPhase('error')
    },
  })

  const startConversation = async () => {
    setErrorMessage(null)
    setUploadError(null)
    setTranscript([])
    setEventDetails(null)
    conversationIdRef.current = null
    sourceAgentIdRef.current = INTAKE_AGENT_ID
    collectedAtRef.current = null
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      conversation.startSession({ agentId: INTAKE_AGENT_ID, connectionType: 'webrtc' })
    } catch (err) {
      console.error(err)
      setErrorMessage('Could not access your microphone. Check permissions and try again.')
      setPhase('error')
    }
  }

  const handleUploadClick = () => {
    setUploadError(null)
    fileInputRef.current?.click()
  }

  const loadDemoEvent = () => {
    conversationIdRef.current = 'conv_local_demo'
    sourceAgentIdRef.current = INTAKE_AGENT_ID
    collectedAtRef.current = new Date().toISOString()
    setEventDetails(
      normalizeEventDetails({
        event_category: 'private',
        requester: 'Local Demo',
        event_type: 'Birthday',
        fixed_date: '2026-08-29',
        date_range_start: null,
        date_range_end: null,
        fixed_start_time: '21:00',
        start_time_start: null,
        start_time_end: null,
        duration: 3,
        location: 'Berlin',
        location_radius_km: 20,
        guest_count: 20,
        guest_count_exact: true,
        catering_required: false,
        venue_catering_mandatory: null,
        budget_per_guest: 250,
        budget_currency: 'euros',
        catering_food: '',
      }),
    )
    setRadiusDefaulted(false)
    setUploadError(null)
    setPhase('ready')
  }

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const rawVariables = parsed?.variables
      if (!rawVariables || typeof rawVariables !== 'object') {
        setUploadError('That file doesn\'t look like a Bidly event-details export (missing "variables").')
        return
      }
      conversationIdRef.current = typeof parsed.conversationId === 'string' ? parsed.conversationId : null
      sourceAgentIdRef.current = typeof parsed.agentId === 'string' ? parsed.agentId : INTAKE_AGENT_ID
      collectedAtRef.current = typeof parsed.collectedAt === 'string' ? parsed.collectedAt : null
      setEventDetails(normalizeEventDetails(rawVariables))
      setRadiusDefaulted(wasLocationRadiusDefaulted(rawVariables))
      setUploadError(null)
      setPhase('ready')
    } catch (err) {
      console.error(err)
      setUploadError('Could not read that file — make sure it\'s a valid JSON export.')
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Tell us about your event</h1>
        <p className="mt-1 text-muted-foreground">
          Have a short voice conversation with our AI planner. When you're done, hang up and we'll pull out the
          details automatically.
        </p>
      </div>

      {phase === 'idle' && (
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={startConversation}
            className="self-start rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            Start conversation
          </button>
          <div>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={handleUploadClick}
                className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Upload JSON instead
              </button>
              {import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={loadDemoEvent}
                  className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Load local demo event
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleFileSelected}
              className="hidden"
            />
            {uploadError && <p className="mt-1 text-xs text-destructive">{uploadError}</p>}
          </div>
        </div>
      )}

      {phase === 'in-call' && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
              </span>
              <span className="text-sm font-medium text-foreground">
                {conversation.isSpeaking ? 'Agent is speaking' : 'Listening'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => conversation.endSession()}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-background"
            >
              End call
            </button>
          </div>

          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto text-left">
            {transcript.length === 0 && (
              <p className="text-sm text-muted-foreground">The transcript will appear here as you talk.</p>
            )}
            {transcript.map((entry, index) => (
              <p key={index} className="text-sm">
                <span className="font-semibold text-foreground">{entry.role === 'user' ? 'You: ' : 'Agent: '}</span>
                <span className="text-muted-foreground">{entry.message}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {phase === 'extracting' && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="font-medium text-foreground">Analyzing your conversation…</p>
          <p className="mt-1 text-sm text-muted-foreground">Attempt {attempt}</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">{errorMessage}</p>
          <button
            type="button"
            onClick={startConversation}
            className="mt-4 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        </div>
      )}

      {phase === 'ready' && eventDetails && (
        <EventDetailsForm
          initialValues={eventDetails}
          radiusDefaulted={radiusDefaulted}
          conversationId={conversationIdRef.current}
          agentId={sourceAgentIdRef.current}
          onSubmitted={(values: EventDetails) =>
            onSubmitted({
              conversationId: conversationIdRef.current,
              agentId: sourceAgentIdRef.current,
              collectedAt: collectedAtRef.current ?? new Date().toISOString(),
              variables: values,
              permissions: {
                vendor_discovery_approved: true,
                vendor_calls_approved: true,
                may_disclose_requester_name: true,
                may_disclose_exact_budget: false,
                may_negotiate: true,
                may_use_genuine_competing_quotes: true,
                may_record_and_transcribe: true,
                may_book: false,
              },
            })
          }
        />
      )}
    </div>
  )
}

export default InformationGatheringPanel
