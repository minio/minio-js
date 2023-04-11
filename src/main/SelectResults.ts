class SelectResults {
  private records: any
  private response: any
  private stats: any
  private progress: any

  constructor({
    records, // parsed data as stream
    response,// original response stream
    stats, // stats as xml
    progress // stats as xml
  }:{records:any,
    response:any,
    stats:any,
    progress:any}) {

    this.records= records
    this.response = response
    this.stats= stats
    this.progress = progress
  }

  setStats(stats:any){
    this.stats = stats
  }
  getStats () {
    return this.stats
  }

  setProgress(progress:any){
    this.progress = progress
  }
  getProgress (){
    return this.progress
  }

  setResponse(response:any){
    this.response = response
  }
  getResponse (){
    return this.response
  }

  setRecords(records:any){
    this.records = records
  }

  getRecords(){
    return this.records
  }

}

export default SelectResults