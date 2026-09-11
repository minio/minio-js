import type { Client, UploadedObjectInfo } from '../../src/minio.ts'

type ExpectUploadedObjectInfo<T extends UploadedObjectInfo> = T

export type PutObjectResult = ExpectUploadedObjectInfo<Awaited<ReturnType<Client['putObject']>>>
export type FPutObjectResult = ExpectUploadedObjectInfo<Awaited<ReturnType<Client['fPutObject']>>>
