import Credentials from './Credentials'

type CredentialProviderOptions = {
  accessKey: string,
  secretKey: string,
  sessionToken: string,
}

class CredentialProvider {
  private credentials: Credentials;

  constructor({
    accessKey,
    secretKey,
    sessionToken
  }: CredentialProviderOptions) {
    this.credentials = new Credentials({
      accessKey,
      secretKey,
      sessionToken
    })
  }

  getCredentials() {
    return this.credentials.get()
  }

  setCredentials(credentials: Credential) {
    if (credentials instanceof Credentials) {
      this.credentials = credentials
    } else {
      throw new Error('Unable to set Credentials. It should be an instance of Credentials class')
    }
  }


  setAccessKey(accessKey: string) {
    this.credentials.setAccessKey(accessKey)
  }

  getAccessKey(): string {
    return this.credentials.getAccessKey()
  }

  setSecretKey(secretKey: string) {
    this.credentials.setSecretKey(secretKey)
  }

  getSecretKey(): string {
    return this.credentials.getSecretKey()
  }

  setSessionToken(sessionToken: string) {
    this.credentials.setSessionToken(sessionToken)
  }

  getSessionToken(): string {
    return this.credentials.getSessionToken()
  }
}

export default CredentialProvider