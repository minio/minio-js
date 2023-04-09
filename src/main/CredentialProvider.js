import Credentials from "./Credentials"

class CredentialProvider {
  constructor({ accessKey, secretKey, sessionToken }) {
    this.credentials = new Credentials({
      accessKey,
      secretKey,
      sessionToken,
    })
  }

  getCredentials() {
    return this.credentials.get()
  }

  setCredentials(credentials) {
    if (credentials instanceof Credentials) {
      this.credentials = credentials
    } else {
      throw new Error("Unable to set Credentials . it should be an instance of Credentials class")
    }
  }

  setAccessKey(accessKey) {
    this.credentials.setAccessKey(accessKey)
  }

  getAccessKey() {
    return this.credentials.getAccessKey()
  }

  setSecretKey(secretKey) {
    this.credentials.setSecretKey(secretKey)
  }

  getSecretKey() {
    return this.credentials.getSecretKey()
  }

  setSessionToken(sessionToken) {
    this.credentials.setSessionToken(sessionToken)
  }

  getSessionToken() {
    return this.credentials.getSessionToken()
  }
}

export default CredentialProvider
