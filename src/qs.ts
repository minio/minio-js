import queryString from 'query-string'

// rfc 3986 encoding.
// `URLSearchParams` and `node:querystring` won't work
export function qs(q: Record<string, unknown>): string {
  return queryString.stringify(q)
}
