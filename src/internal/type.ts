import type * as http from 'node:http'

export type Binary = string | Buffer

// nodejs IncomingHttpHeaders is Record<string, string | string[]>, but it's actually this:
export type ResponseHeader = Record<string, string>

export type ObjectMetaData = Record<string, string | number>

export type RequestHeaders = Record<string, string | boolean | number | undefined>

export type Encryption =
  | {
      type: ENCRYPTION_TYPES.SSEC
    }
  | {
      type: ENCRYPTION_TYPES.KMS
      SSEAlgorithm?: string
      KMSMasterKeyID?: string
    }

export enum ENCRYPTION_TYPES {
  /**
   * SSEC represents server-side-encryption with customer provided keys
   */
  SSEC = 'SSE-C',
  /**
   * KMS represents server-side-encryption with managed keys
   */
  KMS = 'KMS',
}

export enum RETENTION_MODES {
  GOVERNANCE = 'GOVERNANCE',
  COMPLIANCE = 'COMPLIANCE',
}

export enum RETENTION_VALIDITY_UNITS {
  DAYS = 'Days',
  YEARS = 'Years',
}

export enum LEGAL_HOLD_STATUS {
  ENABLED = 'ON',
  DISABLED = 'OFF',
}

export type Transport = Pick<typeof http, 'request'>

export interface IRequest {
  protocol: string
  port?: number | string
  method: string
  path: string
  headers: RequestHeaders
}

export type ICanonicalRequest = string

export type NoResultCallback = (error: unknown) => void

export interface RemoveOptions {
  versionId?: string
  governanceBypass?: boolean
  forceDelete?: boolean
}

export interface IncompleteUploadedBucketItem {
  key: string
  uploadId: string
  size: number
}
