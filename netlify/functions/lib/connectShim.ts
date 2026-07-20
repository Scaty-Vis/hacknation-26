import type { Connect } from 'vite'
import type { ServerResponse } from 'node:http'

/**
 * Runs a Connect-style (req, res, next) handler — like the one returned by
 * server/eventbid.ts's eventBidApi() — against a Fetch API Request, and
 * resolves the Response it produces. This lets the exact same handler used by
 * the Vite dev-server middleware run inside a Netlify Function unchanged; the
 * only real surface it uses is req.url/method/headers.range, async-iterating
 * req for the body, and res.statusCode/setHeader/end (confirmed by reading
 * every route in eventbid.ts), so the shim only needs to cover that.
 */
export async function invokeConnectHandler(
  handler: Connect.NextHandleFunction,
  request: Request,
  pathPrefix: string,
): Promise<Response> {
  const url = new URL(request.url)
  const relativePath = (url.pathname.slice(pathPrefix.length) || '/') + url.search

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const bodyBuffer = hasBody ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0)
  let bodyYielded = false

  const fakeReq = {
    url: relativePath,
    method: request.method,
    headers: {
      range: request.headers.get('range') ?? undefined,
    },
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        if (bodyYielded || bodyBuffer.length === 0) return { done: true as const, value: undefined }
        bodyYielded = true
        return { done: false as const, value: bodyBuffer }
      },
    }),
  }

  return new Promise<Response>((resolve) => {
    const headers = new Headers()
    let statusCode = 200

    const fakeRes = {
      get statusCode() {
        return statusCode
      },
      set statusCode(value: number) {
        statusCode = value
      },
      setHeader(name: string, value: string) {
        headers.set(name, value)
      },
      end(chunk?: Buffer | string) {
        resolve(new Response(chunk ?? null, { status: statusCode, headers }))
      },
    }

    const next = () => {
      resolve(new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }))
    }

    void handler(fakeReq as unknown as Connect.IncomingMessage, fakeRes as unknown as ServerResponse, next)
  })
}
