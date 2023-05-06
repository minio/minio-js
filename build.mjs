/* eslint-disable no-console */
import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { promisify } from 'node:util'

import * as babel from '@babel/core'
import * as fsWalk from '@nodelib/fs.walk'

const pkg = JSON.parse(fs.readFileSync('package.json').toString())

/**
 * @param {'esm'|'cjs'} module
 */
function options(module) {
  const plugins = [
    [
      '@babel/plugin-transform-modules-commonjs',
      {
        importInterop: 'node',
      },
    ],
    ['@upleveled/remove-node-prefix'],
    [
      'replace-import-extension',
      {
        extMapping: {
          '.ts': extMap[module],
          '.js': extMap[module],
        },
      },
    ],
    [
      'babel-plugin-transform-replace-expressions',
      {
        replace: {
          'process.env.MINIO_JS_PACKAGE_VERSION': JSON.stringify(pkg.version),
        },
      },
    ],
  ]

  return {
    sourceMaps: 'inline',
    assumptions: {
      constantSuper: true,
      noIncompleteNsImportDetection: true,
      constantReexports: true,
    },
    plugins: module === 'esm' ? plugins.splice(1) : plugins,
    presets: [['@babel/env', { targets: { node: '8' }, modules: false }], ['@babel/preset-typescript']],
  }
}

const extMap = { cjs: '.js', esm: '.mjs' }

async function buildFiles({ files, module, outDir }) {
  console.log(`building for ${module}`)
  await promisify(exec)(`npx tsc --outDir ${outDir}`, { stdio: 'inherit' })

  const opt = options(module)
  for (const file of files) {
    if (!file.dirent.isFile()) {
      continue
    }

    const outFilePath = path.join(outDir, path.relative('src/', file.path))
    const outDirPath = path.dirname(outFilePath)

    await fsp.mkdir(outDirPath, { recursive: true })
    const distCodePath = outFilePath.replace(/\.[tj]s$/g, extMap[module])

    if (file.path.endsWith('.d.ts')) {
      await fsp.copyFile(file.path, outFilePath)
      continue
    }

    try {
      const result = await babel.transformAsync(await fsp.readFile(file.path, 'utf-8'), {
        filename: file.path,
        ...opt,
      })

      await fsp.writeFile(distCodePath, result.code)
    } catch (e) {
      console.error(`failed to transpile ${file.path}`)
      throw e
    }
  }
}

async function main() {
  await fsp.rm('dist', { recursive: true, force: true })

  const entries = fsWalk.walkSync('src/')

  await Promise.all([
    buildFiles({ files: entries, module: 'cjs', outDir: './dist/main/' }),
    buildFiles({ files: entries, module: 'esm', outDir: './dist/esm/' }),
  ])

  for (const file of fsWalk.walkSync('dist/esm/')) {
    if (file.dirent.isDirectory()) {
      continue
    }

    if (!file.path.endsWith('.d.ts')) {
      continue
    }

    const fileContent = fs.readFileSync(file.path).toString()

    const mts = babel.transformSync(fileContent, {
      filename: file.path,
      sourceMaps: true,
      plugins: [['@babel/plugin-syntax-typescript'], ['replace-import-extension', { extMapping: { '.ts': '.mjs' } }]],
    })

    await fsp.unlink(file.path)

    const outFilePath = file.path.slice(0, file.path.length - '.d.ts'.length) + '.d.mts'
    await fsp.writeFile(outFilePath, mts.code)
  }
}

await main()
