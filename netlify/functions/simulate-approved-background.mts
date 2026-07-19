import type { Config } from '@netlify/functions'
import { eventBidApi } from '../../server/eventbid.js'
import { createBlobsPersistence } from './lib/eventbidBlobsPersistence.js'
import { invokeConnectHandler } from './lib/connectShim.js'

// POST /simulate-approved runs up to 5 parallel ElevenLabs simulate-conversation
// calls (60s timeout each) followed by a sequential leverage-negotiation call —
// worst case ~120s, far beyond Netlify's synchronous Functions timeout. As a
// background function (up to 15 min, free tier included) Netlify invokes this
// asynchronously and the client gets an immediate 202 with no body; the real
// result lands in Blobs via the same saveState() call this route already
// makes, and the client polls /resume (src/lib/eventbidApi.ts) until it's
// there — the same pending-job/"Refresh results" pattern already used for
// real phone calls in AnalysisPanel.tsx.
export default async (req: Request) => {
  const handler = eventBidApi(
    {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
      elevenLabsAgentId: process.env.ELEVENLABS_AGENT_ID,
      elevenLabsPhoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID,
      mockTestPhone: process.env.MOCK_TEST_PHONE,
    },
    createBlobsPersistence(),
  )

  return invokeConnectHandler(handler, req, '/api/eventbid')
}

export const config: Config = {
  background: true,
  path: '/api/eventbid/simulate-approved',
}
