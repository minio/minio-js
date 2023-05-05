export type Binary = string | Buffer

export type Mode = 'COMPLIANCE' | 'GOVERNANCE'

// nodejs IncomingHttpHeaders is Record<string, string | string[]>, but it's actually this:
export type ResponseHeader = Record<string, string>

export type MetaData = Record<string, string | number>
export type Header = Record<string, string | null | undefined>
