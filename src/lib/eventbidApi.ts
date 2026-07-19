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

export function simulateApprovedVenues(eventId: string) {
  return requestJson<EventBidWorkflow>('/api/eventbid/simulate-approved', jsonPost({ eventId }))
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
