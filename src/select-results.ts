/**
 * maybe this should be a generic type for Records, leave it for later refactor
 */
export class SelectResults {
  private records?: unknown
  private response?: unknown
  private stats?: string
  private progress?: unknown

  constructor({
    records, // parsed data as stream
    response, // original response stream
    stats, // stats as xml
    progress, // stats as xml
  }: {
    records?: unknown
    response?: unknown
    stats?: string
    progress?: unknown
  }) {
    this.records = records
    this.response = response
    this.stats = stats
    this.progress = progress
  }

  setStats(stats: string) {
    this.stats = stats
  }

  getStats() {
    return this.stats
  }

  setProgress(progress: unknown) {
    this.progress = progress
  }

  getProgress() {
    return this.progress
  }

  setResponse(response: unknown) {
    this.response = response
  }

  getResponse() {
    return this.response
  }

  setRecords(records: unknown) {
    this.records = records
  }

  getRecords(): unknown {
    return this.records
  }
}
