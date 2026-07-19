import type { Config } from '@netlify/functions'
import {
  EVENT_VALIDATION_SCHEMA,
  EVENT_VALIDATION_SYSTEM_PROMPT,
  LLM_VALIDATED_FIELD_KEYS,
  runClassicalValidation,
  type EventDetails,
  type EventFieldKey,
} from '../../src/lib/eventDetails.js'

// Netlify Functions equivalent of the openAiValidationProxy Vite middleware
// (vite.config.ts) — keeps OPEN_AI_API_KEY out of the client bundle. Runs the
// same classical + LLM validation split, reusing src/lib/eventDetails.ts as-is.
export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    })
  }

  const apiKey = process.env.OPEN_AI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OPEN_AI_API_KEY is not set. Add it in Site settings > Environment variables.' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }

  try {
    const values = (await req.json()) as EventDetails
    const classicalErrors = runClassicalValidation(values)

    // Only the fields that need judgment go to the LLM — smaller payload,
    // fewer tokens. catering_required is included as read-only context so
    // the model knows whether catering_food even applies.
    const llmPayload: Record<string, unknown> = { catering_required: values.catering_required }
    for (const key of LLM_VALIDATED_FIELD_KEYS) llmPayload[key] = values[key]

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: EVENT_VALIDATION_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(llmPayload) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'event_validation',
            schema: EVENT_VALIDATION_SCHEMA,
            strict: true,
          },
        },
      }),
    })

    const upstreamBody = (await upstream.json()) as {
      error?: { message?: string }
      choices?: { message?: { content?: string } }[]
    }

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: upstreamBody?.error?.message ?? 'OpenAI request failed' }), {
        status: upstream.status,
        headers: { 'content-type': 'application/json' },
      })
    }

    const llmResult = JSON.parse(upstreamBody.choices?.[0]?.message?.content ?? '{}') as {
      fieldErrors?: Partial<Record<EventFieldKey, string | null>>
    }

    const fieldErrors: Partial<Record<EventFieldKey, string>> = { ...classicalErrors }
    for (const key of LLM_VALIDATED_FIELD_KEYS) {
      const message = llmResult.fieldErrors?.[key]
      if (message) fieldErrors[key] = message
    }
    const valid = Object.values(fieldErrors).every((message) => !message)

    return new Response(JSON.stringify({ valid, fieldErrors }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }
}

export const config: Config = {
  path: '/api/validate-event',
}
