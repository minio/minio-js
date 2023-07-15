import type { ICredentials } from './internal/type'

export class Credentials {
  public accessKey: string
  public secretKey: string
  public sessionToken?: string

  constructor({ accessKey, secretKey, sessionToken }: ICredentials) {
    this.accessKey = accessKey
    this.secretKey = secretKey
    this.sessionToken = sessionToken
  }

  setAccessKey(accessKey: string) {
    this.accessKey = accessKey
  }

  getAccessKey() {
    return this.accessKey
  }

  setSecretKey(secretKey: string) {
    this.secretKey = secretKey
  }

  getSecretKey() {
    return this.secretKey
  }

  setSessionToken(sessionToken: string) {
    this.sessionToken = sessionToken
  }

  getSessionToken() {
    return this.sessionToken
  }

  get(): Credentials {
    return this
  }
}

// deprecated default export, please use named exports.
// keep for backward compatibility.
// eslint-disable-next-line import/no-default-export
export default Credentials
