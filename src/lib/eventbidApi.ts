import type {
  EventBidCallPhase,
  EventBidCallResult,
  EventBidConfiguration,
  EventBidWorkflow,
  Module1EventPayload,
} from './eventbidTypes'

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const body = await response.json()
  if (!response.ok) throw new Error(body?.error ?? `Request failed with status ${response.status}`)
  return body as T
}

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export function getEventBidConfiguration() {
  return requestJson<EventBidConfiguration>('/api/eventbid/config')
}

export function resumeEventWorkflow(event: Module1EventPayload) {
  return requestJson<EventBidWorkflow | null>('/api/eventbid/resume', jsonPost({ event }))
}

export function discoverVenues(event: Module1EventPayload, provider: 'mock' | 'google') {
  return requestJson<EventBidWorkflow>('/api/eventbid/discover', jsonPost({ event, provider }))
}

export function importModule2Handoff(event: Module1EventPayload, module2: unknown) {
  return requestJson<EventBidWorkflow>('/api/eventbid/import-module2', jsonPost({ event, module2 }))
}

export function approveVenues(eventId: string, vendorIds: string[]) {
  return requestJson<EventBidWorkflow>('/api/eventbid/approve', jsonPost({ eventId, vendorIds }))
}

export function prepareCalls(eventId: string) {
  return requestJson<EventBidWorkflow>('/api/eventbid/prepare-calls', jsonPost({ eventId }))
}

export function callApprovedVenues(eventId: string, confirmRealCalls: boolean) {
  return requestJson<EventBidWorkflow>(
    '/api/eventbid/call-approved',
    jsonPost({ eventId, confirmRealCalls }),
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isSimulationComplete(workflow: EventBidWorkflow): boolean {
  const approvedCount = workflow.vendors.filter((vendor) => vendor.approved_for_contact).length
  const simulationJobs = workflow.jobs.filter((job) => job.execution_mode === 'agent_simulation').length
  return approvedCount > 0 && simulationJobs >= approvedCount
}

/**
 * Locally (vite dev), the server responds to this synchronously with the
 * final workflow, same as every other route — handled directly below. On
 * Netlify, this route runs as a background function (its worst-case ~120s
 * runtime exceeds serverless sync timeouts): the POST only gets an immediate
 * 202 with no usable body, so this falls back to polling /resume — the same
 * pending-job pattern AnalysisPanel.tsx already uses for real phone calls —
 * until the simulation jobs show up in the persisted workflow.
 */
export async function simulateApprovedVenues(
  eventId: string,
  event: Module1EventPayload,
): Promise<EventBidWorkflow> {
  const response = await fetch('/api/eventbid/simulate-approved', jsonPost({ eventId }))
  if (response.status !== 202) {
    const body = await response.json()
    if (!response.ok) throw new Error(body?.error ?? `Request failed with status ${response.status}`)
    return body as EventBidWorkflow
  }

  const pollIntervalMs = 2000
  const giveUpAfterMs = 130_000
  const deadline = Date.now() + giveUpAfterMs
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs)
    const workflow = await resumeEventWorkflow(event)
    if (workflow && isSimulationComplete(workflow)) return workflow
  }
  throw new Error('The negotiation simulation is taking longer than expected. Please try again shortly.')
}

export function registerBrowserConversation(
  eventId: string,
  vendorId: string,
  conversationId: string,
  callPhase: EventBidCallPhase,
) {
  return requestJson<EventBidWorkflow>(
    '/api/eventbid/register-browser-conversation',
    jsonPost({ eventId, vendorId, conversationId, callPhase }),
  )
}

export function fetchCallResult(eventId: string, vendorId: string, conversationId: string) {
  const query = new URLSearchParams({ eventId, vendorId })
  return requestJson<EventBidCallResult>(
    `/api/eventbid/result/${encodeURIComponent(conversationId)}?${query.toString()}`,
  )
}

export function conversationRecordingUrl(eventId: string, conversationId: string) {
  const query = new URLSearchParams({ eventId })
  return `/api/eventbid/recording/${encodeURIComponent(conversationId)}?${query.toString()}`
}
