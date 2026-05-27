#!/usr/bin/env node
// scripts/check-meta.mjs — cross-platform _meta gate (Windows/macOS/Linux).
// Mirrors goals/_meta.md M.1 / M.2 / M.3.
//
// Env:
//   VHK_GATES_SKIP_DEEP=1   skip M.2 (tests) + M.3 (build) for fast iter
//   VHK_GATES_SKIP_META=1   skip the entire suite (CI runs steps explicitly)

import { existsSync } from 'node:fs'
import { safeExec, ensureNoHardStop } from './_lib.mjs'

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

if (pass) {
  console.log('✅ _meta gates pass')
  process.exit(0)
}
console.log('❌ _meta gates failed')
process.exit(1)
