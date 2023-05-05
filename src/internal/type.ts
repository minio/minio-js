export type Binary = string | Buffer

// nodejs IncomingHttpHeaders is Record<string, string | string[]>, but it's actually this:
export type ResponseHeader = Record<string, string>

export type MetaData = Record<string, string | number>
export type Header = Record<string, string | null | undefined>
export type Encryption = {
  type: string
  SSEAlgorithm?: string
  KMSMasterKeyID?: string
}

export enum ENCRYPTION_TYPES {
  // SSEC represents server-side-encryption with customer provided keys
  SSEC = 'SSE-C',
  // KMS represents server-side-encryption with managed keys
  KMS = 'KMS',
}
