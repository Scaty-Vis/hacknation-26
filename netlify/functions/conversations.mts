import type { Config } from '@netlify/functions'

// Netlify Functions equivalent of the elevenLabsConversationsProxy Vite
// middleware (vite.config.ts) — keeps the xi-api-key out of the client bundle.
export default async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    })
  }

  const match = new URL(req.url).pathname.match(/^\/api\/conversations\/([^/?]+)/)
  if (!match) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ELEVENLABS_API_KEY is not set. Add it in Site settings > Environment variables.' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }

  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${match[1]}`, {
      headers: { 'xi-api-key': apiKey },
    })
    const body = await upstream.text()
    return new Response(body, { status: upstream.status, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }
}

export const config: Config = {
  path: '/api/conversations/:id',
}
