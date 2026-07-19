export type EventCategory = 'private' | 'corporate'

export type EventDetails = {
  event_category: EventCategory | null
  requester: string
  event_type: string
  fixed_date: string | null
  date_range_start: string | null
  date_range_end: string | null
  fixed_start_time: string | null
  start_time_start: string | null
  start_time_end: string | null
  duration: number | null
  location: string
  location_radius_km: number | null
  guest_count: number | null
  guest_count_exact: boolean
  catering_required: boolean
  venue_catering_mandatory: boolean | null
  budget_per_guest: number | null
  budget_currency: string
  catering_food: string
}

export const DEFAULT_LOCATION_RADIUS_KM = 50

function toBoolTriState(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return null
}

function toBool(value: unknown): boolean {
  return toBoolTriState(value) === true
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function toStringOrEmpty(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

function toDateOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '' && value.trim().toLowerCase() !== 'null') {
    return value
  }
  return null
}

function toEventCategory(value: unknown): EventCategory | null {
  return value === 'private' || value === 'corporate' ? value : null
}

export const CURRENCY_PRESETS = ['Euros', 'US dollars', 'British pounds', 'Swiss francs'] as const

const CURRENCY_ALIASES: Record<string, string> = {
  euro: 'Euros',
  euros: 'Euros',
  eur: 'Euros',
  '€': 'Euros',
  dollar: 'US dollars',
  dollars: 'US dollars',
  usd: 'US dollars',
  'us dollar': 'US dollars',
  'us dollars': 'US dollars',
  $: 'US dollars',
  pound: 'British pounds',
  pounds: 'British pounds',
  gbp: 'British pounds',
  'british pound': 'British pounds',
  'british pounds': 'British pounds',
  '£': 'British pounds',
  franc: 'Swiss francs',
  francs: 'Swiss francs',
  chf: 'Swiss francs',
  'swiss franc': 'Swiss francs',
  'swiss francs': 'Swiss francs',
}

/** Maps common currency spellings (whatever casing ElevenLabs happens to return) to a canonical, capitalized label. */
export function normalizeCurrency(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return CURRENCY_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

/**
 * Tolerant coercion for whatever ElevenLabs' Data Collection actually returns —
 * booleans sometimes arrive as "true"/"false" strings, and some "unset" values
 * arrive as the literal string "null" rather than JSON null.
 */
export function normalizeEventDetails(raw: Record<string, unknown>): EventDetails {
  return {
    event_category: toEventCategory(raw.event_category),
    requester: toStringOrEmpty(raw.requester),
    event_type: toStringOrEmpty(raw.event_type),
    fixed_date: toDateOrNull(raw.fixed_date),
    date_range_start: toDateOrNull(raw.date_range_start),
    date_range_end: toDateOrNull(raw.date_range_end),
    fixed_start_time: toDateOrNull(raw.fixed_start_time),
    start_time_start: toDateOrNull(raw.start_time_start),
    start_time_end: toDateOrNull(raw.start_time_end),
    duration: toNumber(raw.duration),
    location: toStringOrEmpty(raw.location),
    location_radius_km: toNumber(raw.location_radius_km) ?? DEFAULT_LOCATION_RADIUS_KM,
    guest_count: toNumber(raw.guest_count),
    guest_count_exact: toBool(raw.guest_count_exact),
    catering_required: toBool(raw.catering_required),
    venue_catering_mandatory: toBoolTriState(raw.venue_catering_mandatory),
    budget_per_guest: toNumber(raw.budget_per_guest),
    budget_currency: normalizeCurrency(toStringOrEmpty(raw.budget_currency)),
    catering_food: toStringOrEmpty(raw.catering_food),
  }
}

export function wasLocationRadiusDefaulted(raw: Record<string, unknown>): boolean {
  return toNumber(raw.location_radius_km) === null
}

export function deriveDateFlexible(details: EventDetails): boolean {
  if (details.fixed_date) return false
  return Boolean(details.date_range_start || details.date_range_end)
}

export function deriveTimeFlexible(details: EventDetails): boolean {
  if (details.fixed_start_time) return false
  return Boolean(details.start_time_start || details.start_time_end)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const MAX_YEARS_AHEAD = 5

function maxFutureDateIso(): string {
  const date = new Date()
  date.setUTCFullYear(date.getUTCFullYear() + MAX_YEARS_AHEAD)
  return date.toISOString().slice(0, 10)
}

/**
 * Deterministic checks for every field that's objectively right-or-wrong —
 * no LLM judgment needed. Date and time are validated independently of each
 * other by construction (two separate blocks, disjoint field sets) so a
 * flexible date range can never affect whether a fixed start time is valid.
 */
export function runClassicalValidation(details: EventDetails): Partial<Record<EventFieldKey, string>> {
  const errors: Partial<Record<EventFieldKey, string>> = {}
  const today = todayIso()

  if (details.event_category !== 'private' && details.event_category !== 'corporate') {
    errors.event_category = 'Select private or corporate.'
  }

  // Date — independent of time.
  const hasFixedDate = Boolean(details.fixed_date)
  const hasDateRange = Boolean(details.date_range_start || details.date_range_end)
  const maxFuture = maxFutureDateIso()
  if (hasFixedDate && hasDateRange) {
    errors.fixed_date = 'Provide either a fixed date or a date range, not both.'
  } else if (hasFixedDate) {
    if (details.fixed_date! < today) errors.fixed_date = 'Event date must be today or in the future.'
    else if (details.fixed_date! > maxFuture)
      errors.fixed_date = `Event date cannot be more than ${MAX_YEARS_AHEAD} years from now.`
  } else if (hasDateRange) {
    if (!details.date_range_start || !details.date_range_end) {
      errors[details.date_range_start ? 'date_range_end' : 'date_range_start'] =
        'Both the earliest and latest acceptable dates are required.'
    } else if (details.date_range_start < today) {
      errors.date_range_start = 'Start of date range must be today or in the future.'
    } else if (details.date_range_start > details.date_range_end) {
      errors.date_range_start = 'Date range start must be on or before date range end.'
      errors.date_range_end = 'Date range start must be on or before date range end.'
    } else if (details.date_range_end > maxFuture) {
      errors.date_range_end = `Date range cannot extend more than ${MAX_YEARS_AHEAD} years from now.`
    }
  } else {
    errors.fixed_date = 'Provide either a fixed date or a date range.'
  }

  // Start time — independent of date; a bare time-of-day has no "in the past" check.
  const hasFixedTime = Boolean(details.fixed_start_time)
  const hasTimeRange = Boolean(details.start_time_start || details.start_time_end)
  if (hasFixedTime && hasTimeRange) {
    errors.fixed_start_time = 'Provide either a fixed start time or a time range, not both.'
  } else if (hasTimeRange) {
    if (!details.start_time_start || !details.start_time_end) {
      errors[details.start_time_start ? 'start_time_end' : 'start_time_start'] =
        'Both the earliest and latest acceptable start times are required.'
    } else if (details.start_time_start > details.start_time_end) {
      errors.start_time_start = 'Start time range start must be on or before its end.'
      errors.start_time_end = 'Start time range start must be on or before its end.'
    }
  } else if (!hasFixedTime) {
    errors.fixed_start_time = 'Provide either a fixed start time or a time range.'
  }

  if (!details.guest_count || details.guest_count <= 0 || !Number.isInteger(details.guest_count)) {
    errors.guest_count = 'Enter a whole number of guests greater than 0.'
  }

  if (details.location_radius_km == null || details.location_radius_km <= 0) {
    errors.location_radius_km = 'Enter a positive number for the travel radius.'
  }

  if (details.catering_required && details.venue_catering_mandatory == null) {
    errors.venue_catering_mandatory = 'Choose whether venue catering is mandatory or external catering is acceptable.'
  }

  const hasBudgetAmount = details.budget_per_guest != null
  const hasBudgetCurrency = Boolean(details.budget_currency)
  if (hasBudgetAmount !== hasBudgetCurrency) {
    if (!hasBudgetCurrency) errors.budget_currency = 'Enter a currency to go with the budget amount.'
    if (!hasBudgetAmount) errors.budget_per_guest = 'Enter a budget amount to go with the currency.'
  } else if (hasBudgetAmount && details.budget_per_guest! <= 0) {
    errors.budget_per_guest = 'Enter a positive budget amount.'
  }

  return errors
}

export const EVENT_FIELD_KEYS = [
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
] as const satisfies readonly (keyof EventDetails)[]

export type EventFieldKey = (typeof EVENT_FIELD_KEYS)[number]

/**
 * Everything else (event_category, dates, times, guest_count, budget, etc.)
 * is objectively right-or-wrong and handled by runClassicalValidation instead
 * — the LLM is reserved for fields that need actual judgment, which also
 * keeps this payload/schema small and keeps token cost down.
 */
export const LLM_VALIDATED_FIELD_KEYS = [
  'requester',
  'event_type',
  'location',
  'catering_food',
  'duration',
] as const satisfies readonly EventFieldKey[]

export type LlmValidatedFieldKey = (typeof LLM_VALIDATED_FIELD_KEYS)[number]

export const EVENT_VALIDATION_SCHEMA = {
  type: 'object',
  properties: {
    valid: { type: 'boolean' },
    fieldErrors: {
      type: 'object',
      properties: Object.fromEntries(LLM_VALIDATED_FIELD_KEYS.map((key) => [key, { type: ['string', 'null'] }])),
      required: [...LLM_VALIDATED_FIELD_KEYS],
      additionalProperties: false,
    },
  },
  required: ['valid', 'fieldErrors'],
  additionalProperties: false,
} as const

export const EVENT_VALIDATION_SYSTEM_PROMPT = `You validate a handful of free-text/judgment fields from event-sourcing intake data for Bidly, a voice-first event-planning service. Every other field in the real data has already been checked mechanically — you only judge these: requester, event_type, location, catering_food, duration. You will also receive catering_required as read-only context (never validate or flag it yourself).

Check every rule below and return valid:true ONLY if all of them pass. For any field that fails, set a short, specific, user-facing error message in fieldErrors under that field's exact key. Every field not listed as an error must be set to null in fieldErrors, and valid must be false if fieldErrors has at least one non-null entry.

Rules:
1. requester must be a plausible real name or company name (non-empty, not gibberish).
2. event_type must plausibly name a real kind of event (e.g. wedding, birthday, conference, product launch, team offsite) — reject gibberish or text that clearly isn't a kind of event.
3. location must plausibly be a real place, city, or venue area — reject clearly nonsensical entries (e.g. "paper towel" is NOT a location).
4. duration must be a sensible number of hours for a single real-world event (e.g. 1–48 is normal) — reject non-positive numbers and absurd values (e.g. 1000 hours is never sensible for one event).
5. catering_food is only evaluated when catering_required is true: it must then be a plausible description of food/catering (non-empty, not gibberish). When catering_required is false, ALWAYS set catering_food to null in fieldErrors regardless of its value — never flag it.

IMPORTANT: These 5 rules are the ONLY validation criteria. Do not invent, infer, or apply any additional requirement beyond exactly what a rule states.`
