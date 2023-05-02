import * as stream from 'node:stream'

const Generator = async function* () {}.constructor

export class StreamGenerators extends stream.Readable {
  private _g: AsyncGenerator

  constructor(g: AsyncGeneratorFunction) {
    if (!(g instanceof Generator)) {
      throw new TypeError('First argument must be a ES6 Generator')
    }

    super({ objectMode: true })
    this._g = g()
  }

  async _read() {
    try {
      const { done, value } = await this._g.next()

      if (done) {
        this.push(null)
      } else {
        this.push(value)
      }
    } catch (e) {
      this.emit('error', e)
    }
  }
}
