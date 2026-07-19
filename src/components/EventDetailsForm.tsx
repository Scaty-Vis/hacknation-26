import { useState } from 'react'
import type { ReactNode } from 'react'
import { downloadJson } from '../lib/downloadJson'
import {
  CURRENCY_PRESETS,
  deriveDateFlexible,
  deriveTimeFlexible,
  EVENT_FIELD_KEYS,
  type EventCategory,
  type EventDetails,
  type EventFieldKey,
} from '../lib/eventDetails'

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

type EventDetailsFormProps = {
  initialValues: EventDetails
  radiusDefaulted: boolean
  conversationId: string | null
  agentId: string
  onSubmitted: (values: EventDetails) => void
}

type FieldRowProps = {
  label: string
  error?: string
  hint?: string
  children: ReactNode
}

function FieldRow({ label, error, hint, children }: FieldRowProps) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="w-1/3 py-3 pr-4 align-top text-sm font-medium text-foreground">{label}</td>
      <td className="py-3 align-top">
        {children}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
    </tr>
  )
}

function EventDetailsForm({ initialValues, radiusDefaulted, conversationId, agentId, onSubmitted }: EventDetailsFormProps) {
  const [values, setValues] = useState<EventDetails>(initialValues)
  const [dateFlexible, setDateFlexible] = useState(() => deriveDateFlexible(initialValues))
  const [timeFlexible, setTimeFlexible] = useState(() => deriveTimeFlexible(initialValues))
  const [consent, setConsent] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EventFieldKey, string>>>({})
  const [isValidating, setIsValidating] = useState(false)
  const [serviceError, setServiceError] = useState<string | null>(null)

  const setField = <K extends keyof EventDetails>(key: K, value: EventDetails[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const toggleDateFlexible = (next: boolean) => {
    setDateFlexible(next)
    if (next) setValues((prev) => ({ ...prev, fixed_date: null }))
    else setValues((prev) => ({ ...prev, date_range_start: null, date_range_end: null }))
  }

  const toggleTimeFlexible = (next: boolean) => {
    setTimeFlexible(next)
    if (next) setValues((prev) => ({ ...prev, fixed_start_time: null }))
    else setValues((prev) => ({ ...prev, start_time_start: null, start_time_end: null }))
  }

  const requesterLabel =
    values.event_category === 'private' ? "Caller's name" : values.event_category === 'corporate' ? 'Company name' : 'Name'

  const currencyOptions =
    values.budget_currency && !(CURRENCY_PRESETS as readonly string[]).includes(values.budget_currency)
      ? [...CURRENCY_PRESETS, values.budget_currency]
      : CURRENCY_PRESETS

  const handleDownload = () => {
    downloadJson('event-details.json', {
      conversationId,
      agentId,
      collectedAt: new Date().toISOString(),
      variables: values,
    })
  }

  const handleSubmit = async () => {
    if (!consent) return
    setIsValidating(true)
    setServiceError(null)
    try {
      const res = await fetch('/api/validate-event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      })
      const body = await res.json()
      if (!res.ok) {
        setServiceError(body?.error ?? 'Validation service failed. Please try again.')
        return
      }
      if (body.valid) {
        onSubmitted(values)
        return
      }
      const errors: Partial<Record<EventFieldKey, string>> = {}
      for (const key of EVENT_FIELD_KEYS) {
        const message = body.fieldErrors?.[key]
        if (message) errors[key] = message
      }
      setFieldErrors(errors)
    } catch (err) {
      console.error(err)
      setServiceError('Could not reach the validation service. Please try again.')
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <table className="w-full border-collapse">
        <tbody>
          <FieldRow label="Event type" error={fieldErrors.event_category}>
            <select
              value={values.event_category ?? ''}
              onChange={(e) =>
                setField('event_category', e.target.value === '' ? null : (e.target.value as EventCategory))
              }
              className={inputClass}
            >
              <option value="" disabled>
                Select...
              </option>
              <option value="private">Private</option>
              <option value="corporate">Corporate</option>
            </select>
          </FieldRow>

          <FieldRow label={requesterLabel} error={fieldErrors.requester}>
            <input
              type="text"
              value={values.requester}
              onChange={(e) => setField('requester', e.target.value)}
              className={inputClass}
            />
          </FieldRow>

          <FieldRow label="Kind of event" error={fieldErrors.event_type}>
            <input
              type="text"
              value={values.event_type}
              onChange={(e) => setField('event_type', e.target.value)}
              placeholder="e.g. wedding, birthday, conference"
              className={inputClass}
            />
          </FieldRow>

          <FieldRow label="Date is flexible">
            <input
              type="checkbox"
              checked={dateFlexible}
              onChange={(e) => toggleDateFlexible(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </FieldRow>

          {!dateFlexible && (
            <FieldRow label="Event date" error={fieldErrors.fixed_date}>
              <input
                type="date"
                value={values.fixed_date ?? ''}
                onChange={(e) => setField('fixed_date', e.target.value || null)}
                className={inputClass}
              />
            </FieldRow>
          )}
          {dateFlexible && (
            <>
              <FieldRow label="Earliest acceptable date" error={fieldErrors.date_range_start}>
                <input
                  type="date"
                  value={values.date_range_start ?? ''}
                  onChange={(e) => setField('date_range_start', e.target.value || null)}
                  className={inputClass}
                />
              </FieldRow>
              <FieldRow label="Latest acceptable date" error={fieldErrors.date_range_end}>
                <input
                  type="date"
                  value={values.date_range_end ?? ''}
                  onChange={(e) => setField('date_range_end', e.target.value || null)}
                  className={inputClass}
                />
              </FieldRow>
            </>
          )}

          <FieldRow label="Start time is flexible">
            <input
              type="checkbox"
              checked={timeFlexible}
              onChange={(e) => toggleTimeFlexible(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </FieldRow>

          {!timeFlexible && (
            <FieldRow label="Start time" error={fieldErrors.fixed_start_time}>
              <input
                type="time"
                value={values.fixed_start_time ?? ''}
                onChange={(e) => setField('fixed_start_time', e.target.value || null)}
                className={inputClass}
              />
            </FieldRow>
          )}
          {timeFlexible && (
            <>
              <FieldRow label="Earliest acceptable start time" error={fieldErrors.start_time_start}>
                <input
                  type="time"
                  value={values.start_time_start ?? ''}
                  onChange={(e) => setField('start_time_start', e.target.value || null)}
                  className={inputClass}
                />
              </FieldRow>
              <FieldRow label="Latest acceptable start time" error={fieldErrors.start_time_end}>
                <input
                  type="time"
                  value={values.start_time_end ?? ''}
                  onChange={(e) => setField('start_time_end', e.target.value || null)}
                  className={inputClass}
                />
              </FieldRow>
            </>
          )}

          <FieldRow label="Expected duration (hours)" error={fieldErrors.duration}>
            <input
              type="number"
              min={0}
              step={0.5}
              value={values.duration ?? ''}
              onChange={(e) => setField('duration', e.target.value === '' ? null : Number(e.target.value))}
              className={inputClass}
            />
          </FieldRow>

          <FieldRow label="Desired location (city/venue area)" error={fieldErrors.location}>
            <input
              type="text"
              value={values.location}
              onChange={(e) => setField('location', e.target.value)}
              className={inputClass}
            />
          </FieldRow>

          <FieldRow
            label="Acceptable travel radius (km)"
            error={fieldErrors.location_radius_km}
            hint={radiusDefaulted ? 'Defaulted to 50 km since no preference was given — adjust if needed.' : undefined}
          >
            <input
              type="number"
              min={0}
              value={values.location_radius_km ?? ''}
              onChange={(e) =>
                setField('location_radius_km', e.target.value === '' ? null : Number(e.target.value))
              }
              className={inputClass}
            />
          </FieldRow>

          <FieldRow label="Number of guests" error={fieldErrors.guest_count}>
            <input
              type="number"
              min={0}
              step={1}
              value={values.guest_count ?? ''}
              onChange={(e) => setField('guest_count', e.target.value === '' ? null : Number(e.target.value))}
              className={inputClass}
            />
          </FieldRow>

          <FieldRow label="This is an exact headcount" error={fieldErrors.guest_count_exact}>
            <input
              type="checkbox"
              checked={values.guest_count_exact}
              onChange={(e) => setField('guest_count_exact', e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </FieldRow>

          <FieldRow label="Catering required">
            <input
              type="checkbox"
              checked={values.catering_required}
              onChange={(e) => setField('catering_required', e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </FieldRow>

          {values.catering_required && (
            <>
              <FieldRow label="Venue catering" error={fieldErrors.venue_catering_mandatory}>
                <select
                  value={
                    values.venue_catering_mandatory === null
                      ? 'unspecified'
                      : values.venue_catering_mandatory
                        ? 'mandatory'
                        : 'external'
                  }
                  onChange={(e) =>
                    setField(
                      'venue_catering_mandatory',
                      e.target.value === 'unspecified' ? null : e.target.value === 'mandatory',
                    )
                  }
                  className={inputClass}
                >
                  <option value="unspecified">Not specified</option>
                  <option value="mandatory">Venue catering is mandatory</option>
                  <option value="external">External catering is acceptable</option>
                </select>
              </FieldRow>
              <FieldRow label="Type of catering" error={fieldErrors.catering_food}>
                <input
                  type="text"
                  value={values.catering_food}
                  onChange={(e) => setField('catering_food', e.target.value)}
                  className={inputClass}
                />
              </FieldRow>
            </>
          )}

          <FieldRow label="Per-guest budget ceiling" error={fieldErrors.budget_per_guest}>
            <input
              type="number"
              min={0}
              value={values.budget_per_guest ?? ''}
              onChange={(e) => setField('budget_per_guest', e.target.value === '' ? null : Number(e.target.value))}
              placeholder="No limit"
              className={inputClass}
            />
          </FieldRow>

          <FieldRow label="Currency" error={fieldErrors.budget_currency}>
            <select
              value={values.budget_currency || ''}
              onChange={(e) => setField('budget_currency', e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Select...
              </option>
              {currencyOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </FieldRow>
        </tbody>
      </table>

      <div className="mt-6 flex flex-col gap-4 border-t border-border pt-6">
        <button
          type="button"
          onClick={handleDownload}
          className="self-start rounded-lg border border-border px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-background"
        >
          Download JSON
        </button>

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          By ticking this box I agree to automated vendor discovery, calling, and negotiation on my behalf.
        </label>

        {serviceError && <p className="text-sm text-destructive">{serviceError}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!consent || isValidating}
          className="self-start rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isValidating ? 'Validating…' : 'Submit'}
        </button>
      </div>
    </div>
  )
}

export default EventDetailsForm
