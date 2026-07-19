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
    budget_currency: toStringOrEmpty(raw.budget_currency),
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

export const EVENT_VALIDATION_SCHEMA = {
  type: 'object',
  properties: {
    valid: { type: 'boolean' },
    fieldErrors: {
      type: 'object',
      properties: Object.fromEntries(EVENT_FIELD_KEYS.map((key) => [key, { type: ['string', 'null'] }])),
      required: [...EVENT_FIELD_KEYS],
      additionalProperties: false,
    },
  },
  required: ['valid', 'fieldErrors'],
  additionalProperties: false,
} as const

export const EVENT_VALIDATION_SYSTEM_PROMPT = `You validate event-sourcing intake data collected for Bidly, a voice-first event-planning service. You will receive a JSON object with these fields: ${EVENT_FIELD_KEYS.join(', ')}.

Check every rule below and return valid:true ONLY if all of them pass. For any field that fails, set a short, specific, user-facing error message (e.g. "Enter a number of guests greater than 0") in fieldErrors under that field's exact key. Every field not listed as an error must be set to null in fieldErrors, and valid must be false if fieldErrors has at least one non-null entry.

Rules:
1. event_category must be exactly "private" or "corporate".
2. requester must be a non-empty string (the caller's name if private, the company name if corporate).
3. event_type must be a non-empty string describing the kind of event.
4. Exactly one of these must be true: (a) fixed_date is a valid date and date_range_start/date_range_end are both empty, or (b) fixed_date is empty and BOTH date_range_start and date_range_end are valid dates with date_range_start on or before date_range_end. Flag fixed_date if violated, or date_range_start/date_range_end individually if the range is incomplete or reversed.
5. Exactly one of these must be true: (a) fixed_start_time is a valid time and start_time_start/start_time_end are both empty, or (b) fixed_start_time is empty and BOTH start_time_start and start_time_end are valid times with start_time_start on or before start_time_end. Flag fixed_start_time if violated, or start_time_start/start_time_end individually if the range is incomplete or reversed.
6. duration must be a positive number (hours).
7. location must be a non-empty string.
8. location_radius_km must be a positive number.
9. guest_count must be a positive whole number.
10. Check catering_required FIRST. If catering_required is false: venue_catering_mandatory and catering_food are IRRELEVANT — you MUST set both to null in fieldErrors no matter what value they hold (empty, null, non-empty, anything). Do NOT apply any non-empty/required check to them in this case. Only if catering_required is true: venue_catering_mandatory must be true or false (not null), and catering_food must be non-empty — flag whichever of those two is missing.
11. If budget_per_guest is set, budget_currency must also be non-empty (and vice versa) — ANY non-empty text is acceptable for budget_currency (e.g. "euros", "EUR", "€", "US dollars" are all fine); do not require a specific format, code, or symbol. Leaving both budget_per_guest and budget_currency empty (no budget limit given) is valid and should not be flagged.

IMPORTANT: These 11 rules are the ONLY validation criteria. Do not invent, infer, or apply any additional requirement, format, or convention beyond exactly what a rule states — if a rule doesn't apply given the current field values (e.g. rule 10 when catering_required is false), that field's entry in fieldErrors must be null.`
