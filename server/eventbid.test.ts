import assert from 'node:assert/strict'
import test from 'node:test'
import {
  haversineKm,
  negotiatedSimulationProfile,
  negotiationStyleForIndex,
  normalizePhone,
  validateEventDeterministically,
} from './eventbid.ts'

const validEvent = {
  event_category: 'private',
  requester: 'Kai',
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
  catering_food: '',
  budget_per_guest: 250,
  budget_currency: 'euros',
}

test('valid Module 1 data passes deterministic local validation', () => {
  assert.equal(validateEventDeterministically(validEvent).valid, true)
})

test('invalid guest counts are rejected', () => {
  const result = validateEventDeterministically({ ...validEvent, guest_count: 0 })
  assert.equal(result.valid, false)
  assert.match(result.fieldErrors.guest_count ?? '', /greater than 0/)
})

test('German telephone numbers normalize conservatively to E.164', () => {
  assert.equal(normalizePhone('+49 30 123456'), '+4930123456')
  assert.equal(normalizePhone('not a phone'), null)
})

test('haversine distance distinguishes inside and outside a 20 km radius', () => {
  assert.equal(haversineKm(52.52, 13.405, 52.52, 13.405), 0)
  assert.ok(haversineKm(52.52, 13.405, 52.52, 13.8) > 20)
})

test('the first three approved venues receive distinct negotiation styles', () => {
  assert.deepEqual(
    [0, 1, 2].map(negotiationStyleForIndex),
    ['tough_gatekeeper', 'practical_dealmaker', 'premium_upseller'],
  )
})

test('a prepared leverage concession lowers the fixed total and stays itemized', () => {
  const opening = {
    contact_name: 'Mina',
    capacity: 120,
    preferred_date_available: true,
    capacity_suitable: true,
    mandatory_requirements_met: true,
    venue_fee_eur: 2000,
    catering_fee_eur: 2500,
    drinks_fee_eur: 500,
    cleaning_fee_eur: 250,
    equipment_fee_eur: 200,
    staff_security_fee_eur: 0,
    service_fee_eur: 150,
    other_mandatory_fees_eur: 0,
    fixed_total_eur: 5600,
    tax_included: true,
    deposit_percent: 30,
    cancellation_terms: 'Deposit is non-refundable within 30 days.',
    quote_valid_until: '2026-08-01',
    written_quote_promised: true,
  }
  const negotiated = negotiatedSimulationProfile(opening, 'practical_dealmaker')
  const itemizedTotal =
    negotiated.venue_fee_eur +
    negotiated.catering_fee_eur +
    negotiated.drinks_fee_eur +
    negotiated.cleaning_fee_eur +
    negotiated.equipment_fee_eur +
    negotiated.staff_security_fee_eur +
    negotiated.service_fee_eur +
    negotiated.other_mandatory_fees_eur

  assert.ok(negotiated.fixed_total_eur < opening.fixed_total_eur)
  assert.equal(negotiated.fixed_total_eur, itemizedTotal)
  assert.equal(negotiated.deposit_percent, 25)
})
