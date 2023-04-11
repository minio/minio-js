import { AuthCredentials } from "./types"

class Credentials{
  private accessKey: string
  private secretKey: string
  private sessionToken: string
  constructor({
    accessKey,
    secretKey,
    sessionToken
  }:AuthCredentials) {
    this.accessKey = accessKey
    this.secretKey = secretKey
    this.sessionToken=sessionToken
  }


  setAccessKey(accessKey:string){
    this.accessKey = accessKey
  }
  getAccessKey():string{
    return this.accessKey
  }
  setSecretKey(secretKey:string){
    this.secretKey=secretKey
  }
  getSecretKey():string{
    return this.secretKey
  }
  setSessionToken (sessionToken:string){
    this.sessionToken = sessionToken
  }
  getSessionToken ():string{
    return this.sessionToken
  }
  
  get():AuthCredentials{
    return {
      accessKey:this.accessKey,
      secretKey:this.secretKey,
      sessionToken:this.sessionToken
    }
  }

}

export default Credentials