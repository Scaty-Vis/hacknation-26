export type DataCollectionResult = {
  data_collection_id: string
  value: unknown
  rationale: string
}

type ConversationStatus = 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed'

type GetConversationResponse = {
  status: ConversationStatus
  analysis: {
    data_collection_results_list: DataCollectionResult[]
  } | null
}

export type CollectedVariables = Record<string, unknown>

export class ConversationAnalysisError extends Error {}

async function fetchConversation(conversationId: string): Promise<GetConversationResponse> {
  const res = await fetch(`/api/conversations/${conversationId}`)
  const body = await res.json()
  if (!res.ok) {
    throw new ConversationAnalysisError(body?.error ?? `Request failed with status ${res.status}`)
  }
  return body
}

const POLL_INTERVAL_MS = 2000
const MAX_ATTEMPTS = 30 // ~1 minute

/**
 * Data collection results aren't ready until ElevenLabs finishes post-call
 * analysis, so this polls the conversation until status leaves "processing".
 */
export async function pollForCollectedVariables(
  conversationId: string,
  onAttempt?: (attempt: number) => void,
): Promise<CollectedVariables> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onAttempt?.(attempt)
    const conversation = await fetchConversation(conversationId)

    if (conversation.status === 'failed') {
      throw new ConversationAnalysisError('ElevenLabs marked this conversation as failed.')
    }

    if (conversation.status === 'done') {
      const results = conversation.analysis?.data_collection_results_list ?? []
      const variables: CollectedVariables = {}
      for (const result of results) {
        variables[result.data_collection_id] = result.value
      }
      return variables
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new ConversationAnalysisError('Timed out waiting for ElevenLabs to finish analyzing the call.')
}
