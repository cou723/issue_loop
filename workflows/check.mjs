#!/usr/bin/env node
// dynamic workflow スクリプトの静的チェック。
//
// ランタイムは実行時に構文チェックのみ行い、グローバル未定義や構文エラーは
// 事前に検証できない（workflows/README.md 参照）。このスクリプトは
// トップレベル return を async 関数でラップした一時ファイルを生成し、
// tsc --checkJs にかけることでその隙間を埋める。
//
// 使い方: node workflows/check.mjs workflows/iteration.js

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const target = process.argv[2]

if (!target) {
  console.error('使い方: node workflows/check.mjs <workflowスクリプトへのパス>')
  process.exit(1)
}

const src = readFileSync(target, 'utf8')

// `export const meta = {...}` はトップレベルのまま残し、以降の本体
// （トップレベル return を含む）だけを async 関数でラップする。
function splitMeta(source) {
  const start = source.indexOf('export const meta')
  if (start === -1) return { meta: '', body: source }
  const braceStart = source.indexOf('{', start)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  const metaEnd = i + 1
  return { meta: source.slice(0, metaEnd) + ';\n', body: source.slice(metaEnd) }
}

const { meta, body } = splitMeta(src)
const wrapped = `${meta}\n;(async function __workflowBody() {\n${body}\n})()\n`

const outDir = path.join(dir, '.check-tmp')
mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, path.basename(target))
writeFileSync(outFile, wrapped)

try {
  execFileSync(
    path.join(dir, 'node_modules', '.bin', 'tsc'),
    [
      '--allowJs',
      '--checkJs',
      '--noEmit',
      '--target', 'esnext',
      '--module', 'esnext',
      '--moduleResolution', 'bundler',
      outFile,
      path.join(dir, 'global.d.ts'),
    ],
    { stdio: 'inherit' },
  )
  console.log(`OK: ${target} に静的エラーは見つかりませんでした`)
} catch (e) {
  process.exit(e.status ?? 1)
}
