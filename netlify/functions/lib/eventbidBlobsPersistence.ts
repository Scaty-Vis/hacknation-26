import { getStore } from '@netlify/blobs'
import type { EventBidPersistence } from '../../../server/eventbid.js'

/**
 * Netlify Functions equivalent of createFileSystemPersistence() (server/eventbid.ts) —
 * neither a module-level Map nor process.cwd() survive across serverless
 * invocations/cold starts, so workflow state is kept in Netlify Blobs instead.
 * Strong consistency is used since a mutating route (e.g. /approve) is almost
 * always immediately followed by another route reading the same event's state.
 */
export function createBlobsPersistence(): EventBidPersistence {
  const store = getStore({ name: 'eventbid-workflows', consistency: 'strong' })

  return {
    async save(state) {
      await store.setJSON(state.event.event_id, state)
    },
    async load(eventId) {
      const state = await store.get(eventId, { type: 'json' })
      if (!state) throw new Error(`Event workflow not found: ${eventId}`)
      return state
    },
  }
}
