import type http from 'node:http'
import type stream from 'node:stream'

export async function readAsBuffer(res: stream.Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const body: Buffer[] = []
    res
      .on('data', (chunk: Buffer) => body.push(chunk))
      .on('error', (e) => reject(e))
      .on('end', () => resolve(Buffer.concat(body)))
  })
}

export async function readAsString(res: http.IncomingMessage): Promise<string> {
  const body = await readAsBuffer(res)
  return body.toString()
}

export async function drainResponse(res: stream.Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    res
      .on('data', () => {})
      .on('error', (e) => reject(e))
      .on('end', () => resolve())
  })
}
