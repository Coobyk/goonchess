export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

/** The internal URL a room's Durable Object answers for its creation —
 * `index.ts` posts there and `game-room.ts` routes on the same path. */
export const CREATE_PATH = '/create'
