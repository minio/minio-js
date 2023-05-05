export class Credentials {
  constructor({ accessKey, secretKey, sessionToken }) {
    this.accessKey = accessKey
    this.secretKey = secretKey
    this.sessionToken = sessionToken
  }

  setAccessKey(accessKey) {
    this.accessKey = accessKey
  }
  getAccessKey() {
    return this.accessKey
  }
  setSecretKey(secretKey) {
    this.secretKey = secretKey
  }
  getSecretKey() {
    return this.secretKey
  }
  setSessionToken(sessionToken) {
    this.sessionToken = sessionToken
  }
  getSessionToken() {
    return this.sessionToken
  }

  get() {
    return {
      accessKey: this.accessKey,
      secretKey: this.secretKey,
      sessionToken: this.sessionToken,
    }
  }
}

// deprecated default export, please use named exports.
// keep for backward compatibility.
// eslint-disable-next-line import/no-default-export
export default Credentials
