export type AccessKey = string
export type SecretKey =string
export type Region = string
export type RequestDate = Date
export type RequestHeaders =Record<any, any>
export type SignedHeaders = any[]
export type ServiceName="sts"|"s3"
export type SessionToken=string

export type AuthCredentials ={
  accessKey:AccessKey
  secretKey:SecretKey
  sessionToken?:string
}