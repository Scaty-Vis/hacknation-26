import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Connect } from 'vite'

type JsonObject = Record<string, unknown>

type EventBidEnvironment = {
  googleMapsApiKey?: string
  elevenLabsApiKey?: string
  elevenLabsAgentId?: string
  elevenLabsPhoneNumberId?: string
  mockTestPhone?: string
}

type ExecutionMode = 'real_phone' | 'agent_simulation' | 'browser_voice'
type CallPhase = 'quote_collection' | 'leverage_negotiation'
export type NegotiationStyle = 'tough_gatekeeper' | 'practical_dealmaker' | 'premium_upseller'

type NormalizedEvent = {
  event_id: string
  source_conversation_id: string
  source_intake_agent_id: string
  source_collected_at: string
  event_category: 'private' | 'corporate'
  requester: string
  event_type: string
  guest_count: number
  guest_count_exact: boolean
  preferred_date: string
  alternative_dates: string
  event_time: string
  event_end_time: string
  duration_hours: number
  location: string
  radius_km: number
  budget_per_guest_eur: number | null
  total_budget_eur: number | null
  catering_required: boolean
  venue_catering_mandatory: boolean | null
  mandatory_requirements: string
}

export type SimulationProfile = {
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

type Vendor = {
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
  negotiation_style?: NegotiationStyle
  simulation_profile?: SimulationProfile
}

type PreparedCall = {
  vendor_id: string
  vendor_name: string
  contactable: boolean
  negotiation_style: NegotiationStyle
  style_label: string
  style_summary: string
  dynamic_variables: Record<string, string | number | boolean>
  negotiation_dynamic_variables: Record<string, string | number | boolean> | null
  roleplay: {
    contact_name: string
    behavior: string
    opening_quote: SimulationProfile
    negotiated_quote: SimulationProfile | null
    negotiation_target: boolean
    competing_quote_eur: number | null
    competing_vendor_name: string | null
    concession_trigger: string | null
  }
}

type CallJob = {
  event_id: string
  vendor_id: string
  vendor_name: string
  to_number: string | null
  call_phase: CallPhase
  execution_mode: ExecutionMode
  timestamp: string
  success: boolean
  message: string
  conversation_id: string | null
  callSid: string | null
  dynamic_variables: Record<string, string | number | boolean>
  result?: ReturnType<typeof normalizedResult> | null
}

type WorkflowState = {
  event: NormalizedEvent
  permissions: {
    vendor_discovery_approved: boolean
    vendor_calls_approved: boolean
    may_disclose_requester_name: boolean
    may_disclose_exact_budget: boolean
    may_negotiate: boolean
    may_use_genuine_competing_quotes: boolean
    may_record_and_transcribe: boolean
    may_book: false
  }
  vendors: Vendor[]
  prepared: PreparedCall[]
  jobs: CallJob[]
  metadata: JsonObject
}

const negotiationStyles: NegotiationStyle[] = [
  'tough_gatekeeper',
  'practical_dealmaker',
  'premium_upseller',
]

const negotiationStyleDetails: Record<
  NegotiationStyle,
  { label: string; summary: string; behavior: string; discountRate: number }
> = {
  tough_gatekeeper: {
    label: 'Tough gatekeeper',
    summary: 'Protects the rate and moves only after a precise, credible competing quote.',
    behavior:
      'Be concise and guarded. Ask focused questions, defend the venue value, and refuse vague discount requests. Only make the prepared concession after the caller cites the exact competing quote.',
    discountRate: 0.04,
  },
  practical_dealmaker: {
    label: 'Practical deal-maker',
    summary: 'Looks for a workable agreement and can waive a meaningful mandatory fee.',
    behavior:
      'Be warm and commercially practical. Explain the itemized quote clearly. In a follow-up, reward a credible competing quote with the prepared concession and state exactly which fee changed.',
    discountRate: 0.1,
  },
  premium_upseller: {
    label: 'Premium upseller',
    summary: 'Leads with value and add-ons, then improves the package when challenged.',
    behavior:
      'Emphasize service quality and premium inclusions without inventing benefits. Keep all mandatory fees explicit. When exact leverage is presented, make the prepared concession while explaining the retained value.',
    discountRate: 0.07,
  },
}

const eventFieldKeys = [
  'event_category',
  'requester',
  'event_type',
  'fixed_date',
  'date_range_start',
  'date_range_end',
  'fixed_start_time',
  'start_time_start',
  'start_time_end',
  'duration',
  'location',
  'location_radius_km',
  'guest_count',
  'guest_count_exact',
  'catering_required',
  'venue_catering_mandatory',
  'catering_food',
  'budget_per_guest',
  'budget_currency',
] as const

function objectValue(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as JsonObject
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return typeof value === 'string' && value.trim().toLowerCase() === 'true'
}

function booleanOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined || stringValue(value).toLowerCase() === 'null') return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'string' && ['true', 'false'].includes(value.trim().toLowerCase())) {
    return value.trim().toLowerCase() === 'true'
  }
  return null
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value)
  return text && text.toLowerCase() !== 'null' ? text : null
}

function stableEventId(conversationId: string): string {
  return `evt_${createHash('sha256').update(conversationId).digest('hex').slice(0, 16)}`
}

function addHours(startTime: string, durationHours: number): string {
  const [hours, minutes] = startTime.split(':').map(Number)
  const totalMinutes = (hours * 60 + minutes + Math.round(durationHours * 60)) % (24 * 60)
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}

function currencyIsEur(value: string): boolean {
  return ['eur', 'euro', 'euros', '€'].includes(value.toLowerCase())
}

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function normalizePhone(value: unknown): string | null {
  const raw = stringValue(value)
  if (!raw) return null
  let compact = raw.replace(/[()\s.-]/g, '')
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`
  if (compact.startsWith('0')) compact = `+49${compact.slice(1)}`
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null
}

export function validateEventDeterministically(input: unknown) {
  const values = objectValue(input)
  const fieldErrors = Object.fromEntries(eventFieldKeys.map((key) => [key, null])) as Record<string, string | null>
  if (!['private', 'corporate'].includes(stringValue(values.event_category))) {
    fieldErrors.event_category = 'Select private or corporate.'
  }
  if (!stringValue(values.requester)) fieldErrors.requester = 'Enter the planner or company name.'
  if (!stringValue(values.event_type)) fieldErrors.event_type = 'Enter the kind of event.'

  const fixedDate = nullableString(values.fixed_date)
  const dateStart = nullableString(values.date_range_start)
  const dateEnd = nullableString(values.date_range_end)
  if (Boolean(fixedDate) === Boolean(dateStart && dateEnd)) {
    fieldErrors.fixed_date = 'Provide either a fixed date or a complete date range.'
  } else if (dateStart && dateEnd && dateStart > dateEnd) {
    fieldErrors.date_range_end = 'The end date must be on or after the start date.'
  }

  const fixedTime = nullableString(values.fixed_start_time)
  const timeStart = nullableString(values.start_time_start)
  const timeEnd = nullableString(values.start_time_end)
  if (Boolean(fixedTime) === Boolean(timeStart && timeEnd)) {
    fieldErrors.fixed_start_time = 'Provide either a fixed start time or a complete time range.'
  } else if (timeStart && timeEnd && timeStart > timeEnd) {
    fieldErrors.start_time_end = 'The latest time must be after the earliest time.'
  }

  const duration = numberValue(values.duration)
  if (duration === null || duration <= 0) fieldErrors.duration = 'Enter a duration greater than 0.'
  if (!stringValue(values.location)) fieldErrors.location = 'Enter a location.'
  const radius = numberValue(values.location_radius_km)
  if (radius === null || radius <= 0) fieldErrors.location_radius_km = 'Enter a radius greater than 0.'
  const guests = numberValue(values.guest_count)
  if (guests === null || guests <= 0 || !Number.isInteger(guests)) {
    fieldErrors.guest_count = 'Enter a whole number of guests greater than 0.'
  }

  if (booleanValue(values.catering_required)) {
    if (booleanOrNull(values.venue_catering_mandatory) === null) {
      fieldErrors.venue_catering_mandatory = 'Choose whether venue catering is mandatory.'
    }
    if (!stringValue(values.catering_food)) fieldErrors.catering_food = 'Describe the catering required.'
  }

  const budget = numberValue(values.budget_per_guest)
  const currency = stringValue(values.budget_currency)
  if ((budget !== null && !currency) || (budget === null && Boolean(currency))) {
    fieldErrors.budget_per_guest = 'Enter both a per-guest budget and currency, or leave both empty.'
    fieldErrors.budget_currency = 'Enter both a per-guest budget and currency, or leave both empty.'
  }
  if (budget !== null && budget < 0) fieldErrors.budget_per_guest = 'Budget cannot be negative.'

  return { valid: Object.values(fieldErrors).every((value) => value === null), fieldErrors }
}

function normalizeEvent(payload: unknown): { event: NormalizedEvent; permissions: WorkflowState['permissions'] } {
  const source = objectValue(payload)
  const variables = objectValue(source.variables)
  const validation = validateEventDeterministically(variables)
  if (!validation.valid) {
    const fields = Object.entries(validation.fieldErrors)
      .filter(([, message]) => message)
      .map(([field]) => field)
    throw new Error(`Module 1 event is incomplete: ${fields.join(', ')}`)
  }

  const sourceConversationId =
    stringValue(source.conversationId) || `manual_${createHash('sha256').update(JSON.stringify(variables)).digest('hex').slice(0, 16)}`
  const fixedTime = nullableString(variables.fixed_start_time)
  const startTime = fixedTime || nullableString(variables.start_time_start) || 'none'
  const duration = numberValue(variables.duration) as number
  const budgetPerGuest = numberValue(variables.budget_per_guest)
  const currency = stringValue(variables.budget_currency)
  const guestCount = numberValue(variables.guest_count) as number
  const permissionsInput = objectValue(source.permissions)
  const event: NormalizedEvent = {
    event_id: stableEventId(sourceConversationId),
    source_conversation_id: sourceConversationId,
    source_intake_agent_id: stringValue(source.agentId),
    source_collected_at: stringValue(source.collectedAt) || new Date().toISOString(),
    event_category: stringValue(variables.event_category) as 'private' | 'corporate',
    requester: stringValue(variables.requester),
    event_type: stringValue(variables.event_type),
    guest_count: guestCount,
    guest_count_exact: booleanValue(variables.guest_count_exact),
    preferred_date: nullableString(variables.fixed_date) || nullableString(variables.date_range_start) || 'none',
    alternative_dates:
      nullableString(variables.date_range_start) && nullableString(variables.date_range_end)
        ? `${nullableString(variables.date_range_start)} to ${nullableString(variables.date_range_end)}`
        : 'none',
    event_time: startTime,
    event_end_time: startTime === 'none' ? 'none' : addHours(startTime, duration),
    duration_hours: duration,
    location: stringValue(variables.location),
    radius_km: numberValue(variables.location_radius_km) as number,
    budget_per_guest_eur: budgetPerGuest !== null && currencyIsEur(currency) ? budgetPerGuest : null,
    total_budget_eur: budgetPerGuest !== null && currencyIsEur(currency) ? budgetPerGuest * guestCount : null,
    catering_required: booleanValue(variables.catering_required),
    venue_catering_mandatory: booleanOrNull(variables.venue_catering_mandatory),
    mandatory_requirements: booleanOrNull(variables.venue_catering_mandatory)
      ? 'venue catering required'
      : 'none',
  }
  const permissions: WorkflowState['permissions'] = {
    vendor_discovery_approved: permissionsInput.vendor_discovery_approved === true,
    vendor_calls_approved: permissionsInput.vendor_calls_approved === true,
    may_disclose_requester_name: permissionsInput.may_disclose_requester_name !== false,
    may_disclose_exact_budget: permissionsInput.may_disclose_exact_budget === true,
    may_negotiate: permissionsInput.may_negotiate === true,
    may_use_genuine_competing_quotes: permissionsInput.may_use_genuine_competing_quotes === true,
    may_record_and_transcribe: permissionsInput.may_record_and_transcribe !== false,
    may_book: false,
  }
  if (!permissions.vendor_discovery_approved) throw new Error('Vendor discovery was not approved by the planner.')
  return { event, permissions }
}

export function haversineKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number): number {
  const radius = 6371.0088
  const radians = (value: number) => (value * Math.PI) / 180
  const deltaLatitude = radians(latitudeB - latitudeA)
  const deltaLongitude = radians(longitudeB - longitudeA)
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2
  return radius * 2 * Math.asin(Math.sqrt(a))
}

function scoreVendor(vendor: Vendor): Vendor {
  const searchable = `${vendor.name} ${vendor.primary_type ?? ''} ${vendor.types.join(' ')}`.toLowerCase()
  let score = 0
  const reasons: string[] = []
  if (/(event|venue|party|banquet|hall|conference|community|veranstaltung|location)/.test(searchable)) {
    score += 35
    reasons.push('event-relevant venue type')
  }
  if (vendor.phone_e164) {
    score += 25
    reasons.push('validated telephone')
  }
  if (!['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'].includes(vendor.business_status ?? '')) {
    score += 10
    reasons.push('not marked closed')
  }
  if (vendor.rating !== null) {
    score += Math.max(0, Math.min(15, (vendor.rating / 5) * 15))
    reasons.push('rating available')
  }
  if (vendor.review_count !== null) {
    score += Math.min(10, (vendor.review_count / 100) * 10)
    reasons.push('review confidence')
  }
  if (vendor.website) {
    score += 5
    reasons.push('website available')
  }
  return {
    ...vendor,
    contactable: Boolean(vendor.phone_e164),
    relevance_score: Math.round(score * 100) / 100,
    relevance_reason: reasons.join('; ') || 'limited metadata',
    approved_for_contact: false,
    capacity_known: false,
    capacity: null,
  }
}

function baseVendor(partial: Partial<Vendor> & Pick<Vendor, 'vendor_id' | 'source' | 'name'>): Vendor {
  return {
    source_place_id: null,
    phone_raw: null,
    phone_e164: null,
    address: null,
    latitude: null,
    longitude: null,
    distance_km: null,
    rating: null,
    review_count: null,
    website: null,
    maps_url: null,
    primary_type: null,
    types: [],
    business_status: null,
    capacity_known: false,
    capacity: null,
    contactable: false,
    relevance_score: 0,
    relevance_reason: '',
    approved_for_contact: false,
    ...partial,
  }
}

function mockVendors(testPhone?: string): Vendor[] {
  const phone = normalizePhone(testPhone)
  return [
    baseVendor({
      vendor_id: 'mock_lantern_hall',
      source: 'mock',
      source_place_id: 'lantern-hall',
      name: 'Lantern Hall (Fictional)',
      phone_raw: testPhone || null,
      phone_e164: phone,
      address: 'Fictionalplatz 12',
      latitude: 52.515,
      longitude: 13.39,
      distance_km: 1.2,
      rating: 4.7,
      review_count: 142,
      website: 'https://example.invalid/lantern-hall',
      primary_type: 'event_venue',
      types: ['event_venue'],
      business_status: 'OPERATIONAL',
    }),
    baseVendor({
      vendor_id: 'mock_studio_north',
      source: 'mock',
      source_place_id: 'studio-north',
      name: 'Studio North (Fictional)',
      address: 'Inventedallee 4',
      latitude: 52.54,
      longitude: 13.43,
      distance_km: 2.8,
      rating: 4.9,
      review_count: 88,
      website: 'https://example.invalid/studio-north',
      primary_type: 'event_venue',
      types: ['event_venue'],
      business_status: 'OPERATIONAL',
    }),
    baseVendor({
      vendor_id: 'mock_courtyard_room',
      source: 'mock',
      source_place_id: 'courtyard-room',
      name: 'Courtyard Room (Fictional)',
      address: 'Musterweg 8',
      latitude: 52.525,
      longitude: 13.41,
      distance_km: 0.7,
      rating: 3.8,
      review_count: 19,
      primary_type: 'community_centre',
      types: ['community_centre'],
      business_status: 'OPERATIONAL',
    }),
    baseVendor({
      vendor_id: 'mock_spree_loft',
      source: 'mock',
      source_place_id: 'spree-loft',
      name: 'Spree Loft (Fictional)',
      address: 'Uferstrasse 24',
      latitude: 52.51,
      longitude: 13.45,
      distance_km: 3.4,
      rating: 4.5,
      review_count: 211,
      website: 'https://example.invalid/spree-loft',
      primary_type: 'event_venue',
      types: ['event_venue', 'banquet_hall'],
      business_status: 'OPERATIONAL',
    }),
    baseVendor({
      vendor_id: 'mock_garden_atrium',
      source: 'mock',
      source_place_id: 'garden-atrium',
      name: 'Garden Atrium (Fictional)',
      address: 'Parkring 6',
      latitude: 52.49,
      longitude: 13.38,
      distance_km: 4.1,
      rating: 4.6,
      review_count: 67,
      website: 'https://example.invalid/garden-atrium',
      primary_type: 'banquet_hall',
      types: ['banquet_hall', 'event_venue'],
      business_status: 'OPERATIONAL',
    }),
    baseVendor({
      vendor_id: 'mock_workshop_17',
      source: 'mock',
      source_place_id: 'workshop-17',
      name: 'Workshop 17 (Fictional)',
      address: 'Industriestrasse 17',
      latitude: 52.55,
      longitude: 13.37,
      distance_km: 5.3,
      rating: 4.2,
      review_count: 104,
      website: 'https://example.invalid/workshop-17',
      primary_type: 'conference_centre',
      types: ['conference_centre', 'event_venue'],
      business_status: 'OPERATIONAL',
    }),
    baseVendor({
      vendor_id: 'mock_riverside_salon',
      source: 'mock',
      source_place_id: 'riverside-salon',
      name: 'Riverside Salon (Fictional)',
      address: 'Kanalpromenade 31',
      latitude: 52.5,
      longitude: 13.33,
      distance_km: 6.2,
      rating: 4.8,
      review_count: 53,
      website: 'https://example.invalid/riverside-salon',
      primary_type: 'wedding_venue',
      types: ['wedding_venue', 'event_venue'],
      business_status: 'OPERATIONAL',
    }),
    baseVendor({
      vendor_id: 'mock_kulturhaus_mitte',
      source: 'mock',
      source_place_id: 'kulturhaus-mitte',
      name: 'Kulturhaus Mitte (Fictional)',
      address: 'Theatergasse 9',
      latitude: 52.53,
      longitude: 13.4,
      distance_km: 1.9,
      rating: 4.4,
      review_count: 176,
      website: 'https://example.invalid/kulturhaus-mitte',
      primary_type: 'cultural_centre',
      types: ['cultural_centre', 'event_venue'],
      business_status: 'OPERATIONAL',
    }),
  ].map(scoreVendor)
}

function searchQueries(event: NormalizedEvent): string[] {
  return [
    `event venue ${event.location}`,
    `${event.event_type} venue ${event.location}`,
    `${event.event_category} party venue ${event.location}`,
    `Eventlocation ${event.location}`,
    `Veranstaltungsraum ${event.location}`,
    `Partylocation ${event.location}`,
  ]
}

async function googleVendors(event: NormalizedEvent, apiKey?: string): Promise<{ vendors: Vendor[]; metadata: JsonObject }> {
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is missing. Select Mock for offline development.')
  const geocodeResponse = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(event.location)}&key=${encodeURIComponent(apiKey)}`,
  )
  const geocodeBody = objectValue(await geocodeResponse.json())
  const geocodeResult = Array.isArray(geocodeBody.results) ? objectValue(geocodeBody.results[0]) : {}
  const center = objectValue(objectValue(geocodeResult.geometry).location)
  const centerLatitude = numberValue(center.lat)
  const centerLongitude = numberValue(center.lng)
  if (!geocodeResponse.ok || centerLatitude === null || centerLongitude === null) {
    throw new Error(`Google could not geocode ${event.location}.`)
  }

  const fieldMask =
    'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.businessStatus,places.googleMapsUri'
  const rawPlaces: JsonObject[] = []
  for (const query of searchQueries(event)) {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 10,
        locationBias: {
          circle: {
            center: { latitude: centerLatitude, longitude: centerLongitude },
            radius: event.radius_km * 1000,
          },
        },
      }),
    })
    if (!response.ok) throw new Error(`Google Places search failed with status ${response.status}.`)
    const body = objectValue(await response.json())
    if (Array.isArray(body.places)) rawPlaces.push(...body.places.map(objectValue))
    if (rawPlaces.length >= 50) break
  }

  const deduplicated = new Map<string, Vendor>()
  for (const place of rawPlaces.slice(0, 50)) {
    const id = stringValue(place.id)
    const displayName = objectValue(place.displayName)
    const location = objectValue(place.location)
    const latitude = numberValue(location.latitude)
    const longitude = numberValue(location.longitude)
    const status = nullableString(place.businessStatus)
    if (!id || latitude === null || longitude === null || status === 'CLOSED_PERMANENTLY') continue
    const distance = haversineKm(centerLatitude, centerLongitude, latitude, longitude)
    if (distance > event.radius_km) continue
    const name = stringValue(displayName.text) || 'Unnamed venue'
    const address = nullableString(place.formattedAddress)
    const key = id || `${normalizedText(name)}:${normalizedText(address ?? '')}`
    if (!deduplicated.has(key)) {
      deduplicated.set(
        key,
        baseVendor({
          vendor_id: `google_${id}`,
          source: 'google',
          source_place_id: id,
          name,
          address,
          latitude,
          longitude,
          distance_km: Math.round(distance * 1000) / 1000,
          maps_url: nullableString(place.googleMapsUri),
          primary_type: nullableString(place.primaryType),
          types: Array.isArray(place.types) ? place.types.map(stringValue).filter(Boolean) : [],
          business_status: status,
        }),
      )
    }
  }

  const candidates = [...deduplicated.values()]
    .map(scoreVendor)
    .sort((a, b) => b.relevance_score - a.relevance_score)
  const detailMask =
    'id,displayName,formattedAddress,location,internationalPhoneNumber,nationalPhoneNumber,rating,userRatingCount,websiteUri,businessStatus,primaryType,types,googleMapsUri'
  for (const vendor of candidates.slice(0, 15)) {
    const response = await fetch(`https://places.googleapis.com/v1/places/${vendor.source_place_id}`, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': detailMask },
    })
    if (!response.ok) continue
    const detail = objectValue(await response.json())
    vendor.phone_raw = nullableString(detail.internationalPhoneNumber) || nullableString(detail.nationalPhoneNumber)
    vendor.phone_e164 = normalizePhone(vendor.phone_raw)
    vendor.rating = numberValue(detail.rating)
    vendor.review_count = numberValue(detail.userRatingCount)
    vendor.website = nullableString(detail.websiteUri)
    vendor.business_status = nullableString(detail.businessStatus)
    Object.assign(vendor, scoreVendor(vendor))
  }
  candidates.sort((a, b) => b.relevance_score - a.relevance_score)
  return {
    vendors: candidates,
    metadata: {
      provider: 'google',
      center: { latitude: centerLatitude, longitude: centerLongitude },
      queries: searchQueries(event),
      raw_result_count: rawPlaces.length,
      shortlisted_count: candidates.length,
    },
  }
}

function importExternalVendors(event: NormalizedEvent, handoff: unknown): { vendors: Vendor[]; metadata: JsonObject } {
  const body = objectValue(handoff)
  const details = objectValue(body.event_details)
  const planner = objectValue(details.planner)
  const issues: string[] = []
  if (stringValue(planner.name) && normalizedText(stringValue(planner.name)) !== normalizedText(event.requester)) {
    issues.push('planner')
  }
  if (stringValue(details.event_type) && normalizedText(stringValue(details.event_type)) !== normalizedText(event.event_type)) {
    issues.push('event type')
  }
  if (numberValue(details.guest_count) !== null && numberValue(details.guest_count) !== event.guest_count) issues.push('guest count')
  if (stringValue(details.date) && stringValue(details.date) !== event.preferred_date) issues.push('date')
  if (stringValue(details.location) && !normalizedText(stringValue(details.location)).includes(normalizedText(event.location))) {
    issues.push('location')
  }
  if (issues.length) {
    throw new Error(`The Module 2 file belongs to a different event (${issues.join(', ')}).`)
  }
  const venues = Array.isArray(body.venues) ? body.venues.map(objectValue) : []
  const imported = venues.map((venue) => {
    const placeId = stringValue(venue.place_id)
    const rawPhone = nullableString(venue.phone)
    return scoreVendor(
      baseVendor({
        vendor_id: `module2_${placeId || createHash('sha256').update(stringValue(venue.name)).digest('hex').slice(0, 10)}`,
        source: 'module2',
        source_place_id: placeId || null,
        name: stringValue(venue.name) || 'Unnamed venue',
        phone_raw: rawPhone,
        phone_e164: normalizePhone(rawPhone),
        address: nullableString(venue.address),
        rating: numberValue(venue.rating),
        primary_type: nullableString(body.search_category),
        types: nullableString(body.search_category) ? [stringValue(body.search_category)] : [],
      }),
    )
  })
  return {
    vendors: imported.sort((a, b) => b.relevance_score - a.relevance_score),
    metadata: { provider: 'external_module2', raw_result_count: venues.length, shortlisted_count: imported.length },
  }
}

function dynamicVariables(
  event: NormalizedEvent,
  vendor: Vendor,
  permissions: WorkflowState['permissions'],
  options: {
    callPhase?: CallPhase
    style?: NegotiationStyle
    openingQuoteEur?: number
    competingQuoteEur?: number
    competingVendorName?: string
    negotiatedQuoteEur?: number
  } = {},
) {
  const style = options.style ?? vendor.negotiation_style ?? 'tough_gatekeeper'
  return {
    event_id: event.event_id,
    vendor_id: vendor.vendor_id,
    vendor_name: vendor.name,
    planner_identity: permissions.may_disclose_requester_name ? event.requester : 'not disclosed',
    event_category: event.event_category,
    event_type: event.event_type,
    guest_count: event.guest_count,
    guest_count_exact: event.guest_count_exact,
    preferred_date: event.preferred_date,
    alternative_dates: event.alternative_dates,
    event_time:
      event.event_time === 'none' || event.event_end_time === 'none'
        ? 'none'
        : `${event.event_time} until ${event.event_end_time}`,
    duration_hours: event.duration_hours,
    location_area: `${event.location} within ${event.radius_km} kilometres`,
    budget_ceiling_eur: event.total_budget_eur ?? 0,
    disclose_budget: permissions.may_disclose_exact_budget,
    catering_required: event.catering_required,
    mandatory_requirements: event.mandatory_requirements,
    preferred_requirements: 'none',
    call_phase: options.callPhase ?? 'quote_collection',
    negotiation_style: style,
    negotiation_style_label: negotiationStyleDetails[style].label,
    may_negotiate: permissions.may_negotiate,
    opening_quote_eur: options.openingQuoteEur ?? 0,
    competing_quote_eur: options.competingQuoteEur ?? 0,
    competing_quote_scope: options.competingVendorName
      ? `Fixed total quoted by ${options.competingVendorName} for the same event specification`
      : 'none',
    negotiated_quote_target_eur: options.negotiatedQuoteEur ?? 0,
    request_recording_consent: permissions.may_record_and_transcribe,
  }
}

function roundTo(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

function simulationProfile(event: NormalizedEvent, vendor: Vendor): SimulationProfile {
  if (vendor.simulation_profile) return vendor.simulation_profile
  const seed = Number.parseInt(createHash('sha256').update(vendor.vendor_id).digest('hex').slice(0, 8), 16)
  const capacity = Math.max(event.guest_count + 10 + (seed % 90), 35)
  const preferredDateAvailable = seed % 7 !== 0
  const capacitySuitable = capacity >= event.guest_count
  const offersCatering = seed % 5 !== 0
  const cateringFee =
    event.catering_required && offersCatering
      ? roundTo(event.guest_count * (28 + (seed % 24)), 25)
      : 0
  const venueFee = roundTo(850 + (seed % 2900), 50)
  const drinksFee = event.event_category === 'private' ? roundTo(event.guest_count * (8 + (seed % 10)), 25) : 0
  const cleaningFee = roundTo(120 + (seed % 280), 25)
  const equipmentFee = seed % 3 === 0 ? 180 : 0
  const staffSecurityFee = event.guest_count >= 80 ? roundTo(220 + (seed % 260), 25) : 0
  const serviceFee = seed % 4 === 0 ? roundTo(100 + (seed % 220), 25) : 0
  const otherMandatoryFees = seed % 6 === 0 ? 90 : 0
  const mandatoryRequirementsMet =
    !event.venue_catering_mandatory || (offersCatering && cateringFee > 0)
  const fixedTotal =
    venueFee +
    cateringFee +
    drinksFee +
    cleaningFee +
    equipmentFee +
    staffSecurityFee +
    serviceFee +
    otherMandatoryFees
  const validity = new Date()
  validity.setDate(validity.getDate() + 14 + (seed % 14))

  return {
    contact_name: ['Alex', 'Samira', 'Jonas', 'Mina', 'Robin'][seed % 5],
    capacity,
    preferred_date_available: preferredDateAvailable,
    capacity_suitable: capacitySuitable,
    mandatory_requirements_met: mandatoryRequirementsMet,
    venue_fee_eur: venueFee,
    catering_fee_eur: cateringFee,
    drinks_fee_eur: drinksFee,
    cleaning_fee_eur: cleaningFee,
    equipment_fee_eur: equipmentFee,
    staff_security_fee_eur: staffSecurityFee,
    service_fee_eur: serviceFee,
    other_mandatory_fees_eur: otherMandatoryFees,
    fixed_total_eur: fixedTotal,
    tax_included: seed % 3 !== 0,
    deposit_percent: [20, 25, 30, 40][seed % 4],
    cancellation_terms: 'Deposit is non-refundable within 30 days of the event.',
    quote_valid_until: validity.toISOString().slice(0, 10),
    written_quote_promised: true,
  }
}

export function negotiationStyleForIndex(index: number): NegotiationStyle {
  return negotiationStyles[index % negotiationStyles.length]
}

function negotiationStyleValue(value: unknown): NegotiationStyle {
  const style = stringValue(value) as NegotiationStyle
  return negotiationStyles.includes(style) ? style : 'tough_gatekeeper'
}

function quoteTotal(profile: SimulationProfile): number {
  return (
    profile.venue_fee_eur +
    profile.catering_fee_eur +
    profile.drinks_fee_eur +
    profile.cleaning_fee_eur +
    profile.equipment_fee_eur +
    profile.staff_security_fee_eur +
    profile.service_fee_eur +
    profile.other_mandatory_fees_eur
  )
}

export function negotiatedSimulationProfile(
  opening: SimulationProfile,
  style: NegotiationStyle,
): SimulationProfile {
  const requestedDiscount = roundTo(
    Math.max(100, opening.fixed_total_eur * negotiationStyleDetails[style].discountRate),
    25,
  )
  const discount = Math.min(requestedDiscount, Math.max(100, opening.venue_fee_eur - 100))
  const venueFee = opening.venue_fee_eur - discount
  const negotiated = {
    ...opening,
    venue_fee_eur: venueFee,
    deposit_percent:
      style === 'practical_dealmaker'
        ? Math.max(10, opening.deposit_percent - 5)
        : opening.deposit_percent,
  }
  return { ...negotiated, fixed_total_eur: quoteTotal(negotiated) }
}

type NegotiationPlan = {
  target: Vendor
  competitor: Vendor
  style: NegotiationStyle
  openingProfile: SimulationProfile
  negotiatedProfile: SimulationProfile
  competingProfile: SimulationProfile
}

function buildNegotiationPlan(event: NormalizedEvent, vendors: Vendor[]): NegotiationPlan | null {
  if (vendors.length < 2) return null
  const candidates = vendors.map((vendor, index) => {
    const style = vendor.negotiation_style ?? negotiationStyleForIndex(index)
    const openingProfile = simulationProfile(event, vendor)
    return {
      vendor,
      style,
      openingProfile,
      negotiatedProfile: negotiatedSimulationProfile(openingProfile, style),
    }
  })
  const competitor = [...candidates].sort(
    (a, b) => a.openingProfile.fixed_total_eur - b.openingProfile.fixed_total_eur,
  )[0]
  const target = candidates
    .filter((candidate) => candidate.vendor.vendor_id !== competitor.vendor.vendor_id)
    .sort(
      (a, b) =>
        a.negotiatedProfile.fixed_total_eur - b.negotiatedProfile.fixed_total_eur ||
        b.openingProfile.fixed_total_eur -
          b.negotiatedProfile.fixed_total_eur -
          (a.openingProfile.fixed_total_eur - a.negotiatedProfile.fixed_total_eur),
    )[0]
  if (!target) return null
  return {
    target: target.vendor,
    competitor: competitor.vendor,
    style: target.style,
    openingProfile: target.openingProfile,
    negotiatedProfile: target.negotiatedProfile,
    competingProfile: competitor.openingProfile,
  }
}

function simulatedVenuePrompt(
  event: NormalizedEvent,
  vendor: Vendor,
  profile: SimulationProfile,
  style: NegotiationStyle,
  negotiation?: {
    openingProfile: SimulationProfile
    competingQuoteEur: number
    competingVendorName: string
  },
): string {
  const styleDetails = negotiationStyleDetails[style]
  return [
    `You are ${profile.contact_name}, the bookings manager at ${vendor.name}.`,
    'You are participating in a test conversation with an AI venue-sourcing agent.',
    'Never claim this simulation is a real booking. Never invent authority, availability, fees, or discounts.',
    `Your negotiation style is "${styleDetails.label}": ${styleDetails.behavior}`,
    `The requested event is a ${event.event_type} for ${event.guest_count} guests on ${event.preferred_date}.`,
    `Your venue capacity is ${profile.capacity}.`,
    `The requested date is ${profile.preferred_date_available ? 'available' : 'not available'}.`,
    `The capacity is ${profile.capacity_suitable ? 'suitable' : 'not suitable'}.`,
    `Mandatory requirements are ${profile.mandatory_requirements_met ? 'met' : 'not met'}.`,
    negotiation
      ? `This is a follow-up negotiation. Your earlier fixed total was EUR ${negotiation.openingProfile.fixed_total_eur}. The caller has a genuine competing fixed quote of EUR ${negotiation.competingQuoteEur} from ${negotiation.competingVendorName} for the same event.`
      : 'This is the opening quote call. No verified competing quote has been supplied, so do not discount during this round.',
    negotiation
      ? `Defend the earlier quote until the caller cites the exact EUR ${negotiation.competingQuoteEur} competing price. Then make one clear concession to the new itemized quotation below, explain that the venue fee changed, and confirm the new fixed total.`
      : 'Give the itemized opening quotation below and clearly confirm its fixed total.',
    JSON.stringify({
      venue_fee_eur: profile.venue_fee_eur,
      catering_fee_eur: profile.catering_fee_eur,
      drinks_fee_eur: profile.drinks_fee_eur,
      cleaning_fee_eur: profile.cleaning_fee_eur,
      equipment_fee_eur: profile.equipment_fee_eur,
      staff_security_fee_eur: profile.staff_security_fee_eur,
      service_fee_eur: profile.service_fee_eur,
      other_mandatory_fees_eur: profile.other_mandatory_fees_eur,
      fixed_total_eur: profile.fixed_total_eur,
      tax_included: profile.tax_included,
      deposit_percent: profile.deposit_percent,
      cancellation_terms: profile.cancellation_terms,
      quote_valid_until: profile.quote_valid_until,
      written_quote_promised: profile.written_quote_promised,
    }),
    'Do not negotiate below these figures. Answer naturally and briefly, and end politely after all quotation questions are answered.',
  ].join('\n')
}

export type EventBidPersistence = {
  save(state: WorkflowState): Promise<void>
  load(eventId: string): Promise<WorkflowState>
}

/**
 * The original local-dev persistence: an in-memory cache backed by JSON files
 * under .eventbid-data/. Used by the Vite middleware (vite.config.ts) so local
 * behavior stays exactly as it was before this became injectable. Netlify
 * Functions inject a Blobs-backed implementation instead (see
 * netlify/functions/lib/eventbidBlobsPersistence.ts) since neither the Map nor
 * process.cwd() survive across serverless invocations.
 */
export function createFileSystemPersistence(): EventBidPersistence {
  const dataDirectory = join(process.cwd(), '.eventbid-data')
  const stateCache = new Map<string, WorkflowState>()

  return {
    async save(state) {
      stateCache.set(state.event.event_id, state)
      await mkdir(dataDirectory, { recursive: true })
      await writeFile(join(dataDirectory, `${state.event.event_id}.json`), JSON.stringify(state, null, 2), 'utf-8')
    },
    async load(eventId) {
      const cached = stateCache.get(eventId)
      if (cached) return cached
      try {
        const state = JSON.parse(await readFile(join(dataDirectory, `${eventId}.json`), 'utf-8')) as WorkflowState
        stateCache.set(eventId, state)
        return state
      } catch {
        throw new Error(`Event workflow not found: ${eventId}`)
      }
    },
  }
}

async function readJsonBody(req: Connect.IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf-8')
  return raw ? objectValue(JSON.parse(raw)) : {}
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function analysisValues(raw: JsonObject): Record<string, unknown> {
  const analysis = objectValue(raw.analysis || raw.conversation_analysis)
  const values: Record<string, unknown> = {}
  const list = Array.isArray(analysis.data_collection_results_list) ? analysis.data_collection_results_list : []
  for (const item of list.map(objectValue)) {
    const id = stringValue(item.data_collection_id)
    if (id) values[id] = objectValue(item.value).value ?? item.value
  }
  const map = objectValue(analysis.data_collection_results || analysis.data_collection)
  for (const [key, value] of Object.entries(map)) values[key] = objectValue(value).value ?? value
  for (const [key, value] of Object.entries(analysis)) {
    if (!(key in values)) values[key] = objectValue(value).value ?? value
  }
  return values
}

function normalizedResult(
  raw: JsonObject,
  vendor: Vendor,
  executionMode: ExecutionMode = 'real_phone',
  callPhase: CallPhase = 'quote_collection',
) {
  const values = analysisValues(raw)
  const analysis = objectValue(raw.analysis || raw.conversation_analysis)
  const money = (key: string) => numberValue(values[key])
  const fixedTotal = money('fixed_total_eur')
  const taxIncluded = booleanOrNull(values.tax_included)
  const dateAvailable = booleanOrNull(values.preferred_date_available)
  const capacitySuitable = booleanOrNull(values.capacity_suitable)
  const mandatoryMet = booleanOrNull(values.mandatory_requirements_met)
  const conversationId = nullableString(raw.conversation_id) || nullableString(raw.conversationId)
  return {
    vendor_id: vendor.vendor_id,
    vendor_name: vendor.name,
    conversation_id: conversationId,
    execution_mode: executionMode,
    call_phase: callPhase,
    status: stringValue(raw.status) || 'unknown',
    call_outcome: values.call_outcome ?? null,
    contact_name: values.contact_name ?? null,
    eligibility: {
      preferred_date_available: dateAvailable,
      capacity_suitable: capacitySuitable,
      mandatory_requirements_met: mandatoryMet,
      eligible:
        [dateAvailable, capacitySuitable, mandatoryMet].includes(false)
          ? false
          : [dateAvailable, capacitySuitable, mandatoryMet].includes(null)
            ? null
            : true,
    },
    quote: {
      venue_fee_eur: money('venue_fee_eur'),
      catering_fee_eur: money('catering_fee_eur'),
      drinks_fee_eur: money('drinks_fee_eur'),
      cleaning_fee_eur: money('cleaning_fee_eur'),
      equipment_fee_eur: money('equipment_fee_eur'),
      staff_security_fee_eur: money('staff_security_fee_eur'),
      service_fee_eur: money('service_fee_eur'),
      other_mandatory_fees_eur: money('other_mandatory_fees_eur'),
      fixed_total_eur: fixedTotal,
      price_range: values.price_range ?? null,
      tax_included: taxIncluded,
      quote_complete:
        fixedTotal !== null &&
        taxIncluded !== null &&
        dateAvailable !== null &&
        capacitySuitable !== null &&
        mandatoryMet !== null,
    },
    commercial_terms: {
      deposit_percent: money('deposit_percent'),
      cancellation_terms: values.cancellation_terms ?? null,
      quote_valid_until: values.quote_valid_until ?? null,
      written_quote_promised: booleanOrNull(values.written_quote_promised),
    },
    call_summary: values.call_summary ?? analysis.transcript_summary ?? null,
    transcript: raw.transcript ?? raw.simulated_conversation ?? [],
    raw_analysis: raw.analysis ?? {},
    recording: {
      available: executionMode !== 'agent_simulation' && Boolean(conversationId),
      source: executionMode === 'agent_simulation' ? 'none' : 'elevenlabs_conversation',
      note:
        executionMode === 'agent_simulation'
          ? 'Automatic agent simulation is text-only and has no call recording.'
          : 'Audio is available after ElevenLabs finishes processing when workspace retention permits it.',
    },
  }
}

function normalizedSimulationResult(
  raw: JsonObject,
  vendor: Vendor,
  profile: SimulationProfile,
  conversationId: string,
  context: {
    style: NegotiationStyle
    callPhase: CallPhase
    openingProfile?: SimulationProfile
    competingQuoteEur?: number
    competingVendorName?: string
  },
) {
  const extracted = normalizedResult(
    { ...raw, conversation_id: conversationId, status: 'simulated_completed' },
    vendor,
    'agent_simulation',
    context.callPhase,
  )
  const usedFields: string[] = []
  const fallbackMoney = (key: keyof SimulationProfile, value: number | null) => {
    if (value !== null) return value
    usedFields.push(key)
    return profile[key] as number
  }
  const fallbackBoolean = (key: keyof SimulationProfile, value: boolean | null) => {
    if (value !== null) return value
    usedFields.push(key)
    return profile[key] as boolean
  }
  const dateAvailable = fallbackBoolean(
    'preferred_date_available',
    extracted.eligibility.preferred_date_available,
  )
  const capacitySuitable = fallbackBoolean('capacity_suitable', extracted.eligibility.capacity_suitable)
  const mandatoryMet = fallbackBoolean(
    'mandatory_requirements_met',
    extracted.eligibility.mandatory_requirements_met,
  )
  const quote = {
    ...extracted.quote,
    venue_fee_eur: fallbackMoney('venue_fee_eur', extracted.quote.venue_fee_eur),
    catering_fee_eur: fallbackMoney('catering_fee_eur', extracted.quote.catering_fee_eur),
    drinks_fee_eur: fallbackMoney('drinks_fee_eur', extracted.quote.drinks_fee_eur),
    cleaning_fee_eur: fallbackMoney('cleaning_fee_eur', extracted.quote.cleaning_fee_eur),
    equipment_fee_eur: fallbackMoney('equipment_fee_eur', extracted.quote.equipment_fee_eur),
    staff_security_fee_eur: fallbackMoney(
      'staff_security_fee_eur',
      extracted.quote.staff_security_fee_eur,
    ),
    service_fee_eur: fallbackMoney('service_fee_eur', extracted.quote.service_fee_eur),
    other_mandatory_fees_eur: fallbackMoney(
      'other_mandatory_fees_eur',
      extracted.quote.other_mandatory_fees_eur,
    ),
    fixed_total_eur: fallbackMoney('fixed_total_eur', extracted.quote.fixed_total_eur),
    tax_included: fallbackBoolean('tax_included', extracted.quote.tax_included),
    quote_complete: true,
  }
  return {
    ...extracted,
    call_outcome: extracted.call_outcome ?? 'quote_collected',
    contact_name: extracted.contact_name ?? profile.contact_name,
    eligibility: {
      preferred_date_available: dateAvailable,
      capacity_suitable: capacitySuitable,
      mandatory_requirements_met: mandatoryMet,
      eligible: dateAvailable && capacitySuitable && mandatoryMet,
    },
    quote,
    commercial_terms: {
      deposit_percent:
        extracted.commercial_terms.deposit_percent ?? profile.deposit_percent,
      cancellation_terms:
        extracted.commercial_terms.cancellation_terms ?? profile.cancellation_terms,
      quote_valid_until:
        extracted.commercial_terms.quote_valid_until ?? profile.quote_valid_until,
      written_quote_promised:
        extracted.commercial_terms.written_quote_promised ?? profile.written_quote_promised,
    },
    call_summary:
      extracted.call_summary ??
      `Simulated quotation from ${vendor.name}: fixed total EUR ${profile.fixed_total_eur}.`,
    negotiation: {
      style: context.style,
      style_label: negotiationStyleDetails[context.style].label,
      round: context.callPhase,
      opening_total_eur: context.openingProfile?.fixed_total_eur ?? profile.fixed_total_eur,
      final_total_eur: profile.fixed_total_eur,
      savings_eur:
        (context.openingProfile?.fixed_total_eur ?? profile.fixed_total_eur) -
        profile.fixed_total_eur,
      competing_quote_eur: context.competingQuoteEur ?? null,
      competing_vendor_name: context.competingVendorName ?? null,
      leverage_used:
        context.callPhase === 'leverage_negotiation' && Boolean(context.competingQuoteEur),
      price_changed:
        context.callPhase === 'leverage_negotiation' &&
        Boolean(context.openingProfile) &&
        profile.fixed_total_eur < (context.openingProfile?.fixed_total_eur ?? 0),
      evidence:
        context.callPhase === 'leverage_negotiation' && context.openingProfile
          ? `A genuine EUR ${context.competingQuoteEur} competing quote was supplied; ${vendor.name} reduced its fixed total from EUR ${context.openingProfile.fixed_total_eur} to EUR ${profile.fixed_total_eur}.`
          : `${negotiationStyleDetails[context.style].label} opening quotation collected without leverage.`,
    },
    simulation_ground_truth: {
      used_for_missing_fields: usedFields.length > 0,
      note:
        usedFields.length > 0
          ? `Simulation ground truth supplied missing fields: ${[...new Set(usedFields)].join(', ')}.`
          : 'All displayed fields were extracted by the configured agent analysis.',
    },
  }
}

export function eventBidApi(environment: EventBidEnvironment, persistence: EventBidPersistence) {
  const saveState = (state: WorkflowState) => persistence.save(state)
  const getState = (eventId: string) => persistence.load(eventId)

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost')
    try {
      if (req.method === 'GET' && url.pathname === '/config') {
        sendJson(res, 200, {
          googleConfigured: Boolean(environment.googleMapsApiKey),
          simulationConfigured: Boolean(
            environment.elevenLabsApiKey &&
              environment.elevenLabsAgentId,
          ),
          realCallingConfigured: Boolean(
            environment.elevenLabsApiKey &&
              environment.elevenLabsAgentId &&
              environment.elevenLabsPhoneNumberId,
          ),
          venueAgentId: environment.elevenLabsAgentId || null,
          mockTestPhoneConfigured: Boolean(normalizePhone(environment.mockTestPhone)),
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/resume') {
        const body = await readJsonBody(req)
        const { event } = normalizeEvent(body.event)
        try {
          const state = await getState(event.event_id)
          sendJson(res, 200, state)
        } catch {
          sendJson(res, 200, null)
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/discover') {
        const body = await readJsonBody(req)
        const { event, permissions } = normalizeEvent(body.event)
        const provider = stringValue(body.provider) || 'mock'
        const discovered =
          provider === 'google'
            ? await googleVendors(event, environment.googleMapsApiKey)
            : { vendors: mockVendors(environment.mockTestPhone), metadata: { provider: 'mock', mock_mode: true } }
        const state: WorkflowState = {
          event,
          permissions,
          vendors: discovered.vendors,
          prepared: [],
          jobs: [],
          metadata: { ...discovered.metadata, generated_at: new Date().toISOString() },
        }
        await saveState(state)
        sendJson(res, 200, state)
        return
      }

      if (req.method === 'POST' && url.pathname === '/import-module2') {
        const body = await readJsonBody(req)
        const { event, permissions } = normalizeEvent(body.event)
        const imported = importExternalVendors(event, body.module2)
        const state: WorkflowState = {
          event,
          permissions,
          vendors: imported.vendors,
          prepared: [],
          jobs: [],
          metadata: { ...imported.metadata, generated_at: new Date().toISOString() },
        }
        await saveState(state)
        sendJson(res, 200, state)
        return
      }

      if (req.method === 'POST' && url.pathname === '/approve') {
        const body = await readJsonBody(req)
        const eventId = stringValue(body.eventId)
        const vendorIds = Array.isArray(body.vendorIds) ? body.vendorIds.map(stringValue).filter(Boolean) : []
        if (!vendorIds.length || vendorIds.length > 5) throw new Error('Select between one and five venues.')
        const state = await getState(eventId)
        const known = new Set(state.vendors.map((vendor) => vendor.vendor_id))
        if (vendorIds.some((id) => !known.has(id))) throw new Error('One or more selected vendors are unknown.')
        state.vendors = state.vendors.map((vendor) => ({
          ...vendor,
          approved_for_contact: vendorIds.includes(vendor.vendor_id),
          negotiation_style: vendorIds.includes(vendor.vendor_id)
            ? negotiationStyleForIndex(vendorIds.indexOf(vendor.vendor_id))
            : undefined,
        }))
        await saveState(state)
        sendJson(res, 200, state)
        return
      }

      if (req.method === 'POST' && url.pathname === '/prepare-calls') {
        const body = await readJsonBody(req)
        const state = await getState(stringValue(body.eventId))
        const approved = state.vendors.filter((vendor) => vendor.approved_for_contact)
        if (!approved.length) throw new Error('Approve at least one venue first.')
        const plan = buildNegotiationPlan(state.event, approved)
        state.prepared = approved.map((vendor, index) => {
          const style = vendor.negotiation_style ?? negotiationStyleForIndex(index)
          const styleDetails = negotiationStyleDetails[style]
          const openingProfile = simulationProfile(state.event, vendor)
          const isTarget = plan?.target.vendor_id === vendor.vendor_id
          const negotiatedProfile = isTarget ? plan.negotiatedProfile : null
          return {
            vendor_id: vendor.vendor_id,
            vendor_name: vendor.name,
            contactable: vendor.contactable,
            negotiation_style: style,
            style_label: styleDetails.label,
            style_summary: styleDetails.summary,
            dynamic_variables: dynamicVariables(state.event, vendor, state.permissions, {
              style,
              openingQuoteEur: openingProfile.fixed_total_eur,
            }),
            negotiation_dynamic_variables:
              isTarget && plan
                ? dynamicVariables(state.event, vendor, state.permissions, {
                    callPhase: 'leverage_negotiation',
                    style,
                    openingQuoteEur: openingProfile.fixed_total_eur,
                    competingQuoteEur: plan.competingProfile.fixed_total_eur,
                    competingVendorName: plan.competitor.name,
                    negotiatedQuoteEur: negotiatedProfile?.fixed_total_eur,
                  })
                : null,
            roleplay: {
              contact_name: openingProfile.contact_name,
              behavior: styleDetails.behavior,
              opening_quote: openingProfile,
              negotiated_quote: negotiatedProfile,
              negotiation_target: Boolean(isTarget),
              competing_quote_eur: isTarget ? plan?.competingProfile.fixed_total_eur ?? null : null,
              competing_vendor_name: isTarget ? plan?.competitor.name ?? null : null,
              concession_trigger:
                isTarget && plan && negotiatedProfile
                  ? `Only after the caller cites EUR ${plan.competingProfile.fixed_total_eur} from ${plan.competitor.name}, reduce the fixed total from EUR ${openingProfile.fixed_total_eur} to EUR ${negotiatedProfile.fixed_total_eur}.`
                  : null,
            },
          }
        })
        state.metadata = {
          ...state.metadata,
          negotiation_plan: plan
            ? {
                target_vendor_id: plan.target.vendor_id,
                target_vendor_name: plan.target.name,
                competing_vendor_id: plan.competitor.vendor_id,
                competing_vendor_name: plan.competitor.name,
                competing_quote_eur: plan.competingProfile.fixed_total_eur,
                opening_quote_eur: plan.openingProfile.fixed_total_eur,
                negotiated_quote_eur: plan.negotiatedProfile.fixed_total_eur,
                expected_savings_eur:
                  plan.openingProfile.fixed_total_eur - plan.negotiatedProfile.fixed_total_eur,
              }
            : null,
        }
        await saveState(state)
        sendJson(res, 200, state)
        return
      }

      if (req.method === 'POST' && url.pathname === '/simulate-approved') {
        const body = await readJsonBody(req)
        const state = await getState(stringValue(body.eventId))
        if (!state.permissions.vendor_calls_approved) {
          throw new Error('The planner did not approve vendor conversations.')
        }
        const elevenLabsApiKey = environment.elevenLabsApiKey
        const elevenLabsAgentId = environment.elevenLabsAgentId
        if (!elevenLabsApiKey || !elevenLabsAgentId) {
          throw new Error(
            'Agent simulation is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID.',
          )
        }
        const approved = state.vendors.filter((vendor) => vendor.approved_for_contact).slice(0, 5)
        if (!approved.length) throw new Error('Approve at least one venue first.')
        if (approved.length < 3) {
          throw new Error('Select at least three venues to run the three-style negotiation demo.')
        }

        const jobs: CallJob[] = await Promise.all(approved.map(async (vendor, index) => {
          const style = vendor.negotiation_style ?? negotiationStyleForIndex(index)
          const profile = simulationProfile(state.event, vendor)
          const variables = dynamicVariables(state.event, vendor, state.permissions, {
            style,
            openingQuoteEur: profile.fixed_total_eur,
          })
          const timestamp = new Date().toISOString()
          const conversationId = `sim_${createHash('sha256')
            .update(`${state.event.event_id}:${vendor.vendor_id}:${timestamp}`)
            .digest('hex')
            .slice(0, 20)}`
          try {
            const response = await fetch(
              `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(elevenLabsAgentId)}/simulate-conversation`,
              {
                method: 'POST',
                headers: {
                  'xi-api-key': elevenLabsApiKey,
                  'content-type': 'application/json',
                },
                signal: AbortSignal.timeout(60_000),
                body: JSON.stringify({
                  simulation_specification: {
                    simulated_user_config: {
                      first_message: `Hello, ${vendor.name} bookings. ${profile.contact_name} speaking. How can I help?`,
                      language: 'en',
                      prompt: {
                        prompt: simulatedVenuePrompt(state.event, vendor, profile, style),
                        llm: 'gpt-4o-mini',
                        temperature: 0.1,
                      },
                    },
                    dynamic_variables: variables,
                  },
                  extra_evaluation_criteria: [
                    {
                      id: 'eventbid_ai_disclosure',
                      name: 'AI disclosure',
                      conversation_goal_prompt:
                        'The calling agent clearly disclosed near the beginning that it is an AI agent.',
                      use_knowledge_base: false,
                    },
                    {
                      id: 'eventbid_quote_collection',
                      name: 'Quote collection',
                      conversation_goal_prompt:
                        'The calling agent collected availability, capacity suitability, mandatory requirements, individual mandatory fees, and a fixed total price.',
                      use_knowledge_base: false,
                    },
                  ],
                  new_turns_limit: 18,
                }),
              },
            )
            const responseBody = objectValue(await response.json())
            if (!response.ok) {
              const detail =
                stringValue(responseBody.detail) ||
                stringValue(objectValue(responseBody.detail).message) ||
                stringValue(responseBody.message)
              return {
                event_id: state.event.event_id,
                vendor_id: vendor.vendor_id,
                vendor_name: vendor.name,
                to_number: null,
                call_phase: 'quote_collection' as const,
                execution_mode: 'agent_simulation' as const,
                timestamp,
                success: false,
                message: detail || `ElevenLabs simulation failed with status ${response.status}.`,
                conversation_id: null,
                callSid: null,
                dynamic_variables: variables,
                result: null,
              }
            }
            return {
              event_id: state.event.event_id,
              vendor_id: vendor.vendor_id,
              vendor_name: vendor.name,
              to_number: null,
              call_phase: 'quote_collection' as const,
              execution_mode: 'agent_simulation' as const,
              timestamp,
              success: true,
              message: 'Agent-to-agent simulation completed',
              conversation_id: conversationId,
              callSid: null,
              dynamic_variables: variables,
              result: normalizedSimulationResult(responseBody, vendor, profile, conversationId, {
                style,
                callPhase: 'quote_collection',
              }),
            }
          } catch (error) {
            return {
              event_id: state.event.event_id,
              vendor_id: vendor.vendor_id,
              vendor_name: vendor.name,
              to_number: null,
              call_phase: 'quote_collection' as const,
              execution_mode: 'agent_simulation' as const,
              timestamp,
              success: false,
              message:
                error instanceof Error && error.name === 'TimeoutError'
                  ? 'ElevenLabs simulation timed out after 60 seconds.'
                  : error instanceof Error
                    ? error.message
                    : 'ElevenLabs simulation failed.',
              conversation_id: null,
              callSid: null,
              dynamic_variables: variables,
              result: null,
            }
          }
        }))
        const completedVendorIds = new Set(
          jobs.filter((job) => job.success).map((job) => job.vendor_id),
        )
        const plan =
          state.permissions.may_negotiate && state.permissions.may_use_genuine_competing_quotes
            ? buildNegotiationPlan(
                state.event,
                approved.filter((vendor) => completedVendorIds.has(vendor.vendor_id)),
              )
            : null
        if (plan) {
          const timestamp = new Date().toISOString()
          const variables = dynamicVariables(state.event, plan.target, state.permissions, {
            callPhase: 'leverage_negotiation',
            style: plan.style,
            openingQuoteEur: plan.openingProfile.fixed_total_eur,
            competingQuoteEur: plan.competingProfile.fixed_total_eur,
            competingVendorName: plan.competitor.name,
            negotiatedQuoteEur: plan.negotiatedProfile.fixed_total_eur,
          })
          const conversationId = `sim_${createHash('sha256')
            .update(
              `${state.event.event_id}:${plan.target.vendor_id}:leverage_negotiation:${timestamp}`,
            )
            .digest('hex')
            .slice(0, 20)}`
          try {
            const response = await fetch(
            `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(elevenLabsAgentId)}/simulate-conversation`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': elevenLabsApiKey,
                'content-type': 'application/json',
              },
              signal: AbortSignal.timeout(60_000),
              body: JSON.stringify({
                simulation_specification: {
                  simulated_user_config: {
                    first_message: `Hello again. ${plan.negotiatedProfile.contact_name} from ${plan.target.name} speaking.`,
                    language: 'en',
                    prompt: {
                      prompt: simulatedVenuePrompt(
                        state.event,
                        plan.target,
                        plan.negotiatedProfile,
                        plan.style,
                        {
                          openingProfile: plan.openingProfile,
                          competingQuoteEur: plan.competingProfile.fixed_total_eur,
                          competingVendorName: plan.competitor.name,
                        },
                      ),
                      llm: 'gpt-4o-mini',
                      temperature: 0.1,
                    },
                  },
                  dynamic_variables: variables,
                },
                extra_evaluation_criteria: [
                  {
                    id: 'eventbid_ai_disclosure',
                    name: 'AI disclosure',
                    conversation_goal_prompt:
                      'The calling agent clearly disclosed that it is an AI agent.',
                    use_knowledge_base: false,
                  },
                  {
                    id: 'eventbid_leverage_negotiation',
                    name: 'Leverage negotiation',
                    conversation_goal_prompt: `The calling agent cited the genuine EUR ${plan.competingProfile.fixed_total_eur} competing quote and obtained a lower fixed total than EUR ${plan.openingProfile.fixed_total_eur}.`,
                    use_knowledge_base: false,
                  },
                ],
                new_turns_limit: 16,
              }),
            },
            )
            const responseBody = objectValue(await response.json())
            const detail =
              stringValue(responseBody.detail) ||
              stringValue(objectValue(responseBody.detail).message) ||
              stringValue(responseBody.message)
            jobs.push({
              event_id: state.event.event_id,
              vendor_id: plan.target.vendor_id,
              vendor_name: plan.target.name,
              to_number: null,
              call_phase: 'leverage_negotiation',
              execution_mode: 'agent_simulation',
              timestamp,
              success: response.ok,
              message: response.ok
                ? 'Leverage negotiation simulation completed'
                : detail ||
                  `ElevenLabs negotiation simulation failed with status ${response.status}.`,
              conversation_id: response.ok ? conversationId : null,
              callSid: null,
              dynamic_variables: variables,
              result: response.ok
                ? normalizedSimulationResult(
                    responseBody,
                    plan.target,
                    plan.negotiatedProfile,
                    conversationId,
                    {
                      style: plan.style,
                      callPhase: 'leverage_negotiation',
                      openingProfile: plan.openingProfile,
                      competingQuoteEur: plan.competingProfile.fixed_total_eur,
                      competingVendorName: plan.competitor.name,
                    },
                  )
                : null,
            })
          } catch (error) {
            jobs.push({
              event_id: state.event.event_id,
              vendor_id: plan.target.vendor_id,
              vendor_name: plan.target.name,
              to_number: null,
              call_phase: 'leverage_negotiation',
              execution_mode: 'agent_simulation',
              timestamp,
              success: false,
              message:
                error instanceof Error && error.name === 'TimeoutError'
                  ? 'ElevenLabs negotiation timed out after 60 seconds.'
                  : error instanceof Error
                    ? error.message
                    : 'ElevenLabs negotiation failed.',
              conversation_id: null,
              callSid: null,
              dynamic_variables: variables,
              result: null,
            })
          }
        }
        const approvedIds = new Set(approved.map((vendor) => vendor.vendor_id))
        state.jobs = [
          ...state.jobs.filter(
            (job) => job.execution_mode !== 'agent_simulation' || !approvedIds.has(job.vendor_id),
          ),
          ...jobs,
        ]
        state.metadata = {
          ...state.metadata,
          last_execution_mode: 'agent_simulation',
          simulations_completed: jobs.filter((job) => job.success).length,
          simulations_failed: jobs.filter((job) => !job.success).length,
          negotiation_completed: jobs.some(
            (job) => job.success && job.call_phase === 'leverage_negotiation',
          ),
        }
        await saveState(state)
        sendJson(res, 200, state)
        return
      }

      if (req.method === 'POST' && url.pathname === '/register-browser-conversation') {
        const body = await readJsonBody(req)
        const state = await getState(stringValue(body.eventId))
        const vendorId = stringValue(body.vendorId)
        const conversationId = stringValue(body.conversationId)
        const callPhase: CallPhase =
          stringValue(body.callPhase) === 'leverage_negotiation'
            ? 'leverage_negotiation'
            : 'quote_collection'
        const vendor = state.vendors.find(
          (candidate) => candidate.vendor_id === vendorId && candidate.approved_for_contact,
        )
        if (!vendor) throw new Error('The selected venue is not approved for this workflow.')
        if (!conversationId) throw new Error('The browser conversation ID is missing.')
        const prepared = state.prepared.find((candidate) => candidate.vendor_id === vendorId)
        if (callPhase === 'leverage_negotiation' && !prepared?.negotiation_dynamic_variables) {
          throw new Error('This venue is not the prepared leverage-negotiation target.')
        }
        const variables =
          callPhase === 'leverage_negotiation'
            ? (prepared?.negotiation_dynamic_variables as Record<string, string | number | boolean>)
            : prepared?.dynamic_variables ??
              dynamicVariables(state.event, vendor, state.permissions, {
                style: vendor.negotiation_style,
              })
        const job: CallJob = {
          event_id: state.event.event_id,
          vendor_id: vendor.vendor_id,
          vendor_name: vendor.name,
          to_number: null,
          call_phase: callPhase,
          execution_mode: 'browser_voice',
          timestamp: new Date().toISOString(),
          success: true,
          message:
            callPhase === 'leverage_negotiation'
              ? 'Browser voice leverage negotiation completed'
              : 'Browser voice quotation completed',
          conversation_id: conversationId,
          callSid: null,
          dynamic_variables: variables,
          result: null,
        }
        state.jobs = [
          ...state.jobs.filter(
            (existing) =>
              existing.execution_mode !== 'browser_voice' ||
              existing.vendor_id !== vendor.vendor_id ||
              existing.call_phase !== callPhase,
          ),
          job,
        ]
        state.metadata = {
          ...state.metadata,
          last_execution_mode: 'browser_voice',
          browser_negotiation_completed:
            callPhase === 'leverage_negotiation' ||
            Boolean(state.metadata.browser_negotiation_completed),
        }
        await saveState(state)
        sendJson(res, 200, state)
        return
      }

      if (req.method === 'POST' && url.pathname === '/call-approved') {
        const body = await readJsonBody(req)
        const state = await getState(stringValue(body.eventId))
        if (body.confirmRealCalls !== true) throw new Error('Real calls require explicit confirmation.')
        if (!state.permissions.vendor_calls_approved) throw new Error('The planner did not approve vendor calls.')
        if (
          !environment.elevenLabsApiKey ||
          !environment.elevenLabsAgentId ||
          !environment.elevenLabsPhoneNumberId
        ) {
          throw new Error(
            'ElevenLabs calling is not configured. Add ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, and ELEVENLABS_PHONE_NUMBER_ID.',
          )
        }
        const approved = state.vendors.filter((vendor) => vendor.approved_for_contact)
        if (approved.length > 3) throw new Error('Real phone calls are limited to three venues at a time.')
        if (approved.some((vendor) => !vendor.contactable || !vendor.phone_e164)) {
          throw new Error('Every approved venue needs a validated telephone number before calling.')
        }
        const jobs: CallJob[] = []
        for (const vendor of approved) {
          const variables = dynamicVariables(state.event, vendor, state.permissions)
          const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
            method: 'POST',
            headers: { 'xi-api-key': environment.elevenLabsApiKey, 'content-type': 'application/json' },
            body: JSON.stringify({
              agent_id: environment.elevenLabsAgentId,
              agent_phone_number_id: environment.elevenLabsPhoneNumberId,
              to_number: vendor.phone_e164,
              conversation_initiation_client_data: { dynamic_variables: variables },
              call_recording_enabled: state.permissions.may_record_and_transcribe,
            }),
          })
          const responseBody = objectValue(await response.json())
          if (!response.ok) throw new Error(`ElevenLabs call failed for ${vendor.name} with status ${response.status}.`)
          jobs.push({
            event_id: state.event.event_id,
            vendor_id: vendor.vendor_id,
            vendor_name: vendor.name,
            to_number: vendor.phone_e164 as string,
            call_phase: 'quote_collection',
            execution_mode: 'real_phone',
            timestamp: new Date().toISOString(),
            success: true,
            message: 'Outbound call initiated',
            conversation_id: nullableString(responseBody.conversation_id) || nullableString(responseBody.conversationId),
            callSid: nullableString(responseBody.callSid) || nullableString(responseBody.call_sid),
            dynamic_variables: variables,
            result: null,
          })
        }
        state.jobs = [...state.jobs, ...jobs]
        await saveState(state)
        sendJson(res, 200, state)
        return
      }

      const recordingMatch = url.pathname.match(/^\/recording\/([^/]+)$/)
      if (req.method === 'GET' && recordingMatch) {
        if (!environment.elevenLabsApiKey) throw new Error('ELEVENLABS_API_KEY is missing.')
        const eventId = url.searchParams.get('eventId') || ''
        const state = await getState(eventId)
        const job = state.jobs.find(
          (candidate) => candidate.conversation_id === recordingMatch[1],
        )
        if (!job) throw new Error('This conversation does not belong to the requested event.')
        if (job.execution_mode === 'agent_simulation') {
          throw new Error('Automatic simulations are text-only and have no audio recording.')
        }
        const headers: Record<string, string> = { 'xi-api-key': environment.elevenLabsApiKey }
        if (typeof req.headers.range === 'string') headers.range = req.headers.range
        const response = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(recordingMatch[1])}/audio`,
          { headers },
        )
        if (!response.ok) {
          throw new Error(`ElevenLabs recording is not available yet (${response.status}).`)
        }
        res.statusCode = response.status
        res.setHeader('content-type', response.headers.get('content-type') || 'audio/mpeg')
        for (const header of ['accept-ranges', 'content-length', 'content-range'] as const) {
          const value = response.headers.get(header)
          if (value) res.setHeader(header, value)
        }
        res.setHeader('cache-control', 'private, max-age=300')
        res.end(Buffer.from(await response.arrayBuffer()))
        return
      }

      const resultMatch = url.pathname.match(/^\/result\/([^/]+)$/)
      if (req.method === 'GET' && resultMatch) {
        if (!environment.elevenLabsApiKey) throw new Error('ELEVENLABS_API_KEY is missing.')
        const eventId = url.searchParams.get('eventId') || ''
        const vendorId = url.searchParams.get('vendorId') || ''
        const state = await getState(eventId)
        const vendor = state.vendors.find((candidate) => candidate.vendor_id === vendorId)
        if (!vendor) throw new Error(`Vendor not found: ${vendorId}`)
        const job = state.jobs.find((candidate) => candidate.conversation_id === resultMatch[1])
        const response = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(resultMatch[1])}`,
          { headers: { 'xi-api-key': environment.elevenLabsApiKey } },
        )
        const raw = objectValue(await response.json())
        if (!response.ok) throw new Error(`ElevenLabs result request failed with status ${response.status}.`)
        const normalized = normalizedResult(
          raw,
          vendor,
          job?.execution_mode ?? 'real_phone',
          job?.call_phase ?? 'quote_collection',
        )
        const style = negotiationStyleValue(job?.dynamic_variables.negotiation_style)
        const openingTotal = numberValue(job?.dynamic_variables.opening_quote_eur)
        const competingQuote = numberValue(job?.dynamic_variables.competing_quote_eur)
        const finalTotal = normalized.quote.fixed_total_eur
        const enriched = {
          ...normalized,
          negotiation: {
            style,
            style_label: negotiationStyleDetails[style].label,
            round: job?.call_phase ?? 'quote_collection',
            opening_total_eur: openingTotal ?? finalTotal,
            final_total_eur: finalTotal,
            savings_eur:
              openingTotal !== null && finalTotal !== null
                ? Math.max(0, openingTotal - finalTotal)
                : 0,
            competing_quote_eur: competingQuote && competingQuote > 0 ? competingQuote : null,
            competing_vendor_name:
              nullableString(job?.dynamic_variables.competing_quote_scope) ?? null,
            leverage_used:
              job?.call_phase === 'leverage_negotiation' &&
              competingQuote !== null &&
              competingQuote > 0,
            price_changed:
              job?.call_phase === 'leverage_negotiation' &&
              openingTotal !== null &&
              finalTotal !== null &&
              finalTotal < openingTotal,
            evidence:
              job?.call_phase === 'leverage_negotiation'
                ? `The caller was supplied a genuine EUR ${competingQuote} competing quote for this follow-up.`
                : `${negotiationStyleDetails[style].label} opening quotation.`,
          },
        }
        if (job) {
          job.result = enriched
          await saveState(state)
        }
        sendJson(res, 200, enriched)
        return
      }

      next()
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }
  return handler
}
