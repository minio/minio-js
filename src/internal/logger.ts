/**
 * Logger provides a common interface for logging.
 * This interface is compatible with the default `console` logger.
 */
export interface Logger {
  warn(message: string, ...optionalParams: never[]): void
  log(message: string, ...optionalParams: never[]): void
}
