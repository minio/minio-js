import type { TypedClient } from '../../src/internal/client.ts'
import type { Client } from '../../src/minio.ts'

type ExpectPromise<T extends Promise<void>> = T

export type TypedClientLegalHoldResult = ExpectPromise<ReturnType<TypedClient['setObjectLegalHold']>>
export type ClientLegalHoldResult = ExpectPromise<ReturnType<Client['setObjectLegalHold']>>
