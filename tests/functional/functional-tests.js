/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 MinIO, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as https from 'node:https'
import * as os from 'node:os'
import * as stream from 'node:stream'
import * as url from 'node:url'

import async from 'async'
import chai from 'chai'
import _ from 'lodash'
import { step } from 'mocha-steps'
import splitFile from 'split-file'
import superagent from 'superagent'
import * as uuid from 'uuid'

import { AssumeRoleProvider } from '../../src/AssumeRoleProvider.js'
import { CopyDestinationOptions, CopySourceOptions, DEFAULT_REGION, removeDirAndFiles } from '../../src/helpers.ts'
import { getVersionId } from '../../src/internal/helper.ts'
import * as minio from '../../src/minio.js'

const assert = chai.assert

const isWindowsPlatform = process.platform === 'win32'

describe('functional tests', function () {
  this.timeout(30 * 60 * 1000)
  var clientConfigParams = {}
  var region_conf_env = process.env['MINIO_REGION']

  if (process.env['SERVER_ENDPOINT']) {
    var res = process.env['SERVER_ENDPOINT'].split(':')
    clientConfigParams.endPoint = res[0]
    clientConfigParams.port = parseInt(res[1])
    var access_Key_env = process.env['ACCESS_KEY']
    var secret_key_env = process.env['SECRET_KEY']

    // If the user provides ENABLE_HTTPS, 1 = secure, anything else = unsecure.
    // Otherwise default useSSL as true.
    var enable_https_env = process.env['ENABLE_HTTPS']
    // Get the credentials from env vars, error out if they don't exist
    if (access_Key_env) {
      clientConfigParams.accessKey = access_Key_env
    } else {
      // eslint-disable-next-line no-console
      console.error(`Error: ACCESS_KEY Environment variable is not set`)
      process.exit(1)
    }
    if (secret_key_env) {
      clientConfigParams.secretKey = secret_key_env
    } else {
      // eslint-disable-next-line no-console
      console.error(`Error:  SECRET_KEY Environment variable is not set`)
      process.exit(1)
    }
    clientConfigParams.useSSL = enable_https_env == '1'
  } else {
    // If credentials aren't given, default to play.min.io.
    clientConfigParams.endPoint = 'play.min.io'
    clientConfigParams.port = 9000
    clientConfigParams.accessKey = 'Q3AM3UQ867SPQQA43P2F'
    clientConfigParams.secretKey = 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
    clientConfigParams.useSSL = true
  }
  const server_region = region_conf_env || DEFAULT_REGION

  clientConfigParams.region = server_region
  // set the partSize to ensure multipart upload chunk size.
  // if not set, putObject with stream data and undefined length will use about 500Mb chunkSize (5Tb/10000).
  clientConfigParams.partSize = 64 * 1024 * 1024

  // dataDir is falsy if we need to generate data on the fly. Otherwise, it will be
  // a directory with files to read from, i.e. /mint/data.
  var dataDir = process.env['MINT_DATA_DIR']

  var client = new minio.Client(clientConfigParams)
  var usEastConfig = clientConfigParams
  usEastConfig.region = server_region
  var clientUsEastRegion = new minio.Client(usEastConfig)

  var traceStream
  // FUNCTIONAL_TEST_TRACE env variable contains the path to which trace
  // will be logged. Set it to /dev/stdout log to the stdout.
  var trace_func_test_file_path = process.env['FUNCTIONAL_TEST_TRACE']
  if (trace_func_test_file_path) {
    // This is necessary for windows.
    if (trace_func_test_file_path === 'process.stdout') {
      traceStream = process.stdout
    } else {
      traceStream = fs.createWriteStream(trace_func_test_file_path, { flags: 'a' })
    }
    traceStream.write('====================================\n')
    client.traceOn(traceStream)
  }

  var bucketName = 'minio-js-test-' + uuid.v4()
  var objectName = uuid.v4()

  var _1byteObjectName = 'datafile-1-b'
  var _1byte = dataDir ? fs.readFileSync(dataDir + '/' + _1byteObjectName) : Buffer.alloc(1, 0)

  var _100kbObjectName = 'datafile-100-kB'
  var _100kb = dataDir ? fs.readFileSync(dataDir + '/' + _100kbObjectName) : Buffer.alloc(100 * 1024, 0)
  var _100kbObjectNameCopy = _100kbObjectName + '-copy'

  var _100kbObjectBufferName = `${_100kbObjectName}.buffer`
  var _MultiPath100kbObjectBufferName = `path/to/${_100kbObjectName}.buffer`
  var _100kbmd5 = crypto.createHash('md5').update(_100kb).digest('hex')
  var _100kb1kboffsetmd5 = crypto.createHash('md5').update(_100kb.slice(1024)).digest('hex')

  var _65mbObjectName = 'datafile-65-MB'
  var _65mb = dataDir ? fs.readFileSync(dataDir + '/' + _65mbObjectName) : Buffer.alloc(65 * 1024 * 1024, 0)
  var _65mbmd5 = crypto.createHash('md5').update(_65mb).digest('hex')
  var _65mbObjectNameCopy = _65mbObjectName + '-copy'

  var _5mbObjectName = 'datafile-5-MB'
  var _5mb = dataDir ? fs.readFileSync(dataDir + '/' + _5mbObjectName) : Buffer.alloc(5 * 1024 * 1024, 0)
  var _5mbmd5 = crypto.createHash('md5').update(_5mb).digest('hex')

  // create new http agent to check requests release sockets
  var httpAgent = (clientConfigParams.useSSL ? https : http).Agent({ keepAlive: true })
  client.setRequestOptions({ agent: httpAgent })
  var metaData = {
    'Content-Type': 'text/html',
    'Content-Language': 'en',
    'X-Amz-Meta-Testing': 1234,
    randomstuff: 5678,
  }

  var tmpDir = os.tmpdir()

  function readableStream(data) {
    var s = new stream.Readable()
    s._read = () => {}
    s.push(data)
    s.push(null)
    return s
  }

  before((done) => client.makeBucket(bucketName, server_region, done))
  after((done) => client.removeBucket(bucketName, done))

  if (traceStream) {
    after(() => {
      client.traceOff()
      if (trace_func_test_file_path !== 'process.stdout') {
        traceStream.end()
      }
    })
  }

  describe('makeBucket with period and region', () => {
    if (clientConfigParams.endPoint === 's3.amazonaws.com') {
      step('makeBucket(bucketName, region, cb)_region:eu-central-1_', (done) =>
        client.makeBucket(`${bucketName}.sec.period`, 'eu-central-1', done),
      )
      step('removeBucket(bucketName, cb)__', (done) => client.removeBucket(`${bucketName}.sec.period`, done))
    }
  })

  describe('listBuckets', () => {
    step('listBuckets(cb)__', (done) => {
      client.listBuckets((e, buckets) => {
        if (e) {
          return done(e)
        }
        if (_.find(buckets, { name: bucketName })) {
          return done()
        }
        done(new Error('bucket not found'))
      })
    })
    step('listBuckets()__', (done) => {
      client
        .listBuckets()
        .then((buckets) => {
          if (!_.find(buckets, { name: bucketName })) {
            return done(new Error('bucket not found'))
          }
        })
        .then(() => done())
        .catch(done)
    })
  })

  describe('makeBucket with region', () => {
    let isDifferentServerRegion = false
    step(`makeBucket(bucketName, region, cb)_bucketName:${bucketName}-region, region:us-east-2_`, (done) => {
      try {
        clientUsEastRegion.makeBucket(`${bucketName}-region`, 'us-east-2', assert.fail)
      } catch (e) {
        isDifferentServerRegion = true
        done()
      }
    })
    step(`makeBucket(bucketName, region, cb)_bucketName:${bucketName}-region, region:us-east-1_`, (done) => {
      if (!isDifferentServerRegion) {
        clientUsEastRegion.makeBucket(`${bucketName}-region`, 'us-east-1', done)
      }
      done()
    })
    step(`removeBucket(bucketName, cb)_bucketName:${bucketName}-region_`, (done) => {
      if (!isDifferentServerRegion) {
        clientUsEastRegion.removeBucket(`${bucketName}-region`, done)
      }
      done()
    })
    step(`makeBucket(bucketName, region)_bucketName:${bucketName}-region, region:us-east-1_`, (done) => {
      if (!isDifferentServerRegion) {
        clientUsEastRegion.makeBucket(`${bucketName}-region`, 'us-east-1', (e) => {
          if (e) {
            // Some object storage servers like Azure, might not delete a bucket rightaway
            // Add a sleep of 40 seconds and retry
            setTimeout(() => {
              clientUsEastRegion.makeBucket(`${bucketName}-region`, 'us-east-1', done)
            }, 40 * 1000)
          } else {
            done()
          }
        })
      }
      done()
    })
    step(`removeBucket(bucketName)_bucketName:${bucketName}-region_`, (done) => {
      if (!isDifferentServerRegion) {
        clientUsEastRegion
          .removeBucket(`${bucketName}-region`)
          .then(() => done())
          .catch(done)
      }
      done()
    })
  })

  describe('bucketExists', () => {
    step(`bucketExists(bucketName, cb)_bucketName:${bucketName}_`, (done) => client.bucketExists(bucketName, done))
    step(`bucketExists(bucketName, cb)_bucketName:${bucketName}random_`, (done) => {
      client.bucketExists(bucketName + 'random', (e, exists) => {
        if (e === null && !exists) {
          return done()
        }
        done(new Error())
      })
    })
    step(`bucketExists(bucketName)_bucketName:${bucketName}_`, (done) => {
      client
        .bucketExists(bucketName)
        .then(() => done())
        .catch(done)
    })
  })

  describe('removeBucket', () => {
    step(`removeBucket(bucketName, cb)_bucketName:${bucketName}random_`, (done) => {
      client.removeBucket(bucketName + 'random', (e) => {
        if (e.code === 'NoSuchBucket') {
          return done()
        }
        done(new Error())
      })
    })
    step(`makeBucket(bucketName, region)_bucketName:${bucketName}-region-1, region:us-east-1_`, (done) => {
      client
        .makeBucket(`${bucketName}-region-1`, '')
        .then(() => client.removeBucket(`${bucketName}-region-1`))
        .then(() => done())
        .catch(done)
    })
  })
  describe('tests for putObject getObject removeObject with multipath', function () {
    step(
      `putObject(bucketName, objectName, stream)_bucketName:${bucketName}, objectName:${_MultiPath100kbObjectBufferName}, stream:100Kib_`,
      (done) => {
        client
          .putObject(bucketName, _MultiPath100kbObjectBufferName, _100kb)
          .then(() => done())
          .catch(done)
      },
    )

    step(
      `getObject(bucketName, objectName, callback)_bucketName:${bucketName}, objectName:${_MultiPath100kbObjectBufferName}_`,
      (done) => {
        var hash = crypto.createHash('md5')
        client.getObject(bucketName, _MultiPath100kbObjectBufferName, (e, stream) => {
          if (e) {
            return done(e)
          }
          stream.on('data', (data) => hash.update(data))
          stream.on('error', done)
          stream.on('end', () => {
            if (hash.digest('hex') === _100kbmd5) {
              return done()
            }
            done(new Error('content mismatch'))
          })
        })
      },
    )

    step(
      `removeObject(bucketName, objectName)_bucketName:${bucketName}, objectName:${_MultiPath100kbObjectBufferName}_`,
      (done) => {
        client
          .removeObject(bucketName, _MultiPath100kbObjectBufferName)
          .then(() => done())
          .catch(done)
      },
    )
  })
  describe('tests for putObject copyObject getObject getPartialObject statObject removeObject', function () {
    var tmpFileUpload = `${tmpDir}/${_100kbObjectName}`
    step(
      `fPutObject(bucketName, objectName, filePath, metaData, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}, filePath: ${tmpFileUpload}_`,
      (done) => {
        fs.writeFileSync(tmpFileUpload, _100kb)
        client.fPutObject(bucketName, _100kbObjectName, tmpFileUpload, done)
      },
    )

    step(`statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`, (done) => {
      client.statObject(bucketName, _100kbObjectName, (e, stat) => {
        if (e) {
          return done(e)
        }
        // As metadata is not provided and there is no file extension,
        // we default to 'application/octet-stream' as per `probeContentType` function
        if (stat.metaData && stat.metaData['content-type'] !== 'application/octet-stream') {
          return done(new Error('content-type mismatch'))
        }
        done()
      })
    })

    var tmpFileUploadWithExt = `${tmpDir}/${_100kbObjectName}.txt`
    step(
      `fPutObject(bucketName, objectName, filePath, metaData, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}, filePath: ${tmpFileUploadWithExt}, metaData:${metaData}_`,
      (done) => {
        fs.writeFileSync(tmpFileUploadWithExt, _100kb)
        client.fPutObject(bucketName, _100kbObjectName, tmpFileUploadWithExt, metaData, done)
      },
    )

    step(`statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`, (done) => {
      client.statObject(bucketName, _100kbObjectName, (e, stat) => {
        if (e) {
          return done(e)
        }
        // As metadata is provided, even though we have an extension,
        // the `content-type` should be equal what was declared on the metadata
        if (stat.metaData && stat.metaData['content-type'] !== 'text/html') {
          return done(new Error('content-type mismatch'))
        } else if (!stat.metaData) {
          return done(new Error('no metadata present'))
        }
        done()
      })
    })

    step(
      `fPutObject(bucketName, objectName, filePath, metaData, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}, filePath: ${tmpFileUploadWithExt}_`,
      (done) => {
        fs.writeFileSync(tmpFileUploadWithExt, _100kb)
        client.fPutObject(bucketName, _100kbObjectName, tmpFileUploadWithExt, done)
      },
    )

    step(`statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`, (done) => {
      client.statObject(bucketName, _100kbObjectName, (e, stat) => {
        if (e) {
          return done(e)
        }
        // As metadata is not provided but we have a file extension,
        // we need to infer `content-type` from the file extension
        if (stat.metaData && stat.metaData['content-type'] !== 'text/plain') {
          return done(new Error('content-type mismatch'))
        }
        done()
      })
    })

    step(
      `putObject(bucketName, objectName, stream, size, metaData, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}, stream:100kb, size:${_100kb.length}, metaData:${metaData}_`,
      (done) => {
        var stream = readableStream(_100kb)
        client.putObject(bucketName, _100kbObjectName, stream, _100kb.length, metaData, done)
      },
    )

    step(
      `putObject(bucketName, objectName, stream, size, metaData, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}, stream:100kb, size:${_100kb.length}_`,
      (done) => {
        var stream = readableStream(_100kb)
        client.putObject(bucketName, _100kbObjectName, stream, _100kb.length, done)
      },
    )

    step(
      `getObject(bucketName, objectName, callback)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`,
      (done) => {
        var hash = crypto.createHash('md5')
        client.getObject(bucketName, _100kbObjectName, (e, stream) => {
          if (e) {
            return done(e)
          }
          stream.on('data', (data) => hash.update(data))
          stream.on('error', done)
          stream.on('end', () => {
            if (hash.digest('hex') === _100kbmd5) {
              return done()
            }
            done(new Error('content mismatch'))
          })
        })
      },
    )

    step(
      `putObject(bucketName, objectName, stream, callback)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}, stream:100kb_`,
      (done) => {
        client.putObject(bucketName, _100kbObjectBufferName, _100kb, '', done)
      },
    )

    step(
      `getObject(bucketName, objectName, callback)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}_`,
      (done) => {
        var hash = crypto.createHash('md5')
        client.getObject(bucketName, _100kbObjectBufferName, (e, stream) => {
          if (e) {
            return done(e)
          }
          stream.on('data', (data) => hash.update(data))
          stream.on('error', done)
          stream.on('end', () => {
            if (hash.digest('hex') === _100kbmd5) {
              return done()
            }
            done(new Error('content mismatch'))
          })
        })
      },
    )

    step(
      `putObject(bucketName, objectName, stream, metaData)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}, stream:100kb_, metaData:{}`,
      (done) => {
        client
          .putObject(bucketName, _100kbObjectBufferName, _100kb, {})
          .then(() => done())
          .catch(done)
      },
    )

    step(
      `getPartialObject(bucketName, objectName, offset, length, cb)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}, offset:0, length=1024_`,
      (done) => {
        client
          .getPartialObject(bucketName, _100kbObjectBufferName, 0, 1024)
          .then((stream) => {
            stream.on('data', function () {})
            stream.on('end', done)
          })
          .catch(done)
      },
    )

    step(
      `getPartialObject(bucketName, objectName, offset, length, cb)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}, offset:1024, length=1024_`,
      (done) => {
        var expectedHash = crypto.createHash('md5').update(_100kb.slice(1024, 2048)).digest('hex')
        var hash = crypto.createHash('md5')
        client
          .getPartialObject(bucketName, _100kbObjectBufferName, 1024, 1024)
          .then((stream) => {
            stream.on('data', (data) => hash.update(data))
            stream.on('end', () => {
              if (hash.digest('hex') === expectedHash) {
                return done()
              }
              done(new Error('content mismatch'))
            })
          })
          .catch(done)
      },
    )

    step(
      `getPartialObject(bucketName, objectName, offset, length, cb)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}, offset:1024`,
      (done) => {
        var hash = crypto.createHash('md5')
        client
          .getPartialObject(bucketName, _100kbObjectBufferName, 1024)
          .then((stream) => {
            stream.on('data', (data) => hash.update(data))
            stream.on('end', () => {
              if (hash.digest('hex') === _100kb1kboffsetmd5) {
                return done()
              }
              done(new Error('content mismatch'))
            })
          })
          .catch(done)
      },
    )

    step(
      `getObject(bucketName, objectName)_bucketName:${bucketName}, objectName:${_100kbObjectBufferName}_`,
      (done) => {
        client
          .getObject(bucketName, _100kbObjectBufferName)
          .then((stream) => {
            stream.on('data', function () {})
            stream.on('end', done)
          })
          .catch(done)
      },
    )

    step(
      `putObject(bucketName, objectName, stream, metadata, cb)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`,
      (done) => {
        var stream = readableStream(_65mb)
        client.putObject(bucketName, _65mbObjectName, stream, metaData, () => {
          setTimeout(() => {
            if (Object.values(httpAgent.sockets).length === 0) {
              return done()
            }
            done(new Error('http request did not release network socket'))
          }, 100)
        })
      },
    )

    step(`getObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`, (done) => {
      var hash = crypto.createHash('md5')
      client.getObject(bucketName, _65mbObjectName, (e, stream) => {
        if (e) {
          return done(e)
        }
        stream.on('data', (data) => hash.update(data))
        stream.on('error', done)
        stream.on('end', () => {
          if (hash.digest('hex') === _65mbmd5) {
            return done()
          }
          done(new Error('content mismatch'))
        })
      })
    })

    step(`getObject(bucketName, objectName, cb)_bucketName:${bucketName} non-existent object`, (done) => {
      client.getObject(bucketName, 'an-object-that-does-not-exist', (e, stream) => {
        if (stream) {
          return done(new Error('on errors the stream object should not exist'))
        }
        if (!e) {
          return done(new Error('expected an error object'))
        }
        if (e.code !== 'NoSuchKey') {
          return done(new Error('expected NoSuchKey error'))
        }
        done()
      })
    })

    step(
      `getPartialObject(bucketName, objectName, offset, length, cb)_bucketName:${bucketName}, objectName:${_65mbObjectName}, offset:0, length:100*1024_`,
      (done) => {
        var hash = crypto.createHash('md5')
        var expectedHash = crypto
          .createHash('md5')
          .update(_65mb.slice(0, 100 * 1024))
          .digest('hex')
        client.getPartialObject(bucketName, _65mbObjectName, 0, 100 * 1024, (e, stream) => {
          if (e) {
            return done(e)
          }
          stream.on('data', (data) => hash.update(data))
          stream.on('error', done)
          stream.on('end', () => {
            if (hash.digest('hex') === expectedHash) {
              return done()
            }
            done(new Error('content mismatch'))
          })
        })
      },
    )

    step(
      `copyObject(bucketName, objectName, srcObject, cb)_bucketName:${bucketName}, objectName:${_65mbObjectNameCopy}, srcObject:/${bucketName}/${_65mbObjectName}_`,
      (done) => {
        client.copyObject(bucketName, _65mbObjectNameCopy, '/' + bucketName + '/' + _65mbObjectName, (e) => {
          if (e) {
            return done(e)
          }
          done()
        })
      },
    )

    step(
      `copyObject(bucketName, objectName, srcObject)_bucketName:${bucketName}, objectName:${_65mbObjectNameCopy}, srcObject:/${bucketName}/${_65mbObjectName}_`,
      (done) => {
        client
          .copyObject(bucketName, _65mbObjectNameCopy, '/' + bucketName + '/' + _65mbObjectName)
          .then(() => done())
          .catch(done)
      },
    )

    step(`statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`, (done) => {
      client.statObject(bucketName, _65mbObjectName, (e, stat) => {
        if (e) {
          return done(e)
        }
        if (stat.size !== _65mb.length) {
          return done(new Error('size mismatch'))
        }
        if (`${metaData.randomstuff}` !== stat.metaData.randomstuff) {
          return done(new Error('metadata "randomstuff" mismatch'))
        }
        if (`${metaData['X-Amz-Meta-Testing']}` !== stat.metaData['testing']) {
          return done(new Error('metadata "testing" mismatch'))
        }
        if (`${metaData['Content-Type']}` !== stat.metaData['content-type']) {
          return done(new Error('metadata "content-type" mismatch'))
        }
        if (`${metaData['Content-Language']}` !== stat.metaData['content-language']) {
          return done(new Error('metadata "content-language" mismatch'))
        }
        done()
      })
    })

    step(`statObject(bucketName, objectName)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`, (done) => {
      client
        .statObject(bucketName, _65mbObjectName)
        .then((stat) => {
          if (stat.size !== _65mb.length) {
            return done(new Error('size mismatch'))
          }
        })
        .then(() => done())
        .catch(done)
    })

    step(`removeObject(bucketName, objectName)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`, (done) => {
      client
        .removeObject(bucketName, _100kbObjectName)
        .then(function () {
          async.map(
            [_100kbObjectBufferName, _65mbObjectName, _65mbObjectNameCopy],
            (objectName, cb) => client.removeObject(bucketName, objectName, cb),
            done,
          )
        })
        .catch(done)
    })
  })

  describe('tests for copyObject statObject', function () {
    var etag
    var modifiedDate
    step(
      `putObject(bucketName, objectName, stream, metaData, cb)_bucketName:${bucketName}, objectName:${_100kbObjectName}, stream: 100kb, metaData:${metaData}_`,
      (done) => {
        client.putObject(bucketName, _100kbObjectName, _100kb, metaData, done)
      },
    )

    step(
      `copyObject(bucketName, objectName, srcObject, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}_`,
      (done) => {
        client.copyObject(bucketName, _100kbObjectNameCopy, '/' + bucketName + '/' + _100kbObjectName, (e) => {
          if (e) {
            return done(e)
          }
          done()
        })
      },
    )

    step(`statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectName}_`, (done) => {
      client.statObject(bucketName, _100kbObjectName, (e, stat) => {
        if (e) {
          return done(e)
        }
        if (stat.size !== _100kb.length) {
          return done(new Error('size mismatch'))
        }
        assert.equal(stat.metaData['content-type'], metaData['Content-Type'])
        assert.equal(stat.metaData['Testing'], metaData['Testing'])
        assert.equal(stat.metaData['randomstuff'], metaData['randomstuff'])
        etag = stat.etag
        modifiedDate = stat.modifiedDate
        done()
      })
    })

    step(
      `copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:ExceptIncorrectEtag_`,
      (done) => {
        var conds = new minio.CopyConditions()
        conds.setMatchETagExcept('TestEtag')
        client.copyObject(bucketName, _100kbObjectNameCopy, '/' + bucketName + '/' + _100kbObjectName, conds, (e) => {
          if (e) {
            return done(e)
          }
          done()
        })
      },
    )

    step(
      `copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:ExceptCorrectEtag_`,
      (done) => {
        var conds = new minio.CopyConditions()
        conds.setMatchETagExcept(etag)
        client
          .copyObject(bucketName, _100kbObjectNameCopy, '/' + bucketName + '/' + _100kbObjectName, conds)
          .then(() => {
            done(new Error('CopyObject should have failed.'))
          })
          .catch(() => done())
      },
    )

    step(
      `copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:MatchCorrectEtag_`,
      (done) => {
        var conds = new minio.CopyConditions()
        conds.setMatchETag(etag)
        client.copyObject(bucketName, _100kbObjectNameCopy, '/' + bucketName + '/' + _100kbObjectName, conds, (e) => {
          if (e) {
            return done(e)
          }
          done()
        })
      },
    )

    step(
      `copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:MatchIncorrectEtag_`,
      (done) => {
        var conds = new minio.CopyConditions()
        conds.setMatchETag('TestETag')
        client
          .copyObject(bucketName, _100kbObjectNameCopy, '/' + bucketName + '/' + _100kbObjectName, conds)
          .then(() => {
            done(new Error('CopyObject should have failed.'))
          })
          .catch(() => done())
      },
    )

    step(
      `copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:Unmodified since ${modifiedDate}`,
      (done) => {
        var conds = new minio.CopyConditions()
        conds.setUnmodified(new Date(modifiedDate))
        client.copyObject(bucketName, _100kbObjectNameCopy, '/' + bucketName + '/' + _100kbObjectName, conds, (e) => {
          if (e) {
            return done(e)
          }
          done()
        })
      },
    )

    step(
      `copyObject(bucketName, objectName, srcObject, conditions, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}, srcObject:/${bucketName}/${_100kbObjectName}, conditions:Unmodified since 2010-03-26T12:00:00Z_`,
      (done) => {
        var conds = new minio.CopyConditions()
        conds.setUnmodified(new Date('2010-03-26T12:00:00Z'))
        client
          .copyObject(bucketName, _100kbObjectNameCopy, '/' + bucketName + '/' + _100kbObjectName, conds)
          .then(() => {
            done(new Error('CopyObject should have failed.'))
          })
          .catch(() => done())
      },
    )

    step(
      `statObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}_`,
      (done) => {
        client.statObject(bucketName, _100kbObjectNameCopy, (e, stat) => {
          if (e) {
            return done(e)
          }
          if (stat.size !== _100kb.length) {
            return done(new Error('size mismatch'))
          }
          done()
        })
      },
    )

    step(
      `removeObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_100kbObjectNameCopy}_`,
      (done) => {
        async.map(
          [_100kbObjectName, _100kbObjectNameCopy],
          (objectName, cb) => client.removeObject(bucketName, objectName, cb),
          done,
        )
      },
    )
  })

  describe('listIncompleteUploads removeIncompleteUpload', () => {
    step(
      `initiateNewMultipartUpload(bucketName, objectName, metaData, cb)_bucketName:${bucketName}, objectName:${_65mbObjectName}, metaData:${metaData}`,
      (done) => {
        client.initiateNewMultipartUpload(bucketName, _65mbObjectName, metaData, done)
      },
    )
    step(
      `listIncompleteUploads(bucketName, prefix, recursive)_bucketName:${bucketName}, prefix:${_65mbObjectName}, recursive: true_`,
      function (done) {
        // MinIO's ListIncompleteUploads returns an empty list, so skip this on non-AWS.
        // See: https://github.com/minio/minio/commit/75c43bfb6c4a2ace
        let hostSkipList = ['s3.amazonaws.com']
        if (!hostSkipList.includes(client.host)) {
          this.skip()
        }

        var found = false
        client
          .listIncompleteUploads(bucketName, _65mbObjectName, true)
          .on('error', (e) => done(e))
          .on('data', (data) => {
            if (data.key === _65mbObjectName) {
              found = true
            }
          })
          .on('end', () => {
            if (found) {
              return done()
            }
            done(new Error(`${_65mbObjectName} not found during listIncompleteUploads`))
          })
      },
    )
    step(
      `listIncompleteUploads(bucketName, prefix, recursive)_bucketName:${bucketName}, recursive: true_`,
      function (done) {
        // MinIO's ListIncompleteUploads returns an empty list, so skip this on non-AWS.
        // See: https://github.com/minio/minio/commit/75c43bfb6c4a2ace
        let hostSkipList = ['s3.amazonaws.com']
        if (!hostSkipList.includes(client.host)) {
          this.skip()
        }

        var found = false
        client
          .listIncompleteUploads(bucketName, '', true)
          .on('error', (e) => done(e))
          .on('data', (data) => {
            if (data.key === _65mbObjectName) {
              found = true
            }
          })
          .on('end', () => {
            if (found) {
              return done()
            }
            done(new Error(`${_65mbObjectName} not found during listIncompleteUploads`))
          })
      },
    )
    step(`removeIncompleteUploads(bucketName, prefix)_bucketName:${bucketName}, prefix:${_65mbObjectName}_`, (done) => {
      client.removeIncompleteUpload(bucketName, _65mbObjectName).then(done).catch(done)
    })
  })

  describe('fPutObject fGetObject', function () {
    var tmpFileUpload = `${tmpDir}/${_65mbObjectName}`
    var tmpFileDownload = `${tmpDir}/${_65mbObjectName}.download`

    step(
      `fPutObject(bucketName, objectName, filePath, callback)_bucketName:${bucketName}, objectName:${_65mbObjectName}, filePath:${tmpFileUpload}_`,
      (done) => {
        fs.writeFileSync(tmpFileUpload, _65mb)
        client.fPutObject(bucketName, _65mbObjectName, tmpFileUpload, () => {
          setTimeout(() => {
            if (Object.values(httpAgent.sockets).length === 0) {
              return done()
            }
            done(new Error('http request did not release network socket'))
          }, 100)
        })
      },
    )

    step(
      `fPutObject(bucketName, objectName, filePath, metaData, callback)_bucketName:${bucketName}, objectName:${_65mbObjectName}, filePath:${tmpFileUpload}, metaData: ${metaData}_`,
      (done) => client.fPutObject(bucketName, _65mbObjectName, tmpFileUpload, metaData, done),
    )
    step(
      `fGetObject(bucketName, objectName, filePath, callback)_bucketName:${bucketName}, objectName:${_65mbObjectName}, filePath:${tmpFileDownload}_`,
      (done) => {
        client
          .fGetObject(bucketName, _65mbObjectName, tmpFileDownload)
          .then(() => {
            var md5sum = crypto.createHash('md5').update(fs.readFileSync(tmpFileDownload)).digest('hex')
            if (md5sum === _65mbmd5) {
              return done()
            }
            return done(new Error('md5sum mismatch'))
          })
          .catch(done)
      },
    )

    step(
      `removeObject(bucketName, objectName, filePath, callback)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`,
      (done) => {
        fs.unlinkSync(tmpFileDownload)
        client
          .removeObject(bucketName, _65mbObjectName)
          .then(() => done())
          .catch(done)
      },
    )

    step(
      `fPutObject(bucketName, objectName, filePath, metaData)_bucketName:${bucketName}, objectName:${_65mbObjectName}, filePath:${tmpFileUpload}_`,
      (done) => {
        client
          .fPutObject(bucketName, _65mbObjectName, tmpFileUpload)
          .then(() => done())
          .catch(done)
      },
    )

    step(
      `fGetObject(bucketName, objectName, filePath)_bucketName:${bucketName}, objectName:${_65mbObjectName}, filePath:${tmpFileDownload}_`,
      (done) => {
        client
          .fGetObject(bucketName, _65mbObjectName, tmpFileDownload)
          .then(() => done())
          .catch(done)
      },
    )

    step(
      `removeObject(bucketName, objectName, filePath, callback)_bucketName:${bucketName}, objectName:${_65mbObjectName}_`,
      (done) => {
        fs.unlinkSync(tmpFileUpload)
        fs.unlinkSync(tmpFileDownload)
        client.removeObject(bucketName, _65mbObjectName, done)
      },
    )
  })
  describe('fGetObject-resume', () => {
    var localFile = `${tmpDir}/${_5mbObjectName}`
    var etag = ''
    step(
      `putObject(bucketName, objectName, stream, metaData, cb)_bucketName:${bucketName}, objectName:${_5mbObjectName}, stream:5mb_`,
      (done) => {
        var stream = readableStream(_5mb)
        client
          .putObject(bucketName, _5mbObjectName, stream, _5mb.length, {})
          .then((resp) => {
            etag = resp
            done()
          })
          .catch(done)
      },
    )
    step(
      `fGetObject(bucketName, objectName, filePath, callback)_bucketName:${bucketName}, objectName:${_5mbObjectName}, filePath:${localFile}`,
      (done) => {
        var bufPart = Buffer.alloc(_100kb.length)
        _5mb.copy(bufPart, 0, 0, _100kb.length)
        var tmpFile = `${tmpDir}/${_5mbObjectName}.${etag}.part.minio`
        // create a partial file
        fs.writeFileSync(tmpFile, bufPart)
        client
          .fGetObject(bucketName, _5mbObjectName, localFile)
          .then(() => {
            var md5sum = crypto.createHash('md5').update(fs.readFileSync(localFile)).digest('hex')
            if (md5sum === _5mbmd5) {
              return done()
            }
            return done(new Error('md5sum mismatch'))
          })
          .catch(done)
      },
    )
    step(
      `removeObject(bucketName, objectName, callback)_bucketName:${bucketName}, objectName:${_5mbObjectName}_`,
      (done) => {
        fs.unlinkSync(localFile)
        client.removeObject(bucketName, _5mbObjectName, done)
      },
    )
  })

  describe('bucket policy', () => {
    let policy = `{"Version":"2012-10-17","Statement":[{"Action":["s3:GetBucketLocation","s3:ListBucket"],"Effect":"Allow","Principal":{"AWS":["*"]},"Resource":["arn:aws:s3:::${bucketName}"],"Sid":""},{"Action":["s3:GetObject"],"Effect":"Allow","Principal":{"AWS":["*"]},"Resource":["arn:aws:s3:::${bucketName}/*"],"Sid":""}]}`

    step(`setBucketPolicy(bucketName, bucketPolicy, cb)_bucketName:${bucketName}, bucketPolicy:${policy}_`, (done) => {
      client.setBucketPolicy(bucketName, policy, (err) => {
        if (err && err.code === 'NotImplemented') {
          return done()
        }
        if (err) {
          return done(err)
        }
        done()
      })
    })

    step(`getBucketPolicy(bucketName, cb)_bucketName:${bucketName}_`, (done) => {
      client.getBucketPolicy(bucketName, (err, response) => {
        if (err && err.code === 'NotImplemented') {
          return done()
        }
        if (err) {
          return done(err)
        }
        if (!response) {
          return done(new Error(`policy is empty`))
        }
        done()
      })
    })
  })

  describe('Test Remove Objects Response in case of Errors', () => {
    // Since functional tests are run with root credentials, it is not implemented.
    // Test steps
    // =============
    // create a bucket
    // add some objects
    // create a  user
    // assign the readonly policy to the user
    // use the new user credentials to call remove objects API
    // verify the response
    // assign the readwrite policy to the user
    // call remove objects API
    // verify the response
    // response.Error is an array
    //   -[]- empty array indicates success for all objects
    // Note: the response code is 200. so the consumer should inspect the response
    // Sample Response format:
    /**
     * {
     *     Code: 'AccessDenied',
     *     Message: 'Access Denied.',
     *     Key: '1.png',
     *     VersionId: ''
     *   }
     *
     *   or
     *
     *    {
     *     Code: 'NoSuchVersion',
     *     Message: 'The specified version does not exist. (invalid UUID length: 9)',
     *     Key: '1.png',
     *     VersionId: 'test-v-is'
     *   }
     */
    /*
    let readOnlyPolicy ='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetBucketLocation","s3:GetObject"],"Resource":["arn:aws:s3:::*"]}]}'
    let readWritePolicy ='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:*"],"Resource":["arn:aws:s3:::*"]}]}'
    */
  })

  describe('presigned operations', () => {
    step(
      `presignedPutObject(bucketName, objectName, expires, cb)_bucketName:${bucketName}, objectName:${_1byteObjectName}, expires: 1000_`,
      (done) => {
        client.presignedPutObject(bucketName, _1byteObjectName, 1000, (e, presignedUrl) => {
          if (e) {
            return done(e)
          }
          var transport = http
          var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
          options.method = 'PUT'
          options.headers = {
            'content-length': _1byte.length,
          }
          if (options.protocol === 'https:') {
            transport = https
          }
          var request = transport.request(options, (response) => {
            if (response.statusCode !== 200) {
              return done(new Error(`error on put : ${response.statusCode}`))
            }
            response.on('error', (e) => done(e))
            response.on('end', () => done())
            response.on('data', () => {})
          })
          request.on('error', (e) => done(e))
          request.write(_1byte)
          request.end()
        })
      },
    )

    step(
      `presignedPutObject(bucketName, objectName, expires)_bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:-123_`,
      (done) => {
        // negative values should trigger an error
        client
          .presignedPutObject(bucketName, _1byteObjectName, -123)
          .then(() => {
            done(new Error('negative values should trigger an error'))
          })
          .catch(() => done())
      },
    )

    step(
      `presignedPutObject(bucketName, objectName)_bucketName:${bucketName}, objectName:${_1byteObjectName}_`,
      (done) => {
        // Putting the same object should not cause any error
        client
          .presignedPutObject(bucketName, _1byteObjectName)
          .then(() => done())
          .catch(done)
      },
    )

    step(
      `presignedGetObject(bucketName, objectName, expires, cb)_bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:1000_`,
      (done) => {
        client.presignedGetObject(bucketName, _1byteObjectName, 1000, (e, presignedUrl) => {
          if (e) {
            return done(e)
          }
          var transport = http
          var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
          options.method = 'GET'
          if (options.protocol === 'https:') {
            transport = https
          }
          var request = transport.request(options, (response) => {
            if (response.statusCode !== 200) {
              return done(new Error(`error on put : ${response.statusCode}`))
            }
            var error = null
            response.on('error', (e) => done(e))
            response.on('end', () => done(error))
            response.on('data', (data) => {
              if (data.toString() !== _1byte.toString()) {
                error = new Error('content mismatch')
              }
            })
          })
          request.on('error', (e) => done(e))
          request.end()
        })
      },
    )

    step(
      `presignedUrl(httpMethod, bucketName, objectName, expires, cb)_httpMethod:GET, bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:1000_`,
      (done) => {
        client.presignedUrl('GET', bucketName, _1byteObjectName, 1000, (e, presignedUrl) => {
          if (e) {
            return done(e)
          }
          var transport = http
          var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
          options.method = 'GET'
          if (options.protocol === 'https:') {
            transport = https
          }
          var request = transport.request(options, (response) => {
            if (response.statusCode !== 200) {
              return done(new Error(`error on put : ${response.statusCode}`))
            }
            var error = null
            response.on('error', (e) => done(e))
            response.on('end', () => done(error))
            response.on('data', (data) => {
              if (data.toString() !== _1byte.toString()) {
                error = new Error('content mismatch')
              }
            })
          })
          request.on('error', (e) => done(e))
          request.end()
        })
      },
    )

    step(
      `presignedUrl(httpMethod, bucketName, objectName, expires, cb)_httpMethod:GET, bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:86400, requestDate:StartOfDay_`,
      (done) => {
        var requestDate = new Date()
        requestDate.setHours(0, 0, 0, 0)
        client.presignedUrl('GET', bucketName, _1byteObjectName, 86400, requestDate, (e, presignedUrl) => {
          if (e) {
            return done(e)
          }
          var transport = http
          var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
          options.method = 'GET'
          if (options.protocol === 'https:') {
            transport = https
          }
          var request = transport.request(options, (response) => {
            if (response.statusCode !== 200) {
              return done(new Error(`error on put : ${response.statusCode}`))
            }
            var error = null
            response.on('error', (e) => done(e))
            response.on('end', () => done(error))
            response.on('data', (data) => {
              if (data.toString() !== _1byte.toString()) {
                error = new Error('content mismatch')
              }
            })
          })
          request.on('error', (e) => done(e))
          request.end()
        })
      },
    )

    step(
      `presignedGetObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_1byteObjectName}_`,
      (done) => {
        client.presignedGetObject(bucketName, _1byteObjectName, (e, presignedUrl) => {
          if (e) {
            return done(e)
          }
          var transport = http
          var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
          options.method = 'GET'
          if (options.protocol === 'https:') {
            transport = https
          }
          var request = transport.request(options, (response) => {
            if (response.statusCode !== 200) {
              return done(new Error(`error on put : ${response.statusCode}`))
            }
            var error = null
            response.on('error', (e) => done(e))
            response.on('end', () => done(error))
            response.on('data', (data) => {
              if (data.toString() !== _1byte.toString()) {
                error = new Error('content mismatch')
              }
            })
          })
          request.on('error', (e) => done(e))
          request.end()
        })
      },
    )

    step(
      `presignedGetObject(bucketName, objectName, expires)_bucketName:${bucketName}, objectName:this.does.not.exist, expires:2938_`,
      (done) => {
        client
          .presignedGetObject(bucketName, 'this.does.not.exist', 2938)
          .then(assert.fail)
          .catch(() => done())
      },
    )

    step(
      `presignedGetObject(bucketName, objectName, expires, respHeaders, cb)_bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:1000_`,
      (done) => {
        var respHeaders = {
          'response-content-type': 'text/html',
          'response-content-language': 'en',
          'response-expires': 'Sun, 07 Jun 2020 16:07:58 GMT',
          'response-cache-control': 'No-cache',
          'response-content-disposition': 'attachment; filename=testing.txt',
          'response-content-encoding': 'gzip',
        }
        client.presignedGetObject(bucketName, _1byteObjectName, 1000, respHeaders, (e, presignedUrl) => {
          if (e) {
            return done(e)
          }
          var transport = http
          var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
          options.method = 'GET'
          if (options.protocol === 'https:') {
            transport = https
          }
          var request = transport.request(options, (response) => {
            if (response.statusCode !== 200) {
              return done(new Error(`error on get : ${response.statusCode}`))
            }
            if (respHeaders['response-content-type'] !== response.headers['content-type']) {
              return done(new Error(`content-type header mismatch`))
            }
            if (respHeaders['response-content-language'] !== response.headers['content-language']) {
              return done(new Error(`content-language header mismatch`))
            }
            if (respHeaders['response-expires'] !== response.headers['expires']) {
              return done(new Error(`expires header mismatch`))
            }
            if (respHeaders['response-cache-control'] !== response.headers['cache-control']) {
              return done(new Error(`cache-control header mismatch`))
            }
            if (respHeaders['response-content-disposition'] !== response.headers['content-disposition']) {
              return done(new Error(`content-disposition header mismatch`))
            }
            if (respHeaders['response-content-encoding'] !== response.headers['content-encoding']) {
              return done(new Error(`content-encoding header mismatch`))
            }
            response.on('data', () => {})
            done()
          })
          request.on('error', (e) => done(e))
          request.end()
        })
      },
    )

    step(
      `presignedGetObject(bucketName, objectName, respHeaders, cb)_bucketName:${bucketName}, objectName:${_1byteObjectName}, contentDisposition special chars`,
      (done) => {
        var respHeaders = {
          'response-content-disposition':
            'attachment; filename="abc|"@#$%&/(<>)/=?!{[\']}+*-_:,;def.png"; filename*=UTF-8\'\'t&21st&20ng.png',
        }
        client.presignedGetObject(bucketName, _1byteObjectName, 1000, respHeaders, (e, presignedUrl) => {
          if (e) {
            return done(e)
          }
          var transport = http
          var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
          options.method = 'GET'
          if (options.protocol === 'https:') {
            transport = https
          }
          var request = transport.request(options, (response) => {
            if (response.statusCode !== 200) {
              return done(new Error(`error on get : ${response.statusCode}`))
            }
            if (respHeaders['response-content-disposition'] !== response.headers['content-disposition']) {
              return done(new Error(`content-disposition header mismatch`))
            }
            response.on('data', () => {})
            done()
          })
          request.on('error', (e) => done(e))
          request.end()
        })
      },
    )

    step(
      `presignedGetObject(bucketName, objectName, cb)_bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:86400, requestDate:StartOfDay_`,
      (done) => {
        var requestDate = new Date()
        requestDate.setHours(0, 0, 0, 0)
        client.presignedGetObject(bucketName, _1byteObjectName, 86400, {}, requestDate, (e, presignedUrl) => {
          if (e) {
            return done(e)
          }
          var transport = http
          var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
          options.method = 'GET'
          if (options.protocol === 'https:') {
            transport = https
          }
          var request = transport.request(options, (response) => {
            if (response.statusCode !== 200) {
              return done(new Error(`error on put : ${response.statusCode}`))
            }
            var error = null
            response.on('error', (e) => done(e))
            response.on('end', () => done(error))
            response.on('data', (data) => {
              if (data.toString() !== _1byte.toString()) {
                error = new Error('content mismatch')
              }
            })
          })
          request.on('error', (e) => done(e))
          request.end()
        })
      },
    )

    step('presignedPostPolicy(postPolicy, cb)_postPolicy:expiresin10days_', (done) => {
      var policy = client.newPostPolicy()
      policy.setKey(_1byteObjectName)
      policy.setBucket(bucketName)
      var expires = new Date()
      expires.setSeconds(24 * 60 * 60 * 10)
      policy.setExpires(expires)

      client.presignedPostPolicy(policy, (e, data) => {
        if (e) {
          return done(e)
        }
        var req = superagent.post(data.postURL)
        _.each(data.formData, (value, key) => req.field(key, value))
        req.attach('file', Buffer.from([_1byte]), 'test')
        req.end(function (e) {
          if (e) {
            return done(e)
          }
          done()
        })
        req.on('error', (e) => done(e))
      })
    })

    step('presignedPostPolicy(postPolicy, cb)_postPolicy:setContentType', (done) => {
      var policy = client.newPostPolicy()
      policy.setKey(_1byteObjectName)
      policy.setBucket(bucketName)
      policy.setContentType('text/plain')

      client.presignedPostPolicy(policy, (e, data) => {
        if (e) {
          return done(e)
        }
        var req = superagent.post(data.postURL)
        _.each(data.formData, (value, key) => req.field(key, value))
        req.attach('file', Buffer.from([_1byte]), 'test')
        req.end(function (e) {
          if (e) {
            return done(e)
          }
          done()
        })
        req.on('error', (e) => done(e))
      })
    })

    step('presignedPostPolicy(postPolicy, cb)_postPolicy:setContentTypeStartsWith', (done) => {
      var policy = client.newPostPolicy()
      policy.setKey(_1byteObjectName)
      policy.setBucket(bucketName)
      policy.setContentTypeStartsWith('text/')

      client.presignedPostPolicy(policy, (e, data) => {
        if (e) {
          return done(e)
        }
        var req = superagent.post(data.postURL)
        _.each(data.formData, (value, key) => req.field(key, value))
        req.attach('file', Buffer.from([_1byte]), 'test')
        req.end(function (e) {
          if (e) {
            return done(e)
          }
          done()
        })
        req.on('error', (e) => done(e))
      })
    })

    step('presignedPostPolicy(postPolicy, cb)_postPolicy:setContentDisposition_inline', (done) => {
      var policy = client.newPostPolicy()
      var objectName = 'test-content-disposition' + uuid.v4()
      policy.setKey(objectName)
      policy.setBucket(bucketName)
      policy.setContentDisposition('inline')

      client.presignedPostPolicy(policy, (e, data) => {
        if (e) {
          return done(e)
        }
        var req = superagent.post(data.postURL)
        _.each(data.formData, (value, key) => req.field(key, value))
        req.attach('file', Buffer.from([_1byte]), 'test')
        req.end(function (e) {
          if (e) {
            return done(e)
          }
          client.removeObject(bucketName, objectName, done)
        })
        req.on('error', (e) => done(e))
      })
    })

    step('presignedPostPolicy(postPolicy, cb)_postPolicy:setContentDisposition_attachment', (done) => {
      var policy = client.newPostPolicy()
      var objectName = 'test-content-disposition' + uuid.v4()
      policy.setKey(objectName)
      policy.setBucket(bucketName)
      policy.setContentDisposition('attachment; filename=  My* Docume!  nt.json')

      client.presignedPostPolicy(policy, (e, data) => {
        if (e) {
          return done(e)
        }
        var req = superagent.post(data.postURL)
        _.each(data.formData, (value, key) => req.field(key, value))
        req.attach('file', Buffer.from([_1byte]), 'test')
        req.end(function (e) {
          if (e) {
            return done(e)
          }
          client.removeObject(bucketName, objectName, done)
        })
        req.on('error', (e) => done(e))
      })
    })

    step('presignedPostPolicy(postPolicy, cb)_postPolicy:setUserMetaData_', (done) => {
      var policy = client.newPostPolicy()
      var objectName = 'test-metadata' + uuid.v4()
      policy.setKey(objectName)
      policy.setBucket(bucketName)
      policy.setUserMetaData({
        key: 'my-value',
        anotherKey: 'another-value',
      })

      client.presignedPostPolicy(policy, (e, data) => {
        if (e) {
          return done(e)
        }
        var req = superagent.post(data.postURL)
        _.each(data.formData, (value, key) => req.field(key, value))
        req.attach('file', Buffer.from([_1byte]), 'test')
        req.end(function (e) {
          if (e) {
            return done(e)
          }
          client.removeObject(bucketName, objectName, done)
        })
        req.on('error', (e) => done(e))
      })
    })

    step('presignedPostPolicy(postPolicy)_postPolicy: null_', (done) => {
      client
        .presignedPostPolicy(null)
        .then(() => {
          done(new Error('null policy should fail'))
        })
        .catch(() => done())
    })

    step(
      `presignedUrl(httpMethod, bucketName, objectName, expires, reqParams, cb)_httpMethod:GET, bucketName:${bucketName}, expires:1000_`,
      (done) => {
        client.presignedUrl('GET', bucketName, '', 1000, { prefix: 'data', 'max-keys': 1000 }, (e, presignedUrl) => {
          if (e) {
            return done(e)
          }
          var transport = http
          var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
          options.method = 'GET'
          options.headers = {}
          var str = ''
          if (options.protocol === 'https:') {
            transport = https
          }
          var callback = function (response) {
            if (response.statusCode !== 200) {
              return done(new Error(`error on put : ${response.statusCode}`))
            }
            response.on('error', (e) => done(e))
            response.on('end', function () {
              if (!str.match(`<Key>${_1byteObjectName}</Key>`)) {
                return done(new Error('Listed object does not match the object in the bucket!'))
              }
              done()
            })
            response.on('data', function (chunk) {
              str += chunk
            })
          }
          var request = transport.request(options, callback)
          request.end()
        })
      },
    )

    step(
      `presignedUrl(httpMethod, bucketName, objectName, expires, cb)_httpMethod:DELETE, bucketName:${bucketName}, objectName:${_1byteObjectName}, expires:1000_`,
      (done) => {
        client.presignedUrl('DELETE', bucketName, _1byteObjectName, 1000, (e, presignedUrl) => {
          if (e) {
            return done(e)
          }
          var transport = http
          var options = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
          options.method = 'DELETE'
          options.headers = {}
          if (options.protocol === 'https:') {
            transport = https
          }
          var request = transport.request(options, (response) => {
            if (response.statusCode !== 204) {
              return done(new Error(`error on put : ${response.statusCode}`))
            }
            response.on('error', (e) => done(e))
            response.on('end', () => done())
            response.on('data', () => {})
          })
          request.on('error', (e) => done(e))
          request.end()
        })
      },
    )
  })

  describe('listObjects', function () {
    var listObjectPrefix = 'miniojsPrefix'
    var listObjectsNum = 10
    var objArray = []
    var listArray = []
    var listPrefixArray = []

    step(
      `putObject(bucketName, objectName, stream, size, metaData, callback)_bucketName:${bucketName}, stream:1b, size:1_Create ${listObjectsNum} objects`,
      (done) => {
        _.times(listObjectsNum, (i) => objArray.push(`${listObjectPrefix}.${i}`))
        objArray = objArray.sort()
        async.mapLimit(
          objArray,
          20,
          (objectName, cb) => client.putObject(bucketName, objectName, readableStream(_1byte), _1byte.length, {}, cb),
          done,
        )
      },
    )

    step(
      `listObjects(bucketName, prefix, recursive)_bucketName:${bucketName}, prefix: miniojsprefix, recursive:true_`,
      (done) => {
        client
          .listObjects(bucketName, listObjectPrefix, true)
          .on('error', done)
          .on('end', () => {
            if (_.isEqual(objArray, listPrefixArray)) {
              return done()
            }
            return done(new Error(`listObjects lists ${listPrefixArray.length} objects, expected ${listObjectsNum}`))
          })
          .on('data', (data) => {
            listPrefixArray.push(data.name)
          })
      },
    )

    step('listObjects(bucketName, prefix, recursive)_recursive:true_', (done) => {
      try {
        client.listObjects('', '', true).on('end', () => {
          return done(new Error(`listObjects should throw exception when empty bucketname is passed`))
        })
      } catch (e) {
        if (e.name === 'InvalidBucketNameError') {
          done()
        } else {
          done(e)
        }
      }
    })

    step(`listObjects(bucketName, prefix, recursive)_bucketName:${bucketName}, recursive:false_`, (done) => {
      listArray = []
      client
        .listObjects(bucketName, '', false)
        .on('error', done)
        .on('end', () => {
          if (_.isEqual(objArray, listArray)) {
            return done()
          }
          return done(new Error(`listObjects lists ${listArray.length} objects, expected ${listObjectsNum}`))
        })
        .on('data', (data) => {
          listArray.push(data.name)
        })
    })

    step(
      `listObjectsV2(bucketName, prefix, recursive, startAfter)_bucketName:${bucketName}, recursive:true_`,
      (done) => {
        listArray = []
        client
          .listObjectsV2(bucketName, '', true, '')
          .on('error', done)
          .on('end', () => {
            if (_.isEqual(objArray, listArray)) {
              return done()
            }
            return done(new Error(`listObjects lists ${listArray.length} objects, expected ${listObjectsNum}`))
          })
          .on('data', (data) => {
            listArray.push(data.name)
          })
      },
    )

    step(
      `listObjectsV2WithMetadata(bucketName, prefix, recursive, startAfter)_bucketName:${bucketName}, recursive:true_`,
      (done) => {
        listArray = []
        client.extensions
          .listObjectsV2WithMetadata(bucketName, '', true, '')
          .on('error', done)
          .on('end', () => {
            if (_.isEqual(objArray, listArray)) {
              return done()
            }
            return done(new Error(`listObjects lists ${listArray.length} objects, expected ${listObjectsNum}`))
          })
          .on('data', (data) => {
            listArray.push(data.name)
          })
      },
    )

    step(
      `removeObject(bucketName, objectName, callback)_bucketName:${bucketName}_Remove ${listObjectsNum} objects`,
      (done) => {
        async.mapLimit(listArray, 20, (objectName, cb) => client.removeObject(bucketName, objectName, cb), done)
      },
    )
  })

  describe('removeObjects', function () {
    var listObjectPrefix = 'miniojsPrefix'
    var listObjectsNum = 10
    var objArray = []
    var objectsList = []

    step(
      `putObject(bucketName, objectName, stream, size, contentType, callback)_bucketName:${bucketName}, stream:1b, size:1_Create ${listObjectsNum} objects`,
      (done) => {
        _.times(listObjectsNum, (i) => objArray.push(`${listObjectPrefix}.${i}`))
        objArray = objArray.sort()
        async.mapLimit(
          objArray,
          20,
          (objectName, cb) => client.putObject(bucketName, objectName, readableStream(_1byte), _1byte.length, '', cb),
          done,
        )
      },
    )

    step(`listObjects(bucketName, prefix, recursive)_bucketName:${bucketName}, recursive:false_`, (done) => {
      client
        .listObjects(bucketName, listObjectPrefix, false)
        .on('error', done)
        .on('end', () => {
          try {
            client.removeObjects(bucketName, '', function (e) {
              if (e) {
                done()
              }
            })
          } catch (e) {
            if (e.name === 'InvalidArgumentError') {
              done()
            }
          }
        })
        .on('data', (data) => {
          objectsList.push(data.name)
        })
    })

    objectsList = []

    step(`listObjects(bucketName, prefix, recursive)_bucketName:${bucketName}, recursive:false_`, (done) => {
      client
        .listObjects(bucketName, listObjectPrefix, false)
        .on('error', done)
        .on('end', () => {
          client.removeObjects(bucketName, objectsList, function (e) {
            if (e) {
              done(e)
            }
            done()
          })
        })
        .on('data', (data) => {
          objectsList.push(data.name)
        })
    })

    // Non latin characters
    step(`putObject(bucketName, objectName, stream)_bucketName:${bucketName}, objectName:fileΩ, stream:1b`, (done) => {
      client
        .putObject(bucketName, 'fileΩ', _1byte)
        .then(() => done())
        .catch(done)
    })

    step(`removeObjects with non latin characters`, (done) => {
      client
        .removeObjects(bucketName, ['fileΩ'])
        .then(() => done())
        .catch(done)
    })
  })

  describe('bucket notifications', () => {
    describe('#listenBucketNotification', () => {
      before(function () {
        // listenBucketNotification only works on MinIO, so skip if
        // the host is Amazon.
        let hostSkipList = ['s3.amazonaws.com']
        if (hostSkipList.includes(client.host)) {
          this.skip()
        }
      })

      step(
        `listenBucketNotification(bucketName, prefix, suffix, events)_bucketName:${bucketName}, prefix:photos/, suffix:.jpg, events:bad_`,
        (done) => {
          let poller = client.listenBucketNotification(bucketName, 'photos/', '.jpg', ['bad'])
          poller.on('error', (error) => {
            if (error.code !== 'NotImplemented') {
              assert.match(error.message, /A specified event is not supported for notifications./)
              assert.equal(error.code, 'InvalidArgument')
            }
            done()
          })
        },
      )
      step(
        `listenBucketNotification(bucketName, prefix, suffix, events)_bucketName:${bucketName}, events: s3:ObjectCreated:*_`,
        (done) => {
          let poller = client.listenBucketNotification(bucketName, '', '', ['s3:ObjectCreated:*'])
          let records = 0
          let pollerError = null
          poller.on('notification', (record) => {
            records++

            assert.equal(record.eventName, 's3:ObjectCreated:Put')
            assert.equal(record.s3.bucket.name, bucketName)
            assert.equal(record.s3.object.key, objectName)
          })
          poller.on('error', (error) => {
            pollerError = error
          })
          setTimeout(() => {
            // Give it some time for the notification to be setup.
            if (pollerError) {
              if (pollerError.code !== 'NotImplemented') {
                done(pollerError)
              } else {
                done()
              }
              return
            }
            client.putObject(bucketName, objectName, 'stringdata', (err) => {
              if (err) {
                return done(err)
              }
              setTimeout(() => {
                // Give it some time to get the notification.
                poller.stop()
                client.removeObject(bucketName, objectName, (err) => {
                  if (err) {
                    return done(err)
                  }
                  if (!records) {
                    return done(new Error('notification not received'))
                  }
                  done()
                })
              }, 10 * 1000)
            })
          }, 10 * 1000)
        },
      )

      // This test is very similar to that above, except it does not include
      // Minio.ObjectCreatedAll in the config. Thus, no events should be emitted.
      step(
        `listenBucketNotification(bucketName, prefix, suffix, events)_bucketName:${bucketName}, events:s3:ObjectRemoved:*`,
        (done) => {
          let poller = client.listenBucketNotification(bucketName, '', '', ['s3:ObjectRemoved:*'])
          poller.on('notification', assert.fail)
          poller.on('error', (error) => {
            if (error.code !== 'NotImplemented') {
              done(error)
            }
          })

          client.putObject(bucketName, objectName, 'stringdata', (err) => {
            if (err) {
              return done(err)
            }
            // It polls every five seconds, so wait for two-ish polls, then end.
            setTimeout(() => {
              poller.stop()
              poller.removeAllListeners('notification')
              // clean up object now
              client.removeObject(bucketName, objectName, done)
            }, 11 * 1000)
          })
        },
      )
    })
  })

  describe('Bucket Versioning API', () => {
    // Isolate the bucket/object for easy debugging and tracking.
    const versionedBucketName = 'minio-js-test-version-' + uuid.v4()
    before((done) => client.makeBucket(versionedBucketName, '', done))
    after((done) => client.removeBucket(versionedBucketName, done))

    describe('Versioning Steps test', function () {
      step('Check if versioning is enabled on a bucket', (done) => {
        client.getBucketVersioning(versionedBucketName, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
      })
      step('Enable versioning  on a bucket', (done) => {
        client.setBucketVersioning(versionedBucketName, { Status: 'Enabled' }, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
      })

      step('Suspend versioning  on a bucket', (done) => {
        client.setBucketVersioning(versionedBucketName, { Status: 'Suspended' }, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
      })

      step('Check if versioning is Suspended on a bucket', (done) => {
        client.getBucketVersioning(versionedBucketName, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
      })
    })
  })

  describe('Versioning tests on a buckets', function () {
    // Isolate the bucket/object for easy debugging and tracking.
    const versionedBucketName = 'minio-js-test-version-' + uuid.v4()
    const versioned_100kbObjectName = 'datafile-100-kB'
    const versioned_100kb_Object = dataDir
      ? fs.readFileSync(dataDir + '/' + versioned_100kbObjectName)
      : Buffer.alloc(100 * 1024, 0)

    before((done) => client.makeBucket(versionedBucketName, '', done))
    after((done) => client.removeBucket(versionedBucketName, done))

    describe('Versioning Steps test', function () {
      let versionId

      step(
        `setBucketVersioning(bucketName, versionConfig):_bucketName:${versionedBucketName},versionConfig:{Status:"Enabled"} `,
        (done) => {
          client.setBucketVersioning(versionedBucketName, { Status: 'Enabled' }, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            done()
          })
        },
      )

      step(
        `putObject(bucketName, objectName, stream)_bucketName:${versionedBucketName}, objectName:${versioned_100kbObjectName}, stream:100Kib_`,
        (done) => {
          client
            .putObject(versionedBucketName, versioned_100kbObjectName, versioned_100kb_Object)
            .then(() => done())
            .catch(done)
        },
      )

      step(
        `statObject(bucketName, objectName, statOpts)_bucketName:${versionedBucketName}, objectName:${versioned_100kbObjectName}`,
        (done) => {
          client.statObject(versionedBucketName, versioned_100kbObjectName, {}, (e, res) => {
            versionId = res.versionId
            done()
          })
        },
      )

      step(
        `removeObject(bucketName, objectName, removeOpts)_bucketName:${versionedBucketName}, objectName:${versioned_100kbObjectName}`,
        (done) => {
          client.removeObject(versionedBucketName, versioned_100kbObjectName, { versionId: versionId }, () => {
            done()
          })
        },
      )

      step(
        `setBucketVersioning(bucketName, versionConfig):_bucketName:${versionedBucketName},versionConfig:{Status:"Suspended"}`,
        (done) => {
          client.setBucketVersioning(versionedBucketName, { Status: 'Suspended' }, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            done()
          })
        },
      )
    })
  })

  describe('Versioning tests on a buckets: getObject, fGetObject, getPartialObject, putObject, removeObject with versionId support', function () {
    // Isolate the bucket/object for easy debugging and tracking.
    const versionedBucketName = 'minio-js-test-version-' + uuid.v4()
    const versioned_100kbObjectName = 'datafile-100-kB'
    const versioned_100kb_Object = dataDir
      ? fs.readFileSync(dataDir + '/' + versioned_100kbObjectName)
      : Buffer.alloc(100 * 1024, 0)

    before((done) => client.makeBucket(versionedBucketName, '', done))
    after((done) => client.removeBucket(versionedBucketName, done))

    describe('Versioning Test for  getObject, getPartialObject, putObject, removeObject with versionId support', function () {
      let versionId = null
      step(
        `Enable Versioning on Bucket: setBucketVersioning(bucketName,versioningConfig)_bucketName:${versionedBucketName},{Status:"Enabled"}`,
        (done) => {
          client.setBucketVersioning(versionedBucketName, { Status: 'Enabled' }, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            done()
          })
        },
      )

      step(
        `putObject(bucketName, objectName, stream)_bucketName:${versionedBucketName}, objectName:${versioned_100kbObjectName}, stream:100Kib_`,
        (done) => {
          client
            .putObject(versionedBucketName, versioned_100kbObjectName, versioned_100kb_Object)
            .then((res = {}) => {
              if (res.versionId) {
                versionId = res.versionId // In gateway mode versionId will not be returned.
              }
              done()
            })
            .catch(done)
        },
      )

      step(
        `getObject(bucketName, objectName, getOpts)_bucketName:${versionedBucketName}, objectName:${versioned_100kbObjectName}`,
        (done) => {
          if (versionId) {
            client.getObject(
              versionedBucketName,
              versioned_100kbObjectName,
              { versionId: versionId },
              function (e, dataStream) {
                const objVersion = getVersionId(dataStream.headers)
                if (objVersion) {
                  done()
                } else {
                  done(new Error('versionId not found in getObject response'))
                }
              },
            )
          } else {
            done()
          }
        },
      )

      step(
        `fGetObject(bucketName, objectName, filePath, getOpts={})_bucketName:${versionedBucketName}, objectName:${versioned_100kbObjectName}`,
        (done) => {
          if (versionId) {
            var tmpFileDownload = `${tmpDir}/${versioned_100kbObjectName}.download`
            client.fGetObject(
              versionedBucketName,
              versioned_100kbObjectName,
              tmpFileDownload,
              { versionId: versionId },
              function () {
                done()
              },
            )
          } else {
            done()
          }
        },
      )

      step(
        `getPartialObject(bucketName, objectName, offset, length, getOpts)_bucketName:${versionedBucketName}, objectName:${versioned_100kbObjectName}`,
        (done) => {
          if (versionId) {
            client.getPartialObject(
              versionedBucketName,
              versioned_100kbObjectName,
              10,
              30,
              { versionId: versionId },
              function (e, dataStream) {
                const objVersion = getVersionId(dataStream.headers)
                if (objVersion) {
                  done()
                } else {
                  done(new Error('versionId not found in getPartialObject response'))
                }
              },
            )
          } else {
            done()
          }
        },
      )

      step(
        `removeObject(bucketName, objectName, removeOpts)_bucketName:${versionedBucketName}, objectName:${versioned_100kbObjectName},removeOpts:{versionId:${versionId}`,
        (done) => {
          if (versionId) {
            client.removeObject(versionedBucketName, versioned_100kbObjectName, { versionId: versionId }, () => {
              done()
            })
          } else {
            // In gateway mode, use regular delete to remove an object so that the bucket can be cleaned up.
            client.removeObject(versionedBucketName, versioned_100kbObjectName, () => {
              done()
            })
          }
        },
      )

      step(
        `setBucketVersioning(bucketName, versionConfig):_bucketName:${versionedBucketName},versionConfig:{Status:"Suspended"}`,
        (done) => {
          client.setBucketVersioning(versionedBucketName, { Status: 'Suspended' }, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            done()
          })
        },
      )
    })
  })

  describe('Versioning Supported listObjects', function () {
    const versionedBucketName = 'minio-js-test-version-list' + uuid.v4()
    const prefixName = 'Prefix1'
    const versionedObjectName = 'datafile-100-kB'
    const objVersionIdCounter = [1, 2, 3, 4, 5] // This should track adding 5 versions of the same object.
    let listObjectsNum = objVersionIdCounter.length
    let objArray = []
    let listPrefixArray = []
    let isVersioningSupported = false

    const objNameWithPrefix = `${prefixName}/${versionedObjectName}`

    before((done) =>
      client.makeBucket(versionedBucketName, '', () => {
        client.setBucketVersioning(versionedBucketName, { Status: 'Enabled' }, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          isVersioningSupported = true
          done()
        })
      }),
    )
    after((done) => client.removeBucket(versionedBucketName, done))

    step(
      `putObject(bucketName, objectName, stream, size, metaData, callback)_bucketName:${versionedBucketName}, stream:1b, size:1_Create ${listObjectsNum} objects`,
      (done) => {
        if (isVersioningSupported) {
          let count = 1
          objVersionIdCounter.forEach(() => {
            client.putObject(
              versionedBucketName,
              objNameWithPrefix,
              readableStream(_1byte),
              _1byte.length,
              {},
              (e, data) => {
                objArray.push(data)
                if (count === objVersionIdCounter.length) {
                  done()
                }
                count += 1
              },
            )
          })
        } else {
          done()
        }
      },
    )

    step(
      `listObjects(bucketName, prefix, recursive)_bucketName:${versionedBucketName}, prefix: '', recursive:true_`,
      (done) => {
        if (isVersioningSupported) {
          client
            .listObjects(versionedBucketName, '', true, { IncludeVersion: true })
            .on('error', done)
            .on('end', () => {
              if (_.isEqual(objArray.length, listPrefixArray.length)) {
                return done()
              }
              return done(new Error(`listObjects lists ${listPrefixArray.length} objects, expected ${listObjectsNum}`))
            })
            .on('data', (data) => {
              listPrefixArray.push(data)
            })
        } else {
          done()
        }
      },
    )

    step(
      `listObjects(bucketName, prefix, recursive)_bucketName:${versionedBucketName}, prefix: ${prefixName}, recursive:true_`,
      (done) => {
        if (isVersioningSupported) {
          listPrefixArray = []
          client
            .listObjects(versionedBucketName, prefixName, true, { IncludeVersion: true })
            .on('error', done)
            .on('end', () => {
              if (_.isEqual(objArray.length, listPrefixArray.length)) {
                return done()
              }
              return done(new Error(`listObjects lists ${listPrefixArray.length} objects, expected ${listObjectsNum}`))
            })
            .on('data', (data) => {
              listPrefixArray.push(data)
            })
        } else {
          done()
        }
      },
    )

    step(
      `removeObject(bucketName, objectName, removeOpts)_bucketName:${versionedBucketName}_Remove ${listObjectsNum} objects`,
      (done) => {
        if (isVersioningSupported) {
          let count = 1
          listPrefixArray.forEach((item) => {
            client.removeObject(versionedBucketName, item.name, { versionId: item.versionId }, () => {
              if (count === listPrefixArray.length) {
                done()
              }
              count += 1
            })
          })
        } else {
          done()
        }
      },
    )
  })

  describe('Versioning tests on a bucket for Deletion of Multiple versions', function () {
    // Isolate the bucket/object for easy debugging and tracking.
    const versionedBucketName = 'minio-js-test-version-' + uuid.v4()
    const versioned_100kbObjectName = 'datafile-100-kB'
    const versioned_100kb_Object = dataDir
      ? fs.readFileSync(dataDir + '/' + versioned_100kbObjectName)
      : Buffer.alloc(100 * 1024, 0)

    before((done) => client.makeBucket(versionedBucketName, '', done))
    after((done) => client.removeBucket(versionedBucketName, done))

    describe('Test for removal of multiple versions', function () {
      let isVersioningSupported = false
      const objVersionList = []
      step(
        `setBucketVersioning(bucketName, versionConfig):_bucketName:${versionedBucketName},versionConfig:{Status:"Enabled"} `,
        (done) => {
          client.setBucketVersioning(versionedBucketName, { Status: 'Enabled' }, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            isVersioningSupported = true
            done()
          })
        },
      )

      step(
        `putObject(bucketName, objectName, stream)_bucketName:${versionedBucketName}, objectName:${versioned_100kbObjectName}, stream:100Kib_`,
        (done) => {
          if (isVersioningSupported) {
            client
              .putObject(versionedBucketName, versioned_100kbObjectName, versioned_100kb_Object)
              .then(() => done())
              .catch(done)
          } else {
            done()
          }
        },
      )
      // Put two versions of the same object.
      step(
        `putObject(bucketName, objectName, stream)_bucketName:${versionedBucketName}, objectName:${versioned_100kbObjectName}, stream:100Kib_`,
        (done) => {
          // Put two versions of the same object.
          if (isVersioningSupported) {
            client
              .putObject(versionedBucketName, versioned_100kbObjectName, versioned_100kb_Object)
              .then(() => done())
              .catch(done)
          } else {
            done()
          }
        },
      )

      step(
        `listObjects(bucketName, prefix, recursive)_bucketName:${versionedBucketName}, prefix: '', recursive:true_`,
        (done) => {
          if (isVersioningSupported) {
            client
              .listObjects(versionedBucketName, '', true, { IncludeVersion: true })
              .on('error', done)
              .on('end', () => {
                if (_.isEqual(2, objVersionList.length)) {
                  return done()
                }
                return done(new Error(`listObjects lists ${objVersionList.length} objects, expected ${2}`))
              })
              .on('data', (data) => {
                // Pass list object response as is to remove objects
                objVersionList.push(data)
              })
          } else {
            done()
          }
        },
      )

      step(
        `removeObjects(bucketName, objectList, removeOpts)_bucketName:${versionedBucketName}_Remove ${objVersionList.length} objects`,
        (done) => {
          if (isVersioningSupported) {
            let count = 1
            objVersionList.forEach(() => {
              // remove multiple versions of the object.
              client.removeObjects(versionedBucketName, objVersionList, () => {
                if (count === objVersionList.length) {
                  done()
                }
                count += 1
              })
            })
          } else {
            done()
          }
        },
      )
    })
  })

  describe('Bucket Tags API', () => {
    // Isolate the bucket/object for easy debugging and tracking.
    const tagsBucketName = 'minio-js-test-tags-' + uuid.v4()
    before((done) => client.makeBucket(tagsBucketName, '', done))
    after((done) => client.removeBucket(tagsBucketName, done))

    describe('set, get and remove Tags on a bucket', function () {
      step(`Set tags on a bucket_bucketName:${tagsBucketName}`, (done) => {
        client.setBucketTagging(tagsBucketName, { 'test-tag-key': 'test-tag-value' }, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
      })
      step(`Get tags on a bucket_bucketName:${tagsBucketName}`, (done) => {
        client.getBucketTagging(tagsBucketName, (err, tagList) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          if (Array.isArray(tagList)) {
            done()
          }
        })
      })

      step(`remove Tags on a bucket_bucketName:${tagsBucketName}`, (done) => {
        client.removeBucketTagging(tagsBucketName, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
      })
    })
  })

  describe('Object Tags API', () => {
    // Isolate the bucket/object for easy debugging and tracking.
    const tagsBucketName = 'minio-js-test-tags-' + uuid.v4()
    before((done) => client.makeBucket(tagsBucketName, '', done))
    after((done) => client.removeBucket(tagsBucketName, done))

    const tagObjName = 'datafile-100-kB'
    const tagObject = Buffer.alloc(100 * 1024, 0)

    describe('set, get and remove Tags on an object', function () {
      step(
        `putObject(bucketName, objectName, stream)_bucketName:${tagsBucketName}, objectName:${tagObjName}, stream:100Kib_`,
        (done) => {
          client
            .putObject(tagsBucketName, tagObjName, tagObject)
            .then(() => done())
            .catch(done)
        },
      )

      step(`putObjectTagging  object_bucketName:${tagsBucketName}, objectName:${tagObjName},`, (done) => {
        client.setObjectTagging(tagsBucketName, tagObjName, { 'test-tag-key-obj': 'test-tag-value-obj' }, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
      })

      step(`getObjectTagging  object_bucketName:${tagsBucketName}, objectName:${tagObjName},`, (done) => {
        client.getObjectTagging(tagsBucketName, tagObjName, (err, tagList) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          if (Array.isArray(tagList)) {
            done()
          }
        })
      })

      step(`removeObjectTagging on an object_bucketName:${tagsBucketName}, objectName:${tagObjName},`, (done) => {
        client.removeObjectTagging(tagsBucketName, tagObjName, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
      })
      step(`removeObject object_bucketName:${tagsBucketName}, objectName:${tagObjName},`, (done) => {
        client.removeObject(tagsBucketName, tagObjName, () => {
          done()
        })
      })
    })
  })

  describe('Object Tags API with Versioning support', () => {
    // Isolate the bucket/object for easy debugging and tracking.
    const tagsVersionedBucketName = 'minio-js-test-tags-version-' + uuid.v4()
    before((done) => client.makeBucket(tagsVersionedBucketName, '', done))
    after((done) => client.removeBucket(tagsVersionedBucketName, done))

    const tagObjName = 'datafile-100-kB'
    const tagObject = Buffer.alloc(100 * 1024, 0)
    let isVersioningSupported = false
    let versionId = null

    describe('set, get and remove Tags on a versioned object', function () {
      step(
        `Enable Versioning on Bucket: setBucketVersioning(bucketName,versioningConfig)_bucketName:${tagsVersionedBucketName},{Status:"Enabled"}`,
        (done) => {
          client.setBucketVersioning(tagsVersionedBucketName, { Status: 'Enabled' }, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            isVersioningSupported = true
            done()
          })
        },
      )

      step(
        `putObject(bucketName, objectName, stream)_bucketName:${tagsVersionedBucketName}, objectName:${tagObjName}, stream:100Kib_`,
        (done) => {
          if (isVersioningSupported) {
            client
              .putObject(tagsVersionedBucketName, tagObjName, tagObject)
              .then((res = {}) => {
                if (res.versionId) {
                  versionId = res.versionId // In gateway mode versionId will not be returned.
                }
                done()
              })
              .catch(done)
          } else {
            done()
          }
        },
      )

      step(`Set tags on an object_bucketName:${tagsVersionedBucketName}, objectName:${tagObjName},`, (done) => {
        if (isVersioningSupported) {
          client.setObjectTagging(
            tagsVersionedBucketName,
            tagObjName,
            { 'test-tag-key-obj': 'test-tag-value-obj' },
            { versionId: versionId },
            (err) => {
              if (err) {
                return done(err)
              }
              done()
            },
          )
        } else {
          done()
        }
      })

      step(`Get tags on an object_bucketName:${tagsVersionedBucketName}, objectName:${tagObjName},`, (done) => {
        if (isVersioningSupported) {
          client.getObjectTagging(tagsVersionedBucketName, tagObjName, { versionId: versionId }, (err, tagList) => {
            if (err) {
              return done(err)
            }
            if (Array.isArray(tagList)) {
              done()
            }
          })
        } else {
          done()
        }
      })

      step(`remove Tags on an object_bucketName:${tagsVersionedBucketName}, objectName:${tagObjName},`, (done) => {
        if (isVersioningSupported) {
          client.removeObjectTagging(tagsVersionedBucketName, tagObjName, { versionId: versionId }, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            done()
          })
        } else {
          done()
        }
      })
      step(`remove Tags on an object_bucketName:${tagsVersionedBucketName}, objectName:${tagObjName},`, (done) => {
        if (isVersioningSupported) {
          client.removeObject(tagsVersionedBucketName, tagObjName, { versionId: versionId }, () => {
            done()
          })
        } else {
          done()
        }
      })
    })
  })

  describe('Bucket Lifecycle API', () => {
    const bucketName = 'minio-js-test-lifecycle-' + uuid.v4()
    before((done) => client.makeBucket(bucketName, '', done))
    after((done) => client.removeBucket(bucketName, done))

    describe('Set, Get Lifecycle config Tests', function () {
      step(`Set lifecycle config on a bucket:_bucketName:${bucketName}`, (done) => {
        const lifecycleConfig = {
          Rule: [
            {
              ID: 'Transition and Expiration Rule',
              Status: 'Enabled',
              Filter: {
                Prefix: '',
              },
              Expiration: {
                Days: '3650',
              },
            },
          ],
        }
        client.setBucketLifecycle(bucketName, lifecycleConfig, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
      })

      step('Set lifecycle config of a bucket', (done) => {
        client.getBucketLifecycle(bucketName, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
      })

      step('Remove lifecycle config of a bucket', (done) => {
        client.removeBucketLifecycle(bucketName, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
      })
    })
  })

  describe('Versioning Supported preSignedUrl Get, Put Tests', function () {
    /**
     * Test Steps
     * 1. Create Versioned Bucket
     * 2. presignedPutObject of 2 Versions of different size
     * 3. List and ensure that there are two versions
     * 4. presignedGetObject with versionId to ensure that we are able to get
     * 5. Remove all object versions at once
     * 6. Cleanup bucket.
     */

    const versionedBucketName = 'minio-js-test-ver-presign-' + uuid.v4()
    const versionedPresignObjName = 'datafile-1-b'
    const _100_byte = Buffer.alloc(100 * 1024, 0)
    const _200_byte = Buffer.alloc(200 * 1024, 0)
    let isVersioningSupported = false
    const objectsList = []
    const expectedVersionsCount = 2

    before((done) =>
      client.makeBucket(versionedBucketName, '', () => {
        client.setBucketVersioning(versionedBucketName, { Status: 'Enabled' }, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          isVersioningSupported = true
          done()
        })
      }),
    )
    after((done) => client.removeBucket(versionedBucketName, done))

    step(
      `presignedPutObject(bucketName, objectName, expires=1000, cb)_bucketName:${versionedBucketName} ${versionedPresignObjName} _version:1`,
      (done) => {
        if (isVersioningSupported) {
          client.presignedPutObject(versionedBucketName, versionedPresignObjName, 1000, (e, presignedUrl) => {
            if (e) {
              done(e)
            }
            let mobileClientReqWithProtocol = http
            var upldRequestOptions = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
            upldRequestOptions.method = 'PUT'
            upldRequestOptions.headers = {
              'content-length': _100_byte.length,
            }
            if (upldRequestOptions.protocol === 'https:') {
              mobileClientReqWithProtocol = https
            }
            const uploadRequest = mobileClientReqWithProtocol.request(upldRequestOptions, (response) => {
              if (response.statusCode !== 200) {
                return new Error(`error on put : ${response.statusCode}`)
              }
              response.on('error', (err) => {
                done(err)
              })
              response.on('end', () => {
                done()
              })
              response.on('data', () => {
                // just drain
              })
            })

            uploadRequest.on('error', (er) => {
              done(er)
            })

            uploadRequest.write(_100_byte)
            uploadRequest.end()
          })
        } else {
          done()
        }
      },
    )

    step(
      `presignedPutObject(bucketName, objectName, expires=1000, cb)_bucketName:${versionedBucketName} ${versionedPresignObjName} _version:2`,
      (done) => {
        if (isVersioningSupported) {
          client.presignedPutObject(versionedBucketName, versionedPresignObjName, 1000, (e, presignedUrl) => {
            if (e) {
              done(e)
            }
            let mobileClientReqWithProtocol = http
            var upldRequestOptions = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
            upldRequestOptions.method = 'PUT'
            upldRequestOptions.headers = {
              'content-length': _200_byte.length,
            }
            if (upldRequestOptions.protocol === 'https:') {
              mobileClientReqWithProtocol = https
            }
            const uploadRequest = mobileClientReqWithProtocol.request(upldRequestOptions, (response) => {
              if (response.statusCode !== 200) {
                return new Error(`error on put : ${response.statusCode}`)
              }
              response.on('error', (err) => {
                done(err)
              })
              response.on('end', () => {
                done()
              })
              response.on('data', () => {
                // just drain
              })
            })

            uploadRequest.on('error', (er) => {
              done(er)
            })

            uploadRequest.write(_200_byte)
            uploadRequest.end()
          })
        } else {
          done()
        }
      },
    )

    step(
      `listObjects(bucketName, '', true, {IncludeVersion: true}, cb)_bucketName:${versionedBucketName}  _prefix:""`,
      (done) => {
        if (isVersioningSupported) {
          const objectsStream = client.listObjects(versionedBucketName, '', true, { IncludeVersion: true })
          objectsStream.on('data', function (obj) {
            objectsList.push({ versionId: obj.versionId, name: obj.name })
          })

          objectsStream.on('error', function () {
            return done()
          })
          objectsStream.on('end', function () {
            const objectListCount = objectsList.length
            if (objectListCount === expectedVersionsCount) {
              done()
            } else {
              return done(
                new Error(`Version count does not match for versioned presigned url test. ${expectedVersionsCount}`),
              )
            }
          })
        } else {
          done()
        }
      },
    )

    step(
      `presignedGetObject(bucketName, objectName, 1000, respHeaders, requestDate, cb)_bucketName:${versionedBucketName} _objectName:${versionedPresignObjName} _version:(2/2)`,
      (done) => {
        if (isVersioningSupported) {
          client.presignedGetObject(
            versionedBucketName,
            objectsList[1].name,
            1000,
            { versionId: objectsList[1].versionId },
            new Date(),
            (e, presignedUrl) => {
              if (e) {
                return done()
              }
              let mobileClientReqWithProtocol = http
              const getReqOpts = _.pick(url.parse(presignedUrl), ['hostname', 'port', 'path', 'protocol'])
              getReqOpts.method = 'GET'
              const _100kbmd5 = crypto.createHash('md5').update(_100_byte).digest('hex')

              const hash = crypto.createHash('md5')
              if (getReqOpts.protocol === 'https:') {
                mobileClientReqWithProtocol = https
              }
              const request = mobileClientReqWithProtocol.request(getReqOpts, (response) => {
                // if delete marker. method not allowed.
                if (response.statusCode !== 200) {
                  return new Error(`error on get : ${response.statusCode}`)
                }
                response.on('error', () => {
                  return done()
                })
                response.on('end', () => {
                  const hashValue = hash.digest('hex')
                  if (hashValue === _100kbmd5) {
                    done()
                  } else {
                    return done(new Error('Unable to retrieve version of an object using presignedGetObject'))
                  }
                })
                response.on('data', (data) => {
                  hash.update(data)
                })
              })
              request.on('error', () => {
                return done()
              })
              request.end()
            },
          )
        } else {
          done()
        }
      },
    )

    step(`removeObjects(bucketName, objectsList)_bucketName:${versionedBucketName}`, (done) => {
      if (isVersioningSupported) {
        client.removeObjects(versionedBucketName, objectsList, function (e) {
          if (e) {
            done(e)
          }
          done()
        })
      } else {
        done()
      }
    })
  })

  describe('Object Lock API Bucket Options Test', () => {
    // Isolate the bucket/object for easy debugging and tracking.
    // Gateway mode does not support this header.

    describe('Object Lock support makeBucket API Tests', function () {
      const lockEnabledBucketName = 'minio-js-test-lock-mb-' + uuid.v4()
      let isFeatureSupported = false
      step(`Check if bucket with object lock can be created:_bucketName:${lockEnabledBucketName}`, (done) => {
        client.makeBucket(lockEnabledBucketName, { ObjectLocking: true }, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          isFeatureSupported = true
          if (err) {
            return done(err)
          }
          done()
        })
      })

      step(`Get lock config on a bucket:_bucketName:${lockEnabledBucketName}`, (done) => {
        if (isFeatureSupported) {
          client.getObjectLockConfig(lockEnabledBucketName, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            done()
          })
        } else {
          done()
        }
      })

      step(`Check if bucket can be deleted:_bucketName:${lockEnabledBucketName}`, (done) => {
        client.removeBucket(lockEnabledBucketName, (err) => {
          if (isFeatureSupported) {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            done()
          } else {
            done()
          }
        })
      })
    })

    describe('Object Lock support Set/Get API Tests', function () {
      const lockConfigBucketName = 'minio-js-test-lock-conf-' + uuid.v4()
      let isFeatureSupported = false
      step(`Check if bucket with object lock can be created:_bucketName:${lockConfigBucketName}`, (done) => {
        client.makeBucket(lockConfigBucketName, { ObjectLocking: true }, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          isFeatureSupported = true
          if (err) {
            return done(err)
          }
          done()
        })
      })
      step(`Update or replace lock config on a bucket:_bucketName:${lockConfigBucketName}`, (done) => {
        if (isFeatureSupported) {
          client.setObjectLockConfig(
            lockConfigBucketName,
            { mode: 'GOVERNANCE', unit: 'Years', validity: 2 },
            (err) => {
              if (err && err.code === 'NotImplemented') {
                return done()
              }
              if (err) {
                return done(err)
              }
              done()
            },
          )
        } else {
          done()
        }
      })
      step(`Get lock config on a bucket:_bucketName:${lockConfigBucketName}`, (done) => {
        if (isFeatureSupported) {
          client.getObjectLockConfig(lockConfigBucketName, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            done()
          })
        } else {
          done()
        }
      })

      step(`Set lock config on a bucket:_bucketName:${lockConfigBucketName}`, (done) => {
        if (isFeatureSupported) {
          client.setObjectLockConfig(lockConfigBucketName, {}, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            done()
          })
        } else {
          done()
        }
      })
      step(`Get and verify lock config on a bucket after reset/update:_bucketName:${lockConfigBucketName}`, (done) => {
        if (isFeatureSupported) {
          client.getObjectLockConfig(lockConfigBucketName, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            done()
          })
        } else {
          done()
        }
      })

      step(`Check if bucket can be deleted:_bucketName:${lockConfigBucketName}`, (done) => {
        client.removeBucket(lockConfigBucketName, (err) => {
          if (isFeatureSupported) {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            done()
          } else {
            done()
          }
        })
      })
    })
  })

  describe('Object retention API Tests', () => {
    // Isolate the bucket/object for easy debugging and tracking.
    // Gateway mode does not support this header.

    describe('Object retention get/set API Test', function () {
      const objRetentionBucket = 'minio-js-test-retention-' + uuid.v4()
      const retentionObjName = 'RetentionObject'
      let isFeatureSupported = false
      let versionId = null

      step(`Check if bucket with object lock can be created:_bucketName:${objRetentionBucket}`, (done) => {
        client.makeBucket(objRetentionBucket, { ObjectLocking: true }, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          isFeatureSupported = true
          if (err) {
            return done(err)
          }
          done()
        })
      })

      step(
        `putObject(bucketName, objectName, stream)_bucketName:${objRetentionBucket}, objectName:${retentionObjName}, stream:100Kib_`,
        (done) => {
          // Put two versions of the same object.
          if (isFeatureSupported) {
            client
              .putObject(objRetentionBucket, retentionObjName, readableStream(_1byte), _1byte.length, {})
              .then(() => done())
              .catch(done)
          } else {
            done()
          }
        },
      )

      step(
        `statObject(bucketName, objectName, statOpts)_bucketName:${objRetentionBucket}, objectName:${retentionObjName}`,
        (done) => {
          if (isFeatureSupported) {
            client.statObject(objRetentionBucket, retentionObjName, {}, (e, res) => {
              versionId = res.versionId
              done()
            })
          } else {
            done()
          }
        },
      )

      step(
        `putObjectRetention(bucketName, objectName, putOpts)_bucketName:${objRetentionBucket}, objectName:${retentionObjName}`,
        (done) => {
          // Put two versions of the same object.
          if (isFeatureSupported) {
            let expirationDate = new Date()
            // set expiry to start of next day.
            expirationDate.setDate(expirationDate.getDate() + 1)
            expirationDate.setUTCHours(0, 0, 0, 0) // Should be start of the day.(midnight)

            client
              .putObjectRetention(objRetentionBucket, retentionObjName, {
                governanceBypass: true,
                mode: 'GOVERNANCE',
                retainUntilDate: expirationDate.toISOString(),
                versionId: versionId,
              })
              .then(() => done())
              .catch(done)
          } else {
            done()
          }
        },
      )

      step(
        `getObjectRetention(bucketName, objectName, getOpts)_bucketName:${objRetentionBucket}, objectName:${retentionObjName}`,
        (done) => {
          if (isFeatureSupported) {
            client.getObjectRetention(objRetentionBucket, retentionObjName, { versionId: versionId }, () => {
              done()
            })
          } else {
            done()
          }
        },
      )

      step(
        `removeObject(bucketName, objectName, removeOpts)_bucketName:${objRetentionBucket}, objectName:${retentionObjName}`,
        (done) => {
          if (isFeatureSupported) {
            client.removeObject(
              objRetentionBucket,
              retentionObjName,
              { versionId: versionId, governanceBypass: true },
              () => {
                done()
              },
            )
          } else {
            done()
          }
        },
      )

      step(`removeBucket(bucketName, )_bucketName:${objRetentionBucket}`, (done) => {
        if (isFeatureSupported) {
          client.removeBucket(objRetentionBucket, () => {
            done()
          })
        } else {
          done()
        }
      })
    })
  })

  describe('Bucket Encryption Related APIs', () => {
    // Isolate the bucket/object for easy debugging and tracking.
    // this is not supported in gateway mode.
    const encBucketName = 'minio-js-test-bucket-enc-' + uuid.v4()
    before((done) => client.makeBucket(encBucketName, '', done))
    after((done) => client.removeBucket(encBucketName, done))

    const encObjName = 'datafile-100-kB'
    const encObjFileContent = Buffer.alloc(100 * 1024, 0)
    let isEncryptionSupported = false

    step(`Set Encryption on a bucket:_bucketName:${encBucketName}`, (done) => {
      // setBucketEncryption succeeds in NAS mode.
      const buckEncPromise = client.setBucketEncryption(encBucketName)
      buckEncPromise
        .then(() => {
          done()
        })
        .catch(() => {
          done()
        })
    })

    step(`Get encryption of a bucket:_bucketName:${encBucketName}`, (done) => {
      const getBucEncObj = client.getBucketEncryption(encBucketName)
      getBucEncObj
        .then(() => {
          done()
        })
        .catch((err) => {
          if (err && err.code === 'NotImplemented') {
            isEncryptionSupported = false
            return done()
          }
          if (err && err.code === 'ServerSideEncryptionConfigurationNotFoundError') {
            return done()
          }
          if (err) {
            return done(err)
          }
          done()
        })
    })

    step(
      `Put an object to check for default encryption bucket:_bucketName:${encBucketName}, _objectName:${encObjName}`,
      (done) => {
        if (isEncryptionSupported) {
          const putObjPromise = client.putObject(encBucketName, encObjName, encObjFileContent)
          putObjPromise
            .then(() => {
              done()
            })
            .catch(() => {
              done()
            })
        } else {
          done()
        }
      },
    )

    step(
      `Stat of an object to check for default encryption applied on a bucket:_bucketName:${encBucketName}, _objectName:${encObjName}`,
      (done) => {
        if (isEncryptionSupported) {
          const statObjPromise = client.statObject(encBucketName, encObjName)
          statObjPromise
            .then(() => {
              done()
            })
            .catch(() => {
              done()
            })
        } else {
          done()
        }
      },
    )

    step(
      `Stat of an object to check for default encryption applied on a bucket:_bucketName:${encBucketName}`,
      (done) => {
        if (isEncryptionSupported) {
          const getBuckEnc = client.getBucketEncryption(encBucketName)
          getBuckEnc
            .then(() => {
              done()
            })
            .catch(() => {
              done()
            })
        } else {
          done()
        }
      },
    )

    step(`Remove object on a bucket:_bucketName:${encBucketName}, _objectName:${encObjName}`, (done) => {
      if (isEncryptionSupported) {
        const removeObj = client.removeObject(encBucketName, encObjName)
        removeObj
          .then(() => {
            done()
          })
          .catch(() => {
            done()
          })
      } else {
        done()
      }
    })

    step(`Remove encryption on a bucket:_bucketName:${encBucketName}`, (done) => {
      if (isEncryptionSupported) {
        const removeObj = client.removeBucketEncryption(encBucketName)
        removeObj
          .then(() => {
            done()
          })
          .catch(() => {
            done()
          })
      } else {
        done()
      }
    })
    step(`Get encryption on a bucket:_bucketName:${encBucketName}`, (done) => {
      if (isEncryptionSupported) {
        const getBuckEnc = client.getBucketEncryption(encBucketName)
        getBuckEnc
          .then(() => {
            done()
          })
          .catch(() => {
            done()
          })
      } else {
        done()
      }
    })
  })

  describe('Bucket Replication API Tests', () => {
    // TODO - As of now, there is no api to get arn programmatically to setup replication through APIs and verify.
    // Please refer to minio server documentation and mc cli.
    // https://min.io/docs/minio/linux/administration/bucket-replication.html
    // https://min.io/docs/minio/linux/reference/minio-mc/mc-replicate-add.html
  })

  describe('Object Legal hold API Tests', () => {
    // Isolate the bucket/object for easy debugging and tracking.
    // Gateway mode does not support this header.
    let versionId = null
    describe('Object Legal hold get/set API Test', function () {
      const objLegalHoldBucketName = 'minio-js-test-legalhold-' + uuid.v4()
      const objLegalHoldObjName = 'LegalHoldObject'
      let isFeatureSupported = false

      step(`Check if bucket with object lock can be created:_bucketName:${objLegalHoldBucketName}`, (done) => {
        client.makeBucket(objLegalHoldBucketName, { ObjectLocking: true }, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          isFeatureSupported = true
          if (err) {
            return done(err)
          }
          done()
        })
      })

      step(
        `putObject(bucketName, objectName, stream)_bucketName:${objLegalHoldBucketName}, objectName:${objLegalHoldObjName}, stream:100Kib_`,
        (done) => {
          if (isFeatureSupported) {
            client
              .putObject(objLegalHoldBucketName, objLegalHoldObjName, readableStream(_1byte), _1byte.length, {})
              .then(() => done())
              .catch(done)
          } else {
            done()
          }
        },
      )

      step(
        `statObject(bucketName, objectName, statOpts)_bucketName:${objLegalHoldBucketName}, objectName:${objLegalHoldObjName}`,
        (done) => {
          if (isFeatureSupported) {
            client.statObject(objLegalHoldBucketName, objLegalHoldObjName, {}, (e, res) => {
              versionId = res.versionId
              done()
            })
          } else {
            done()
          }
        },
      )

      step(
        `setObjectLegalHold(bucketName, objectName, setOpts={})_bucketName:${objLegalHoldBucketName}, objectName:${objLegalHoldObjName}`,
        (done) => {
          if (isFeatureSupported) {
            client.setObjectLegalHold(objLegalHoldBucketName, objLegalHoldObjName, () => {
              done()
            })
          } else {
            done()
          }
        },
      )

      step(
        `setObjectLegalHold(bucketName, objectName, setOpts={})_bucketName:${objLegalHoldBucketName}, objectName:${objLegalHoldObjName}`,
        (done) => {
          if (isFeatureSupported) {
            client.setObjectLegalHold(
              objLegalHoldBucketName,
              objLegalHoldObjName,
              { status: 'ON', versionId: versionId },
              () => {
                done()
              },
            )
          } else {
            done()
          }
        },
      )

      step(
        `getObjectLegalHold(bucketName, objectName, setOpts={})_bucketName:${objLegalHoldBucketName}, objectName:${objLegalHoldObjName}`,
        (done) => {
          if (isFeatureSupported) {
            client.getObjectLegalHold(objLegalHoldBucketName, objLegalHoldObjName, () => {
              done()
            })
          } else {
            done()
          }
        },
      )

      step(
        `setObjectLegalHold(bucketName, objectName, setOpts={})_bucketName:${objLegalHoldBucketName}, objectName:${objLegalHoldObjName}`,
        (done) => {
          if (isFeatureSupported) {
            client.setObjectLegalHold(
              objLegalHoldBucketName,
              objLegalHoldObjName,
              { status: 'OFF', versionId: versionId },
              () => {
                done()
              },
            )
          } else {
            done()
          }
        },
      )

      step(
        `getObjectLegalHold(bucketName, objectName, setOpts={})_bucketName:${objLegalHoldBucketName}, objectName:${objLegalHoldObjName}`,
        (done) => {
          if (isFeatureSupported) {
            client.getObjectLegalHold(objLegalHoldBucketName, objLegalHoldObjName, { versionId: versionId }, () => {
              done()
            })
          } else {
            done()
          }
        },
      )

      step(
        `removeObject(bucketName, objectName, removeOpts)_bucketName:${objLegalHoldBucketName}, objectName:${objLegalHoldObjName}`,
        (done) => {
          if (isFeatureSupported) {
            client.removeObject(
              objLegalHoldBucketName,
              objLegalHoldObjName,
              { versionId: versionId, governanceBypass: true },
              () => {
                done()
              },
            )
          } else {
            done()
          }
        },
      )

      step(`removeBucket(bucketName, )_bucketName:${objLegalHoldBucketName}`, (done) => {
        if (isFeatureSupported) {
          client.removeBucket(objLegalHoldBucketName, () => {
            done()
          })
        } else {
          done()
        }
      })
    })
  })

  describe('Object Name special characters test without Prefix', () => {
    // Isolate the bucket/object for easy debugging and tracking.
    const bucketNameForSpCharObjects = 'minio-js-test-obj-spwpre-' + uuid.v4()
    before((done) => client.makeBucket(bucketNameForSpCharObjects, '', done))
    after((done) => client.removeBucket(bucketNameForSpCharObjects, done))

    // Reference:: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
    // Host OS compatible File name characters/ file names.

    let objectNameSpecialChars = "äöüex ®©µÄÆÐÕæŒƕƩǅ 01000000 0x40 \u0040 amȡȹɆple&0a!-_.*'()&$@=;:+,?<>.pdf"
    if (isWindowsPlatform) {
      objectNameSpecialChars = "äöüex ®©µÄÆÐÕæŒƕƩǅ 01000000 0x40 u0040 amȡȹɆple&0a!-_.'()&$@=;+,.pdf"
    }

    const objectContents = Buffer.alloc(100 * 1024, 0)

    describe('Without Prefix Test', function () {
      step(
        `putObject(bucketName, objectName, stream)_bucketName:${bucketNameForSpCharObjects}, _objectName:${objectNameSpecialChars}, stream:100Kib_`,
        (done) => {
          client
            .putObject(bucketNameForSpCharObjects, objectNameSpecialChars, objectContents)
            .then(() => {
              done()
            })
            .catch(done)
        },
      )

      step(
        `listObjects(bucketName, prefix, recursive)_bucketName:${bucketNameForSpCharObjects}, prefix:"", true`,
        (done) => {
          const listStream = client.listObjects(bucketNameForSpCharObjects, '', true)
          let listedObject = null
          listStream.on('data', function (obj) {
            listedObject = obj
          })
          listStream.on('end', () => {
            if (listedObject.name === objectNameSpecialChars) {
              done()
            } else {
              return done(new Error(`Expected object Name: ${objectNameSpecialChars}: received:${listedObject.name}`))
            }
          })
          listStream.on('error', function (e) {
            done(e)
          })
        },
      )

      step(
        `listObjectsV2(bucketName, prefix, recursive)_bucketName:${bucketNameForSpCharObjects}, prefix:"", true`,
        (done) => {
          const listStream = client.listObjectsV2(bucketNameForSpCharObjects, '', true)
          let listedObject = null
          listStream.on('data', function (obj) {
            listedObject = obj
          })
          listStream.on('end', () => {
            if (listedObject.name === objectNameSpecialChars) {
              done()
            } else {
              return done(new Error(`Expected object Name: ${objectNameSpecialChars}: received:${listedObject.name}`))
            }
          })

          listStream.on('error', function (e) {
            done(e)
          })
        },
      )
      step(
        `extensions.listObjectsV2WithMetadata(bucketName, prefix, recursive)_bucketName:${bucketNameForSpCharObjects}, prefix:"", true`,
        (done) => {
          const listStream = client.extensions.listObjectsV2WithMetadata(bucketNameForSpCharObjects, '', true)
          let listedObject = null
          listStream.on('data', function (obj) {
            listedObject = obj
          })
          listStream.on('end', () => {
            if (listedObject.name === objectNameSpecialChars) {
              done()
            } else {
              return done(new Error(`Expected object Name: ${objectNameSpecialChars}: received:${listedObject.name}`))
            }
          })

          listStream.on('error', function (e) {
            done(e)
          })
        },
      )

      step(
        `getObject(bucketName, objectName)_bucketName:${bucketNameForSpCharObjects}, _objectName:${objectNameSpecialChars}`,
        (done) => {
          client
            .getObject(bucketNameForSpCharObjects, objectNameSpecialChars)
            .then((stream) => {
              stream.on('data', function () {})
              stream.on('end', done)
            })
            .catch(done)
        },
      )

      step(
        `statObject(bucketName, objectName, cb)_bucketName:${bucketNameForSpCharObjects}, _objectName:${objectNameSpecialChars}`,
        (done) => {
          client.statObject(bucketNameForSpCharObjects, objectNameSpecialChars, (e) => {
            if (e) {
              return done(e)
            }
            done()
          })
        },
      )

      step(
        `removeObject(bucketName, objectName)_bucketName:${bucketNameForSpCharObjects}, _objectName:${objectNameSpecialChars}`,
        (done) => {
          client
            .removeObject(bucketNameForSpCharObjects, objectNameSpecialChars)
            .then(() => done())
            .catch(done)
        },
      )
    })
  })
  describe('Object Name special characters test with a Prefix', () => {
    // Isolate the bucket/object for easy debugging and tracking.
    const bucketNameForSpCharObjects = 'minio-js-test-obj-spnpre-' + uuid.v4()
    before((done) => client.makeBucket(bucketNameForSpCharObjects, '', done))
    after((done) => client.removeBucket(bucketNameForSpCharObjects, done))

    // Reference:: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
    let objectNameSpecialChars = "äöüex ®©µÄÆÐÕæŒƕƩǅ 01000000 0x40 \u0040 amȡȹɆple&0a!-_.*'()&$@=;:+,?<>.pdf"
    if (isWindowsPlatform) {
      objectNameSpecialChars = "äöüex ®©µÄÆÐÕæŒƕƩǅ 01000000 0x40 u0040 amȡȹɆple&0a!-_.'()&$@=;+,.pdf"
    }
    const prefix = 'test'
    const objectNameWithPrefixForSpecialChars = `${prefix}/${objectNameSpecialChars}`

    const objectContents = Buffer.alloc(100 * 1024, 0)

    describe('With Prefix Test', function () {
      step(
        `putObject(bucketName, objectName, stream)_bucketName:${bucketNameForSpCharObjects}, _objectName:${objectNameWithPrefixForSpecialChars}, stream:100Kib`,
        (done) => {
          client
            .putObject(bucketNameForSpCharObjects, objectNameWithPrefixForSpecialChars, objectContents)
            .then(() => {
              done()
            })
            .catch(done)
        },
      )

      step(
        `listObjects(bucketName, prefix, recursive)_bucketName:${bucketNameForSpCharObjects}, prefix:${prefix}, recursive:true`,
        (done) => {
          const listStream = client.listObjects(bucketNameForSpCharObjects, prefix, true)
          let listedObject = null
          listStream.on('data', function (obj) {
            listedObject = obj
          })
          listStream.on('end', () => {
            if (listedObject.name === objectNameWithPrefixForSpecialChars) {
              done()
            } else {
              return done(
                new Error(
                  `Expected object Name: ${objectNameWithPrefixForSpecialChars}: received:${listedObject.name}`,
                ),
              )
            }
          })
          listStream.on('error', function (e) {
            done(e)
          })
        },
      )

      step(
        `listObjectsV2(bucketName, prefix, recursive)_bucketName:${bucketNameForSpCharObjects}, prefix:${prefix}, recursive:true`,
        (done) => {
          const listStream = client.listObjectsV2(bucketNameForSpCharObjects, prefix, true)
          let listedObject = null
          listStream.on('data', function (obj) {
            listedObject = obj
          })
          listStream.on('end', () => {
            if (listedObject.name === objectNameWithPrefixForSpecialChars) {
              done()
            } else {
              return done(
                new Error(
                  `Expected object Name: ${objectNameWithPrefixForSpecialChars}: received:${listedObject.name}`,
                ),
              )
            }
          })
          listStream.on('error', function (e) {
            done(e)
          })
        },
      )

      step(
        `extensions.listObjectsV2WithMetadata(bucketName, prefix, recursive)_bucketName:${bucketNameForSpCharObjects}, prefix:${prefix}, recursive:true`,
        (done) => {
          const listStream = client.extensions.listObjectsV2WithMetadata(bucketNameForSpCharObjects, prefix, true)
          let listedObject = null
          listStream.on('data', function (obj) {
            listedObject = obj
          })
          listStream.on('end', () => {
            if (listedObject.name === objectNameWithPrefixForSpecialChars) {
              done()
            } else {
              return done(
                new Error(
                  `Expected object Name: ${objectNameWithPrefixForSpecialChars}: received:${listedObject.name}`,
                ),
              )
            }
          })
          listStream.on('error', function (e) {
            done(e)
          })
        },
      )

      step(
        `getObject(bucketName, objectName)_bucketName:${bucketNameForSpCharObjects}, _objectName_:${objectNameWithPrefixForSpecialChars}`,
        (done) => {
          client
            .getObject(bucketNameForSpCharObjects, objectNameWithPrefixForSpecialChars)
            .then((stream) => {
              stream.on('data', function () {})
              stream.on('end', done)
            })
            .catch(done)
        },
      )

      step(
        `statObject(bucketName, objectName, cb)_bucketName:${bucketNameForSpCharObjects}, _objectName:${objectNameWithPrefixForSpecialChars}`,
        (done) => {
          client.statObject(bucketNameForSpCharObjects, objectNameWithPrefixForSpecialChars, (e) => {
            if (e) {
              return done(e)
            }
            done()
          })
        },
      )

      step(
        `removeObject(bucketName, objectName)_bucketName:${bucketNameForSpCharObjects}, _objectName:${objectNameWithPrefixForSpecialChars}`,
        (done) => {
          client
            .removeObject(bucketNameForSpCharObjects, objectNameWithPrefixForSpecialChars)
            .then(() => done())
            .catch(done)
        },
      )
    })
  })

  describe('Assume Role Tests', () => {
    // Run only in local environment.
    const bucketName = 'minio-js-test-assume-role' + uuid.v4()
    before((done) => client.makeBucket(bucketName, '', done))
    after((done) => client.removeBucket(bucketName, done))

    const objName = 'datafile-100-kB'
    const objContent = Buffer.alloc(100 * 1024, 0)

    const canRunAssumeRoleTest = clientConfigParams.endPoint.includes('localhost')
    const stsEndPoint = 'http://localhost:9000'

    try {
      if (canRunAssumeRoleTest) {
        // Creates a new Client with assume role provider for testing.
        const assumeRoleProvider = new AssumeRoleProvider({
          stsEndpoint: stsEndPoint,
          accessKey: client.accessKey,
          secretKey: client.secretKey,
        })

        const aRoleConf = Object.assign({}, clientConfigParams, { credentialsProvider: assumeRoleProvider })

        const assumeRoleClient = new minio.Client(aRoleConf)
        assumeRoleClient.region = server_region

        describe('Put an Object', function () {
          step(
            `Put an object with assume role credentials:  bucket:_bucketName:${bucketName}, _objectName:${objName}`,
            (done) => {
              const putObjPromise = assumeRoleClient.putObject(bucketName, objName, objContent)
              putObjPromise
                .then(() => {
                  done()
                })
                .catch(done)
            },
          )

          step(`Remove an Object with assume role credentials:${bucketName}, _objectName:${objName}`, (done) => {
            const removeObjPromise = assumeRoleClient.removeObject(bucketName, objName)
            removeObjPromise
              .then(() => {
                done()
              })
              .catch(done)
          })
        })
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error in Assume Role API.', err)
    }
  })

  describe('Put Object Response test with multipart on an Un versioned bucket:', () => {
    const bucketToTestMultipart = 'minio-js-test-put-multiuv-' + uuid.v4()

    before((done) => client.makeBucket(bucketToTestMultipart, '', done))
    after((done) => client.removeBucket(bucketToTestMultipart, done))

    // Non multipart Test
    step(
      `putObject(bucketName, objectName, stream)_bucketName:${bucketToTestMultipart}, _objectName:${_100kbObjectName}, stream:100KB`,
      (done) => {
        const stream = readableStream(_100kb)
        client.putObject(bucketToTestMultipart, _100kbObjectName, stream, metaData, (e, res) => {
          if (e) {
            done(e)
          }
          if (res.versionId === null && res.etag) {
            done()
          } else {
            done(
              new Error(
                `Incorrect response format, expected: {versionId:null, etag:"some-etag-hash"} received:${JSON.stringify(
                  res,
                )}`,
              ),
            )
          }
        })
      },
    )
    step(
      `removeObject(bucketName, objectName, stream)_bucketName:${bucketToTestMultipart}, _objectName:${_100kbObjectName}`,
      (done) => {
        client
          .removeObject(bucketToTestMultipart, _100kbObjectName)
          .then(() => done())
          .catch(done)
      },
    )

    // Multipart Test
    step(
      `putObject(bucketName, objectName, stream)_bucketName:${bucketToTestMultipart}, _objectName:${_65mbObjectName}, stream:65MB`,
      (done) => {
        const stream = readableStream(_65mb)
        client.putObject(bucketToTestMultipart, _65mbObjectName, stream, metaData, (e, res) => {
          if (e) {
            done(e)
          }
          if (res.versionId === null && res.etag) {
            done()
          } else {
            done(
              new Error(
                `Incorrect response format, expected: {versionId:null, etag:"some-etag-hash"} received:${JSON.stringify(
                  res,
                )}`,
              ),
            )
          }
        })
      },
    )
    step(
      `removeObject(bucketName, objectName, stream)_bucketName:${bucketToTestMultipart}, _objectName:${_65mbObjectName}`,
      (done) => {
        client
          .removeObject(bucketToTestMultipart, _65mbObjectName)
          .then(() => done())
          .catch(done)
      },
    )
  })

  describe('Put Object Response test with multipart on Versioned bucket:', () => {
    const bucketToTestMultipart = 'minio-js-test-put-multiv-' + uuid.v4()
    let isVersioningSupported = false
    let versionedObjectRes = null
    let versionedMultiPartObjectRes = null

    before((done) =>
      client.makeBucket(bucketToTestMultipart, '', () => {
        client.setBucketVersioning(bucketToTestMultipart, { Status: 'Enabled' }, (err) => {
          if (err && err.code === 'NotImplemented') {
            return done()
          }
          if (err) {
            return done(err)
          }
          isVersioningSupported = true
          done()
        })
      }),
    )
    after((done) => client.removeBucket(bucketToTestMultipart, done))

    // Non multipart Test
    step(
      `putObject(bucketName, objectName, stream)_bucketName:${bucketToTestMultipart}, _objectName:${_100kbObjectName}, stream:100KB`,
      (done) => {
        if (isVersioningSupported) {
          const stream = readableStream(_100kb)
          client.putObject(bucketToTestMultipart, _100kbObjectName, stream, metaData, (e, res) => {
            if (e) {
              done(e)
            }
            if (res.versionId && res.etag) {
              versionedObjectRes = res
              done()
            } else {
              done(
                new Error(
                  `Incorrect response format, expected: {versionId:'some-version-hash', etag:"some-etag-hash"} received:${JSON.stringify(
                    res,
                  )}`,
                ),
              )
            }
          })
        } else {
          done()
        }
      },
    )
    step(
      `removeObject(bucketName, objectName, stream)_bucketName:${bucketToTestMultipart}, _objectName:${_100kbObjectName}`,
      (done) => {
        if (isVersioningSupported) {
          client
            .removeObject(bucketToTestMultipart, _100kbObjectName, { versionId: versionedObjectRes.versionId })
            .then(() => done())
            .catch(done)
        } else {
          done()
        }
      },
    )

    // Multipart Test
    step(
      `putObject(bucketName, objectName, stream)_bucketName:${bucketToTestMultipart}, _objectName:${_65mbObjectName}, stream:65MB`,
      (done) => {
        if (isVersioningSupported) {
          const stream = readableStream(_65mb)
          client.putObject(bucketToTestMultipart, _65mbObjectName, stream, metaData, (e, res) => {
            if (e) {
              done(e)
            }
            if (res.versionId && res.etag) {
              versionedMultiPartObjectRes = res
              done()
            } else {
              done(
                new Error(
                  `Incorrect response format, expected: {versionId:null, etag:"some-etag-hash"} received:${JSON.stringify(
                    res,
                  )}`,
                ),
              )
            }
          })
        } else {
          done()
        }
      },
    )
    step(
      `removeObject(bucketName, objectName, stream)_bucketName:${bucketToTestMultipart}, _objectName:${_65mbObjectName}`,
      (done) => {
        if (isVersioningSupported) {
          client
            .removeObject(bucketToTestMultipart, _65mbObjectName, { versionId: versionedMultiPartObjectRes.versionId })
            .then(() => done())
            .catch(done)
        } else {
          done()
        }
      },
    )
  })
  describe('Compose Object API Tests', () => {
    /**
     * Steps:
     * 1. Generate a 100MB file in temp dir
     * 2. Split into 26 MB parts in temp dir
     * 3. Upload parts to bucket
     * 4. Compose into a single object in the same bucket.
     * 5. Remove the file parts (Clean up)
     * 6. Remove the file itself (Clean up)
     * 7. Remove bucket. (Clean up)
     */

    var _100mbFileToBeSplitAndComposed = Buffer.alloc(100 * 1024 * 1024, 0)
    let composeObjectTestBucket = 'minio-js-test-compose-obj-' + uuid.v4()
    before((done) => client.makeBucket(composeObjectTestBucket, '', done))
    after((done) => client.removeBucket(composeObjectTestBucket, done))

    const composedObjName = '_100-mb-file-to-test-compose'
    const tmpSubDir = `${tmpDir}/compose`
    var fileToSplit = `${tmpSubDir}/${composedObjName}`
    let partFilesNamesWithPath = []
    let partObjNameList = []
    let isSplitSuccess = false
    step(`Create a local file of 100 MB and split `, (done) => {
      try {
        fs.writeFileSync(fileToSplit, _100mbFileToBeSplitAndComposed)
        // 100 MB split into 26 MB part size.
        splitFile
          .splitFileBySize(fileToSplit, 26 * 1024 * 1024)
          .then((names) => {
            partFilesNamesWithPath = names
            isSplitSuccess = true
            done()
          })
          .catch(() => {
            done()
          })
      } catch (err) {
        done()
      }
    })

    step(`Upload parts to Bucket_bucketName:${composeObjectTestBucket}, _objectName:${partObjNameList}`, (done) => {
      if (isSplitSuccess) {
        const fileSysToBucket = partFilesNamesWithPath.map((partFileName) => {
          const partObjName = partFileName.substr((tmpSubDir + '/').length)
          partObjNameList.push(partObjName)
          return client.fPutObject(composeObjectTestBucket, partObjName, partFileName, {})
        })

        Promise.all(fileSysToBucket)
          .then(() => {
            done()
          })
          .catch(done)
      } else {
        done()
      }
    })

    step(
      `composeObject(destObjConfig, sourceObjList, cb)::_bucketName:${composeObjectTestBucket}, _objectName:${composedObjName}`,
      (done) => {
        if (isSplitSuccess) {
          const sourcePartObjList = partObjNameList.map((partObjName) => {
            return new CopySourceOptions({
              Bucket: composeObjectTestBucket,
              Object: partObjName,
            })
          })

          const destObjConfig = new CopyDestinationOptions({
            Bucket: composeObjectTestBucket,
            Object: composedObjName,
          })

          client.composeObject(destObjConfig, sourcePartObjList).then((e) => {
            if (e) {
              return done(e)
            }
            done()
          })
        } else {
          done()
        }
      },
    )

    step(
      `statObject(bucketName, objectName, cb)::_bucketName:${composeObjectTestBucket}, _objectName:${composedObjName}`,
      (done) => {
        if (isSplitSuccess) {
          client.statObject(composeObjectTestBucket, composedObjName, (e) => {
            if (e) {
              return done(e)
            }
            done()
          })
        } else {
          done()
        }
      },
    )

    step(
      `Remove Object Parts from Bucket::_bucketName:${composeObjectTestBucket}, _objectNames:${partObjNameList}`,
      (done) => {
        if (isSplitSuccess) {
          const sourcePartObjList = partObjNameList.map((partObjName) => {
            return client.removeObject(composeObjectTestBucket, partObjName)
          })

          Promise.all(sourcePartObjList)
            .then(() => {
              done()
            })
            .catch(done)
        } else {
          done()
        }
      },
    )

    step(
      `Remove Composed target Object::_bucketName:${composeObjectTestBucket}, objectName:${composedObjName}`,
      (done) => {
        if (isSplitSuccess) {
          client
            .removeObject(composeObjectTestBucket, composedObjName)
            .then(() => {
              done()
            })
            .catch(done)
        } else {
          done()
        }
      },
    )

    step('Clean up temp directory part files', (done) => {
      if (isSplitSuccess) {
        removeDirAndFiles(tmpSubDir)
      }
      done()
    })
  })

  describe('Special Characters test on a prefix and an object', () => {
    // Isolate the bucket/object for easy debugging and tracking.
    const bucketNameForSpCharObjects = 'minio-js-test-obj-sppre' + uuid.v4()
    before((done) => client.makeBucket(bucketNameForSpCharObjects, '', done))
    after((done) => client.removeBucket(bucketNameForSpCharObjects, done))

    const specialCharPrefix = 'SpecialMenùäöüexPrefix/'

    let objectNameSpecialChars = "äöüex ®©µÄÆÐÕæŒƕƩǅ 01000000 0x40 \u0040 amȡȹɆple&0a!-_.*'()&$@=;:+,?<>.pdf"
    if (isWindowsPlatform) {
      objectNameSpecialChars = "äöüex ®©µÄÆÐÕæŒƕƩǅ 01000000 0x40 u0040 amȡȹɆple&0a!-_.'()&$@=;+,.pdf"
    }

    const objectNameWithPrefix = `${specialCharPrefix}${objectNameSpecialChars}`

    const objectContents = Buffer.alloc(100 * 1024, 0)

    step(
      `putObject(bucketName, objectName, stream)_bucketName:${bucketNameForSpCharObjects}, _objectName:${objectNameWithPrefix}, stream:100Kib`,
      (done) => {
        client
          .putObject(bucketNameForSpCharObjects, objectNameWithPrefix, objectContents)
          .then(() => {
            done()
          })
          .catch(done)
      },
    )

    step(
      `listObjects(bucketName, prefix, recursive)_bucketName:${bucketNameForSpCharObjects}, prefix:"", false`,
      (done) => {
        const listStream = client.listObjects(bucketNameForSpCharObjects, '', false)
        let listedObject = null
        listStream.on('data', function (obj) {
          listedObject = obj
        })
        listStream.on('end', () => {
          if (listedObject.prefix === specialCharPrefix) {
            done()
          } else {
            return done(new Error(`Expected Prefix Name: ${specialCharPrefix}: received:${listedObject.prefix}`))
          }
        })
        listStream.on('error', function (e) {
          done(e)
        })
      },
    )

    step(
      `listObjectsV2(bucketName, prefix, recursive)_bucketName:${bucketNameForSpCharObjects}, prefix:"", false`,
      (done) => {
        const listStream = client.listObjectsV2(bucketNameForSpCharObjects, '', false)
        let listedObject = null
        listStream.on('data', function (obj) {
          listedObject = obj
        })
        listStream.on('end', () => {
          // verify that the prefix special characters are handled
          if (listedObject.prefix === specialCharPrefix) {
            done()
          } else {
            return done(new Error(`Expected object Name: ${specialCharPrefix}: received:${listedObject.prefix}`))
          }
        })

        listStream.on('error', function (e) {
          done(e)
        })
      },
    )

    step(
      `extensions.listObjectsV2WithMetadata(bucketName, prefix, recursive)_bucketName:${bucketNameForSpCharObjects}, prefix:"", false`,
      (done) => {
        const listStream = client.extensions.listObjectsV2WithMetadata(bucketNameForSpCharObjects, '', false)
        let listedObject = null
        listStream.on('data', function (obj) {
          listedObject = obj
        })
        listStream.on('end', () => {
          if (listedObject.prefix === specialCharPrefix) {
            done()
          } else {
            return done(new Error(`Expected object Name: ${specialCharPrefix}: received:${listedObject.prefix}`))
          }
        })

        listStream.on('error', function (e) {
          done(e)
        })
      },
    )

    step(
      `getObject(bucketName, objectName)_bucketName:${bucketNameForSpCharObjects}, _objectName:${objectNameWithPrefix}`,
      (done) => {
        client
          .getObject(bucketNameForSpCharObjects, objectNameWithPrefix)
          .then((stream) => {
            stream.on('data', function () {})
            stream.on('end', done)
          })
          .catch(done)
      },
    )

    step(
      `statObject(bucketName, objectName, cb)_bucketName:${bucketNameForSpCharObjects}, _objectName:${objectNameWithPrefix}`,
      (done) => {
        client.statObject(bucketNameForSpCharObjects, objectNameWithPrefix, (e) => {
          if (e) {
            return done(e)
          }
          done()
        })
      },
    )
    step(
      `removeObject(bucketName, objectName)_bucketName:${objectNameWithPrefix}, _objectName:${objectNameWithPrefix}`,
      (done) => {
        client
          .removeObject(bucketNameForSpCharObjects, objectNameWithPrefix)
          .then(() => done())
          .catch(done)
      },
    )
  })
  describe('Test listIncompleteUploads (Multipart listing) with special characters', () => {
    const specialCharPrefix = 'SpecialMenùäöüexPrefix/'
    const objectNameSpecialChars = 'äöüex.pdf'
    const spObjWithPrefix = `${specialCharPrefix}${objectNameSpecialChars}`
    const spBucketName = 'minio-js-test-lin-sppre' + uuid.v4()

    before((done) => client.makeBucket(spBucketName, '', done))
    after((done) => client.removeBucket(spBucketName, done))

    step(
      `initiateNewMultipartUpload(bucketName, objectName, metaData, cb)_bucketName:${spBucketName}, objectName:${spObjWithPrefix}, metaData:${metaData}`,
      (done) => {
        client.initiateNewMultipartUpload(spBucketName, spObjWithPrefix, metaData, done)
      },
    )

    step(
      `listIncompleteUploads(bucketName, prefix, recursive)_bucketName:${spBucketName}, prefix:${spObjWithPrefix}, recursive: true_`,
      function (done) {
        // MinIO's ListIncompleteUploads returns an empty list, so skip this on non-AWS.
        let hostSkipList = ['s3.amazonaws.com']
        if (!hostSkipList.includes(client.host)) {
          done()
          return
        }

        var found = false
        client
          .listIncompleteUploads(spBucketName, spObjWithPrefix, true)
          .on('error', (e) => done(e))
          .on('data', (data) => {
            if (data.key === spObjWithPrefix) {
              found = true
            }
          })
          .on('end', () => {
            if (found) {
              return done()
            }
            done(new Error(`${spObjWithPrefix} not found during listIncompleteUploads`))
          })
      },
    )

    step(
      `listIncompleteUploads(bucketName, prefix, recursive)_bucketName:${spBucketName}, recursive: true_`,
      function (done) {
        // MinIO's ListIncompleteUploads returns an empty list, so skip this on non-AWS.
        let hostSkipList = ['s3.amazonaws.com']
        if (!hostSkipList.includes(client.host)) {
          done()
          return
        }

        var found = false
        client
          .listIncompleteUploads(spBucketName, '', false)
          .on('error', (e) => done(e))
          .on('data', (data) => {
            // check the prefix
            if (data.prefix === specialCharPrefix) {
              found = true
            }
          })
          .on('end', () => {
            if (found) {
              return done()
            }
            done(new Error(`${specialCharPrefix} not found during listIncompleteUploads`))
          })
      },
    )
    step(
      `removeIncompleteUploads(bucketName, prefix)_bucketName:${spBucketName}, prefix:${spObjWithPrefix}_`,
      (done) => {
        client.removeIncompleteUpload(spBucketName, spObjWithPrefix).then(done).catch(done)
      },
    )
  })
  describe('Select Object content API Test', function () {
    const selObjContentBucket = 'minio-js-test-sel-object-' + uuid.v4()
    const selObject = 'SelectObjectContent'
    // Isolate the bucket/object for easy debugging and tracking.
    before((done) => client.makeBucket(selObjContentBucket, '', done))
    after((done) => client.removeBucket(selObjContentBucket, done))

    step(
      `putObject(bucketName, objectName, stream)_bucketName:${selObjContentBucket}, objectName:${selObject}, stream:csv`,
      (done) => {
        // Save a CSV file so that we can query later to test the results.
        client
          .putObject(
            selObjContentBucket,
            selObject,
            'Name,PhoneNumber,City,Occupation\n' +
              'Sam,(949) 123-45567,Irvine,Solutions Architect\n' +
              'Vinod,(949) 123-4556,Los Angeles,Solutions Architect\n' +
              'Jeff,(949) 123-45567,Seattle,AWS Evangelist\n' +
              'Jane,(949) 123-45567,Chicago,Developer\n' +
              'Sean,(949) 123-45567,Chicago,Developer\n' +
              'Mary,(949) 123-45567,Chicago,Developer\n' +
              'Kate,(949) 123-45567,Chicago,Developer',
            {},
          )
          .then(() => {
            done()
          })
          .catch(done)
      },
    )

    step(
      `selectObjectContent(bucketName, objectName, selectOpts)_bucketName:${selObjContentBucket}, objectName:${selObject}`,
      (done) => {
        const selectOpts = {
          expression: 'SELECT * FROM s3object s where s."Name" = \'Jane\'',
          expressionType: 'SQL',
          inputSerialization: {
            CSV: { FileHeaderInfo: 'Use', RecordDelimiter: '\n', FieldDelimiter: ',' },
            CompressionType: 'NONE',
          },
          outputSerialization: { CSV: { RecordDelimiter: '\n', FieldDelimiter: ',' } },
          requestProgress: { Enabled: true },
        }

        client
          .selectObjectContent(selObjContentBucket, selObject, selectOpts)
          .then((result) => {
            // verify the select query result string.
            if (result.getRecords().toString() === 'Jane,(949) 123-45567,Chicago,Developer\n') {
              // \n for csv line ending.
              done()
            } else {
              return done(
                new Error(
                  `Expected Result did not match received:${result
                    .getRecords()
                    .toString()} expected:"Jane,(949) 123-45567,Chicago,Developer\n"`,
                ),
              )
            }
          })
          .catch(done)
      },
    )

    step(`Remove Object post select of content:_bucketName:${selObjContentBucket},objectName:${selObject}`, (done) => {
      client
        .removeObject(selObjContentBucket, selObject)
        .then(() => done())
        .catch(done)
    })
  })

  describe('Force Deletion of objects with versions', function () {
    // Isolate the bucket/object for easy debugging and tracking.
    const fdWithVerBucket = 'minio-js-fd-version-' + uuid.v4()
    const fdObjectName = 'datafile-100-kB'
    const fdObject = dataDir ? fs.readFileSync(dataDir + '/' + fdObjectName) : Buffer.alloc(100 * 1024, 0)

    before((done) => client.makeBucket(fdWithVerBucket, '', done))
    after((done) => client.removeBucket(fdWithVerBucket, done))

    describe('Test for force removal of multiple versions', function () {
      let isVersioningSupported = false
      const objVersionList = []
      step(
        `setBucketVersioning(bucketName, versionConfig):_bucketName:${fdWithVerBucket},versionConfig:{Status:"Enabled"} `,
        (done) => {
          client.setBucketVersioning(fdWithVerBucket, { Status: 'Enabled' }, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            isVersioningSupported = true
            done()
          })
        },
      )

      step(
        `putObject(bucketName, objectName, stream)_bucketName:${fdWithVerBucket}, objectName:${fdObjectName}, stream:100Kib_`,
        (done) => {
          if (isVersioningSupported) {
            client
              .putObject(fdWithVerBucket, fdObjectName, fdObject)
              .then(() => done())
              .catch(done)
          } else {
            done()
          }
        },
      )
      // Put two versions of the same object.
      step(
        `putObject(bucketName, objectName, stream)_bucketName:${fdWithVerBucket}, objectName:${fdObjectName}, stream:100Kib_`,
        (done) => {
          if (isVersioningSupported) {
            client
              .putObject(fdWithVerBucket, fdObjectName, fdObject)
              .then(() => done())
              .catch(done)
          } else {
            done()
          }
        },
      )

      step(
        `removeObject(bucketName, objectList, removeOpts)_bucketName:${fdWithVerBucket}_Remove ${objVersionList.length} objects`,
        (done) => {
          if (isVersioningSupported) {
            client.removeObject(fdWithVerBucket, fdObjectName, { forceDelete: true }, () => {
              done()
            })
          } else {
            done()
          }
        },
      )

      step(
        `listObjects(bucketName, prefix, recursive)_bucketName:${fdWithVerBucket}, prefix: '', recursive:true_`,
        (done) => {
          if (isVersioningSupported) {
            client
              .listObjects(fdWithVerBucket, '', true, { IncludeVersion: true })
              .on('error', done)
              .on('end', () => {
                if (_.isEqual(0, objVersionList.length)) {
                  return done()
                }
                return done(new Error(`listObjects lists ${objVersionList.length} objects, expected 0`))
              })
              .on('data', (data) => {
                objVersionList.push(data)
              })
          } else {
            done()
          }
        },
      )
    })
  })

  describe('Force Deletion of prefix with versions', function () {
    // Isolate the bucket/object for easy debugging and tracking.
    const fdPrefixBucketName = 'minio-js-fd-version-' + uuid.v4()
    const fdPrefixObjName = 'my-prefix/datafile-100-kB'
    const fdPrefixObject = dataDir ? fs.readFileSync(dataDir + '/datafile-100-kB') : Buffer.alloc(100 * 1024, 0)

    before((done) => client.makeBucket(fdPrefixBucketName, '', done))
    after((done) => client.removeBucket(fdPrefixBucketName, done))

    describe('Test for removal of multiple versions', function () {
      let isVersioningSupported = false
      const objVersionList = []
      step(
        `setBucketVersioning(bucketName, versionConfig):_bucketName:${fdPrefixBucketName},versionConfig:{Status:"Enabled"} `,
        (done) => {
          client.setBucketVersioning(fdPrefixBucketName, { Status: 'Enabled' }, (err) => {
            if (err && err.code === 'NotImplemented') {
              return done()
            }
            if (err) {
              return done(err)
            }
            isVersioningSupported = true
            done()
          })
        },
      )

      step(
        `putObject(bucketName, objectName, stream)_bucketName:${fdPrefixBucketName}, objectName:${fdPrefixObjName}, stream:100Kib_`,
        (done) => {
          if (isVersioningSupported) {
            client
              .putObject(fdPrefixBucketName, fdPrefixObjName, fdPrefixObject)
              .then(() => done())
              .catch(done)
          } else {
            done()
          }
        },
      )
      // Put two versions of the same object.
      step(
        `putObject(bucketName, objectName, stream)_bucketName:${fdPrefixBucketName}, objectName:${fdPrefixObjName}, stream:100Kib_`,
        (done) => {
          if (isVersioningSupported) {
            client
              .putObject(fdPrefixBucketName, fdPrefixObjName, fdPrefixObject)
              .then(() => done())
              .catch(done)
          } else {
            done()
          }
        },
      )

      step(
        `removeObject(bucketName, objectList, removeOpts)_bucketName:${fdPrefixBucketName}_Remove ${objVersionList.length} objects`,
        (done) => {
          if (isVersioningSupported) {
            client.removeObject(fdPrefixBucketName, 'my-prefix/', { forceDelete: true }, () => {
              done()
            })
          } else {
            done()
          }
        },
      )

      step(
        `listObjects(bucketName, prefix, recursive)_bucketName:${fdPrefixBucketName}, prefix: '', recursive:true_`,
        (done) => {
          if (isVersioningSupported) {
            client
              .listObjects(fdPrefixBucketName, '/my-prefix', true, { IncludeVersion: true })
              .on('error', done)
              .on('end', () => {
                if (_.isEqual(0, objVersionList.length)) {
                  return done()
                }
                return done(new Error(`listObjects lists ${objVersionList.length} objects, expected 0`))
              })
              .on('data', (data) => {
                objVersionList.push(data)
              })
          } else {
            done()
          }
        },
      )
    })
  })

  describe('Force Deletion of objects without versions', function () {
    // Isolate the bucket/object for easy debugging and tracking.
    const versionedBucketName = 'minio-js-fd-nv-' + uuid.v4()
    const versioned_100kbObjectName = 'datafile-100-kB'
    const versioned_100kb_Object = dataDir
      ? fs.readFileSync(dataDir + '/' + versioned_100kbObjectName)
      : Buffer.alloc(100 * 1024, 0)

    before((done) => client.makeBucket(versionedBucketName, '', done))
    after((done) => client.removeBucket(versionedBucketName, done))

    describe('Test force removal of an object', function () {
      step(
        `putObject(bucketName, objectName, stream)_bucketName:${versionedBucketName}, objectName:${versioned_100kbObjectName}, stream:100Kib_`,
        (done) => {
          client
            .putObject(versionedBucketName, versioned_100kbObjectName, versioned_100kb_Object)
            .then(() => done())
            .catch(done)
        },
      )

      step(
        `removeObject(bucketName, objectList, removeOpts)_bucketName:${versionedBucketName}_Remove 1 object`,
        (done) => {
          client.removeObject(versionedBucketName, versioned_100kbObjectName, { forceDelete: true }, () => {
            done()
          })
        },
      )

      step(
        `listObjects(bucketName, prefix, recursive)_bucketName:${versionedBucketName}, prefix: '', recursive:true_`,
        (done) => {
          let objVersionList = []
          client
            .listObjects(versionedBucketName, '', true, {})
            .on('error', done)
            .on('end', () => {
              if (_.isEqual(0, objVersionList.length)) {
                return done()
              }
              return done(new Error(`listObjects lists ${objVersionList.length} objects, expected 0`))
            })
            .on('data', (data) => {
              objVersionList.push(data)
            })
        },
      )
    })
  })

  describe('Force Deletion of prefix', function () {
    // Isolate the bucket/object for easy debugging and tracking.
    const fdPrefixBucket = 'minio-js-fd-nv-' + uuid.v4()
    const fdObjectName = 'my-prefix/datafile-100-kB'
    const fdObject = dataDir ? fs.readFileSync(dataDir + '/datafile-100-kB') : Buffer.alloc(100 * 1024, 0)

    before((done) => client.makeBucket(fdPrefixBucket, '', done))
    after((done) => client.removeBucket(fdPrefixBucket, done))

    describe('Test force removal of a prefix', function () {
      step(
        `putObject(bucketName, objectName, stream)_bucketName:${fdPrefixBucket}, objectName:${fdObjectName}, stream:100Kib_`,
        (done) => {
          client
            .putObject(fdPrefixBucket, fdObjectName, fdObject)
            .then(() => done())
            .catch(done)
        },
      )

      step(`removeObject(bucketName, objectList, removeOpts)_bucketName:${fdPrefixBucket}_Remove 1 object`, (done) => {
        client.removeObject(fdPrefixBucket, '/my-prefix', { forceDelete: true }, () => {
          done()
        })
      })

      step(
        `listObjects(bucketName, prefix, recursive)_bucketName:${fdPrefixBucket}, prefix: 'my-prefix', recursive:true_`,
        (done) => {
          let objList = []
          client
            .listObjects(fdPrefixBucket, 'my-prefix', true, {})
            .on('error', done)
            .on('end', () => {
              if (_.isEqual(0, objList.length)) {
                return done()
              }
              return done(new Error(`listObjects lists ${objList.length} objects, expected 0`))
            })
            .on('data', (data) => {
              objList.push(data)
            })
        },
      )
    })
  })
})
