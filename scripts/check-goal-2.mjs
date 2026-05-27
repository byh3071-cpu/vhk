#!/usr/bin/env node
// scripts/check-goal-2.mjs — Goal 2 (자율 루프) gate. Cross-platform.

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { safeExec, ensureNoHardStop } from './_lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
process.chdir(ROOT)

ensureNoHardStop('goal 2')

console.log('[goal 2] running _meta gate first')
const meta = safeExec('node', [join(ROOT, 'scripts', 'check-meta.mjs')])
if (meta.out) console.log(meta.out)
if (!meta.ok) {
  console.log('    ✗ _meta failed — fix cross-cutting gates first')
  process.exit(1)
}

let pass = true
const agentFile = 'src/commands/agent.ts'
const libFile = 'src/lib/state-files.ts'

// ─── G2.1 agent.ts exports ───────────────────────────────────────────────
console.log('[G2.1] src/commands/agent.ts exports blocker / learn / resume')
if (!existsSync(agentFile)) {
  console.log(`    ✗ ${agentFile} missing`)
  pass = false
} else {
  const src = readFileSync(agentFile, 'utf-8')
  const missing = []
  for (const fn of ['blocker', 'learn', 'resume']) {
    if (!new RegExp(`^export (async )?function ${fn}\\b`, 'm').test(src)) missing.push(fn)
  }
  if (missing.length === 0) console.log('    ✓ pass (3 functions exported)')
  else {
    console.log(`    ✗ missing exports: ${missing.join(', ')}`)
    pass = false
  }
}

// ─── G2.2 lib + tests ────────────────────────────────────────────────────
console.log('[G2.2] src/lib/state-files.ts + 관련 테스트 존재')
const need = []
if (!existsSync(libFile)) need.push(libFile)
for (const tf of [
  'tests/state-files.test.ts',
  'tests/agent.test.ts',
  'tests/context-loop.test.ts',
]) {
  if (!existsSync(tf)) need.push(tf)
}
if (need.length === 0) console.log('    ✓ pass (lib + 3 tests)')
else {
  console.log(`    ✗ missing: ${need.join(', ')}`)
  pass = false
}

// ─── G2.3 context 확장 ───────────────────────────────────────────────────
console.log('[G2.3] src/commands/context.ts 가 Active Goal + Recent Learnings 출력')
const ctx = existsSync('src/commands/context.ts')
  ? readFileSync('src/commands/context.ts', 'utf-8')
  : ''
if (ctx.includes('Active Goal') && ctx.includes('Recent Learnings')) {
  console.log('    ✓ pass')
} else {
  console.log('    ✗ fail — context.ts 에 두 섹션 키워드 미존재')
  pass = false
}

// ─── G2.4 CLI 등록 + --confirm ──────────────────────────────────────────
console.log('[G2.4] src/index.ts 에 blocker/learn/resume 등록 + --confirm 옵션')
const idx = existsSync('src/index.ts') ? readFileSync('src/index.ts', 'utf-8') : ''
const want = []
if (!/\.command\(['"]blocker /.test(idx)) want.push('blocker cmd')
if (!/\.command\(['"]learn /.test(idx)) want.push('learn cmd')
if (!/\.command\(['"]resume['"]/.test(idx)) want.push('resume cmd')
if (!/option\(['"]--confirm['"]/.test(idx)) want.push('--confirm option')
if (want.length === 0) console.log('    ✓ pass')
else {
  console.log(`    ✗ fail — missing: ${want.join(', ')}`)
  pass = false
}

// ─── G2.5 AGENTS.md ──────────────────────────────────────────────────────
console.log('[G2.5] AGENTS.md 작성 + Loop Protocol 섹션')
if (!existsSync('AGENTS.md')) {
  console.log('    ✗ AGENTS.md missing')
  pass = false
} else if (!readFileSync('AGENTS.md', 'utf-8').includes('Loop Protocol')) {
  console.log('    ✗ AGENTS.md 에 Loop Protocol 섹션 없음')
  pass = false
} else {
  console.log('    ✓ pass')
}

if (pass) {
  console.log('✅ goal 2 gate passes')
  process.exit(0)
}
console.log('❌ goal 2 gate failed')
process.exit(1)
