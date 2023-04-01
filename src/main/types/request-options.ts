import { type OutgoingHttpHeaders} from 'http'

export type MakeRequestOptions = {
    headers?: OutgoingHttpHeaders,
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD',
    region?: string,
    bucketName?: string,
    objectName?: string,
    query?: string,
    pathStyle?: boolean
}