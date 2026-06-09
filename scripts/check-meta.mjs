#!/usr/bin/env node
// scripts/check-meta.mjs — cross-platform _meta gate (Windows/macOS/Linux).
// Mirrors goals/_meta.md M.1 / M.2 / M.3 / M.4.
//
// Env:
//   VHK_GATES_SKIP_DEEP=1   skip M.2 (tests) + M.3 (build) for fast iter
//   VHK_GATES_SKIP_META=1   skip the entire suite (CI runs steps explicitly)

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { safeExec, ensureNoHardStop, findCompletedStubGates } from './_lib.mjs'

// repo root 고정 — M.4 가 goals/·scripts/ 를 상대경로로 읽으므로 cwd 비의존(check-goal-1.mjs 패턴).
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))

if (process.env.VHK_GATES_SKIP_META === '1') {
  console.log('[meta] skipped (VHK_GATES_SKIP_META=1)')
  process.exit(0)
}

ensureNoHardStop('_meta')

let pass = true
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'

// ─── M.1 tsc ──────────────────────────────────────────────────────────────
console.log('[M.1] tsc --noEmit')
const tsc = safeExec('pnpm', ['exec', 'tsc', '--noEmit'])
if (tsc.ok) {
  console.log('    ✓ pass')
} else {
  console.log('    ✗ fail')
  if (tsc.out) console.log(tsc.out.split('\n').slice(-30).join('\n'))
  pass = false
}

// ─── M.2 vitest ───────────────────────────────────────────────────────────
console.log('[M.2] pnpm test:run')
if (skipDeep) {
  console.log('    ⊘ skipped (VHK_GATES_SKIP_DEEP=1)')
} else {
  const t = safeExec('pnpm', ['test:run'])
  if (t.ok) {
    console.log('    ✓ pass')
  } else {
    console.log('    ✗ fail')
    if (t.out) console.log(t.out.split('\n').slice(-30).join('\n'))
    pass = false
  }
}

// ─── M.3 tsup build ───────────────────────────────────────────────────────
console.log('[M.3] pnpm build')
if (skipDeep) {
  console.log('    ⊘ skipped (VHK_GATES_SKIP_DEEP=1)')
} else {
  const b = safeExec('pnpm', ['build'])
  if (!b.ok) {
    console.log('    ✗ fail')
    if (b.out) console.log(b.out.split('\n').slice(-20).join('\n'))
    pass = false
  } else if (!existsSync('dist/index.js') || !existsSync('dist/mcp/index.js')) {
    console.log('    ✗ fail — dist artifacts missing')
    pass = false
  } else {
    console.log('    ✓ pass')
  }
}

// ─── M.4 완료-스텁 게이트(Goal 60) ──────────────────────────────────────────
// status=DONE/IN_PROGRESS 인데 게이트가 미싱 or 빈 스캐폴드 = 헛통과 위험. 정적분석이라 항상 실행.
console.log('[M.4] 완료 goal 게이트 비스텁 검증')
const stubs = findCompletedStubGates('goals', 'scripts')
if (stubs.length === 0) {
  console.log('    ✓ pass')
} else {
  console.log(`    ✗ fail — 완료 표시인데 게이트 미싱/스텁인 goal ${stubs.length}건:`)
  for (const s of stubs) console.log(`        - goal ${s.id} (${s.status}): ${s.reason}`)
  pass = false
}

if (pass) {
  console.log('✅ _meta gates pass')
  process.exit(0)
}
console.log('❌ _meta gates failed')
process.exit(1)
