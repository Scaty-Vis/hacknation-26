import type { Config } from '@netlify/functions'
import { eventBidApi } from '../../server/eventbid.js'
import { createBlobsPersistence } from './lib/eventbidBlobsPersistence.js'
import { invokeConnectHandler } from './lib/connectShim.js'

// Netlify Functions equivalent of the eventBidPlugin Vite middleware
// (vite.config.ts) for every Module 2/3 route EXCEPT /simulate-approved,
// which is excluded below so it always goes to the background function
// instead (Netlify's docs don't guarantee exact-path-over-wildcard
// precedence when two functions' paths overlap, so this is made explicit
// rather than relied upon implicitly). Reuses eventBidApi()'s exact
// routing/business logic unchanged via the Connect shim, with Blobs instead
// of the filesystem for state.
export default async (req: Request) => {
  const handler = eventBidApi(
    {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      // Module 2/3's venue-calling agent can live under a different
      // ElevenLabs account than Module 1's intake agent, so it gets its own key.
      elevenLabsApiKey: process.env.ELEVENLABS_API_KEY_2,
      elevenLabsAgentId: process.env.ELEVENLABS_AGENT_ID,
      elevenLabsPhoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID,
      mockTestPhone: process.env.MOCK_TEST_PHONE,
    },
    createBlobsPersistence(),
  )

  return invokeConnectHandler(handler, req, '/api/eventbid')
}

export const config: Config = {
  path: '/api/eventbid/*',
  excludedPath: '/api/eventbid/simulate-approved',
}
