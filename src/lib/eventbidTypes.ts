import type { EventCategory, EventDetails } from './eventDetails'

export type Module1EventPayload = {
  conversationId: string | null
  agentId: string
  collectedAt: string
  variables: EventDetails
  permissions: {
    vendor_discovery_approved: true
    vendor_calls_approved: true
    may_disclose_requester_name: true
    may_disclose_exact_budget: false
    may_negotiate: true
    may_use_genuine_competing_quotes: true
    may_record_and_transcribe: true
    may_book: false
  }
}

export type EventBidVendor = {
  vendor_id: string
  source: string
  source_place_id: string | null
  name: string
  phone_raw: string | null
  phone_e164: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  distance_km: number | null
  rating: number | null
  review_count: number | null
  website: string | null
  maps_url: string | null
  primary_type: string | null
  types: string[]
  business_status: string | null
  capacity_known: false
  capacity: null
  contactable: boolean
  relevance_score: number
  relevance_reason: string
  approved_for_contact: boolean
  negotiation_style?: EventBidNegotiationStyle
}

export type EventBidNegotiationStyle =
  | 'tough_gatekeeper'
  | 'practical_dealmaker'
  | 'premium_upseller'

export type EventBidCallPhase = 'quote_collection' | 'leverage_negotiation'

export type EventBidQuoteProfile = {
  contact_name: string
  capacity: number
  preferred_date_available: boolean
  capacity_suitable: boolean
  mandatory_requirements_met: boolean
  venue_fee_eur: number
  catering_fee_eur: number
  drinks_fee_eur: number
  cleaning_fee_eur: number
  equipment_fee_eur: number
  staff_security_fee_eur: number
  service_fee_eur: number
  other_mandatory_fees_eur: number
  fixed_total_eur: number
  tax_included: boolean
  deposit_percent: number
  cancellation_terms: string
  quote_valid_until: string
  written_quote_promised: boolean
}

export type PreparedVenueCall = {
  vendor_id: string
  vendor_name: string
  contactable: boolean
  negotiation_style: EventBidNegotiationStyle
  style_label: string
  style_summary: string
  dynamic_variables: Record<string, string | number | boolean>
  negotiation_dynamic_variables: Record<string, string | number | boolean> | null
  roleplay: {
    contact_name: string
    behavior: string
    opening_quote: EventBidQuoteProfile
    negotiated_quote: EventBidQuoteProfile | null
    negotiation_target: boolean
    competing_quote_eur: number | null
    competing_vendor_name: string | null
    concession_trigger: string | null
  }
}

export type EventBidExecutionMode = 'real_phone' | 'agent_simulation' | 'browser_voice'

export type EventBidCallResult = {
  vendor_id: string
  vendor_name: string
  conversation_id: string | null
  execution_mode: EventBidExecutionMode
  call_phase: EventBidCallPhase
  status: string
  call_outcome: unknown
  contact_name: unknown
  eligibility: {
    preferred_date_available: boolean | null
    capacity_suitable: boolean | null
    mandatory_requirements_met: boolean | null
    eligible: boolean | null
  }
  quote: {
    venue_fee_eur: number | null
    catering_fee_eur: number | null
    drinks_fee_eur: number | null
    cleaning_fee_eur: number | null
    equipment_fee_eur: number | null
    staff_security_fee_eur: number | null
    service_fee_eur: number | null
    other_mandatory_fees_eur: number | null
    fixed_total_eur: number | null
    price_range: unknown
    tax_included: boolean | null
    quote_complete: boolean
  }
  commercial_terms: {
    deposit_percent: number | null
    cancellation_terms: unknown
    quote_valid_until: unknown
    written_quote_promised: boolean | null
  }
  call_summary: unknown
  transcript: unknown
  negotiation?: {
    style: EventBidNegotiationStyle
    style_label: string
    round: EventBidCallPhase
    opening_total_eur: number | null
    final_total_eur: number | null
    savings_eur: number
    competing_quote_eur: number | null
    competing_vendor_name: string | null
    leverage_used: boolean
    price_changed: boolean
    evidence: string
  }
  recording?: {
    available: boolean
    source: 'none' | 'elevenlabs_conversation'
    note: string
  }
  simulation_ground_truth?: {
    used_for_missing_fields: boolean
    note: string
  }
}

export type EventBidCallJob = {
  event_id: string
  vendor_id: string
  vendor_name: string
  to_number: string | null
  call_phase: EventBidCallPhase
  execution_mode: EventBidExecutionMode
  timestamp: string
  success: boolean
  message: string
  conversation_id: string | null
  callSid: string | null
  result?: EventBidCallResult | null
}

export type EventBidWorkflow = {
  event: {
    event_id: string
    requester: string
    event_category: EventCategory
    event_type: string
    guest_count: number
    preferred_date: string
    event_time: string
    event_end_time: string
    duration_hours: number
    location: string
    radius_km: number
    total_budget_eur: number | null
    catering_required: boolean
  }
  vendors: EventBidVendor[]
  prepared: PreparedVenueCall[]
  jobs: EventBidCallJob[]
  metadata: Record<string, unknown>
}

export type EventBidConfiguration = {
  googleConfigured: boolean
  simulationConfigured: boolean
  realCallingConfigured: boolean
  venueAgentId: string | null
  mockTestPhoneConfigured: boolean
}
