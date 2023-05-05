export type Binary = string | Buffer

export type Mode = 'COMPLIANCE' | 'GOVERNANCE'

// nodejs IncomingHttpHeaders is Record<string, string | string[]>, but it's actually this:
export type ResponseHeader = Record<string, string>

export type MetaData = Record<string, string | number>
export type Header = Record<string, string | null | undefined>

export type RequestHeaders = Record<string, string | boolean | number>

export interface IRequest {
  protocol: string
  port?: number | string
  method: string
  path: string
  headers: RequestHeaders
}

export type ICanonicalRequest = string
