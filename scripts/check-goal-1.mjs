#!/usr/bin/env node
// scripts/check-goal-1.mjs — Goal 1 (vhk goal 명령어) gate. Cross-platform.

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { safeExec, ensureNoHardStop } from './_lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
process.chdir(ROOT)

ensureNoHardStop('goal 1')

console.log('[goal 1] running _meta gate first')
const meta = safeExec('node', [join(ROOT, 'scripts', 'check-meta.mjs')])
if (meta.out) console.log(meta.out)
if (!meta.ok) {
  console.log('    ✗ _meta failed — fix cross-cutting gates first')
  process.exit(1)
}

let pass = true
const goalFile = 'src/commands/goal.ts'
const libFile = 'src/lib/goal-frontmatter.ts'

// ─── G1.1 goal.ts 5 exports ───────────────────────────────────────────────
console.log('[G1.1] src/commands/goal.ts exports init/list/next/check/done')
if (!existsSync(goalFile)) {
  console.log(`    ✗ ${goalFile} missing`)
  pass = false
} else {
  const src = readFileSync(goalFile, 'utf-8')
  const missing = []
  for (const fn of ['goalInit', 'goalList', 'goalNext', 'goalCheck', 'goalDone']) {
    if (!new RegExp(`^export (async )?function ${fn}\\b`, 'm').test(src)) missing.push(fn)
  }
  if (missing.length === 0) console.log('    ✓ pass (5 functions exported)')
  else {
    console.log(`    ✗ missing exports: ${missing.join(', ')}`)
    pass = false
  }
}

// ─── G1.2 frontmatter parser + tests ─────────────────────────────────────
console.log('[G1.2] src/lib/goal-frontmatter.ts + tests present')
const need = []
if (!existsSync(libFile)) need.push(libFile)
for (const tf of ['tests/goal.test.ts', 'tests/goal-frontmatter.test.ts']) {
  if (!existsSync(tf)) need.push(tf)
}
if (need.length === 0) console.log('    ✓ pass (lib + 2 test files)')
else {
  console.log(`    ✗ missing: ${need.join(', ')}`)
  pass = false
}

// ─── G1.3 goal list smoke ─────────────────────────────────────────────────
console.log('[G1.3] node dist/index.js goal list 가 id 0/1/2 출력')
if (!existsSync('dist/index.js')) {
  console.log('    ⊘ skipped (dist/ 없음)')
} else {
  const r = safeExec('node', ['dist/index.js', 'goal', 'list'])
  const out = r.out || ''
  if (out.includes('[ 0]') && out.includes('[ 1]') && out.includes('[ 2]')) {
    console.log('    ✓ pass (id 0/1/2 모두 출력)')
  } else {
    console.log('    ✗ fail — goal list 출력에 id 0/1/2 누락')
    pass = false
  }
}

// ─── G1.4 check --goal 옵션 ──────────────────────────────────────────────
console.log('[G1.4] src/index.ts 에 check --goal 옵션 등록')
const idxSrc = existsSync('src/index.ts') ? readFileSync('src/index.ts', 'utf-8') : ''
if (/option\(['"]--goal/.test(idxSrc)) {
  console.log('    ✓ pass')
} else {
  console.log('    ✗ fail — check --goal 옵션 미등록')
  pass = false
}

// ─── G1.5 문서 반영 ──────────────────────────────────────────────────────
console.log('[G1.5] COMMANDS.md + README.md 에 goal 명령 반영')
const docFail = []
if (existsSync('COMMANDS.md') && !readFileSync('COMMANDS.md', 'utf-8').includes('vhk goal')) {
  docFail.push('COMMANDS.md')
}
if (existsSync('README.md') && !readFileSync('README.md', 'utf-8').includes('vhk goal')) {
  docFail.push('README.md')
}
if (docFail.length === 0) console.log('    ✓ pass')
else {
  console.log(`    ✗ fail — 문서 누락: ${docFail.join(', ')}`)
  pass = false
}

if (pass) {
  console.log('✅ goal 1 gate passes')
  process.exit(0)
}
console.log('❌ goal 1 gate failed')
process.exit(1)
