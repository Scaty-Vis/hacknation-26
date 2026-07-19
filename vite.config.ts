import { defineConfig, loadEnv } from 'vite'
import type { Connect } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  EVENT_VALIDATION_SCHEMA,
  EVENT_VALIDATION_SYSTEM_PROMPT,
  LLM_VALIDATED_FIELD_KEYS,
  runClassicalValidation,
  type EventDetails,
  type EventFieldKey,
} from './src/lib/eventDetails.js'
import { eventBidApi } from './server/eventbid.js'

// Proxies GET /api/conversations/:id to the ElevenLabs Conversations API,
// keeping the xi-api-key out of the client bundle.
function elevenLabsConversationsProxy(apiKey: string | undefined) {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const match = req.url?.match(/^\/conversations\/([^/?]+)/)
    if (req.method !== 'GET' || !match) {
      next()
      return
    }

    if (!apiKey) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'ELEVENLABS_API_KEY is not set. Add it to .env.' }))
      return
    }

    fetch(`https://api.elevenlabs.io/v1/convai/conversations/${match[1]}`, {
      headers: { 'xi-api-key': apiKey },
    })
      .then(async (upstream) => {
        const body = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('content-type', 'application/json')
        res.end(body)
      })
      .catch((err) => {
        res.statusCode = 502
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: String(err) }))
      })
  }

  return {
    name: 'elevenlabs-conversations-proxy',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use('/api', handler)
    },
    configurePreviewServer(server: import('vite').PreviewServer) {
      server.middlewares.use('/api', handler)
    },
  }
}

async function readJsonBody(req: Connect.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf-8')
  return raw ? JSON.parse(raw) : {}
}

// Uses deterministic validation for objective fields and OpenAI only for
// judgment-based fields when an API key and model are configured.
function openAiValidationProxy(apiKey: string | undefined, model: string | undefined) {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (req.method !== 'POST' || !req.url?.match(/^\/validate-event/)) {
      next()
      return
    }

    readJsonBody(req)
      .then(async (body) => {
        const values = body as EventDetails
        const classicalErrors = runClassicalValidation(values)

        if (!apiKey || !model) {
          const valid = Object.values(classicalErrors).every((message) => !message)
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ valid, fieldErrors: classicalErrors }))
          return
        }

        const llmPayload: Record<string, unknown> = {
          catering_required: values.catering_required,
        }
        for (const key of LLM_VALIDATED_FIELD_KEYS) llmPayload[key] = values[key]

        const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
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
          res.statusCode = upstream.status
          res.setHeader('content-type', 'application/json')
          res.end(
            JSON.stringify({
              error: upstreamBody.error?.message ?? 'OpenAI request failed',
            }),
          )
          return
        }

        const llmResult = JSON.parse(
          upstreamBody.choices?.[0]?.message?.content ?? '{}',
        ) as {
          fieldErrors?: Partial<Record<EventFieldKey, string | null>>
        }

        const fieldErrors: Partial<Record<EventFieldKey, string>> = {
          ...classicalErrors,
        }
        for (const key of LLM_VALIDATED_FIELD_KEYS) {
          const message = llmResult.fieldErrors?.[key]
          if (message) fieldErrors[key] = message
        }
        const valid = Object.values(fieldErrors).every((message) => !message)

        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ valid, fieldErrors }))
      })
      .catch((err) => {
        res.statusCode = 502
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: String(err) }))
      })
  }

  return {
    name: 'openai-validation-proxy',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use('/api', handler)
    },
    configurePreviewServer(server: import('vite').PreviewServer) {
      server.middlewares.use('/api', handler)
    },
  }
}

function eventBidPlugin(environment: Record<string, string>) {
  const handler = () =>
    eventBidApi({
      googleMapsApiKey: environment.GOOGLE_MAPS_API_KEY,
      elevenLabsApiKey: environment.ELEVENLABS_API_KEY,
      elevenLabsAgentId: environment.ELEVENLABS_AGENT_ID,
      elevenLabsPhoneNumberId: environment.ELEVENLABS_PHONE_NUMBER_ID,
      mockTestPhone: environment.MOCK_TEST_PHONE,
    })

  return {
    name: 'eventbid-api',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use('/api/eventbid', handler())
    },
    configurePreviewServer(server: import('vite').PreviewServer) {
      server.middlewares.use('/api/eventbid', handler())
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tailwindcss(),
      elevenLabsConversationsProxy(env.ELEVENLABS_API_KEY),
      openAiValidationProxy(env.OPEN_AI_API_KEY, env.OPEN_AI_MODEL),
      eventBidPlugin(env),
    ],
  }
})
