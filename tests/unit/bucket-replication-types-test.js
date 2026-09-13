import { strict as assert } from 'node:assert'
import * as path from 'node:path'

import ts from 'typescript'

describe('bucket replication return types', () => {
  it('returns promises from Client and TypedClient calls', function () {
    this.timeout(20000)

    const root = process.cwd()
    const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
    assert.equal(config.error, undefined)
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, {
      noEmit: true,
      emitDeclarationOnly: false,
    })
    assert.deepEqual(parsed.errors, [])

    // Compile actual calls: ReturnType alone reads the last overload and misses
    // an earlier void overload that TypeScript selects at the call site.
    const fileName = path.join(root, 'src/bucket-replication-type-test.ts')
    const source = `
      import type { Client, ReplicationConfig, ReplicationConfigOpts } from './minio.ts'
      import type { TypedClient } from './internal/client.ts'

      declare const client: Client
      declare const typedClient: TypedClient
      declare const config: ReplicationConfigOpts

      const setResult: Promise<void> = client.setBucketReplication('bucket', config)
      const getResult: Promise<ReplicationConfig> = client.getBucketReplication('bucket')
      const typedSetResult: Promise<void> = typedClient.setBucketReplication('bucket', config)
      const typedGetResult: Promise<ReplicationConfig> = typedClient.getBucketReplication('bucket')
    `
    const host = ts.createCompilerHost(parsed.options)
    const getSourceFile = host.getSourceFile.bind(host)
    host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
      path.resolve(name) === fileName
        ? ts.createSourceFile(name, source, languageVersion, true)
        : getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile)

    const program = ts.createProgram([fileName], parsed.options, host)
    const diagnostics = ts.getPreEmitDiagnostics(program)
    assert.equal(
      diagnostics.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
      }),
    )
  })
})
