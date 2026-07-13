#!/usr/bin/env node
// scripts/check-goal-0.mjs — Goal 0 (MCP full coverage) gate. Cross-platform.
// Mirrors goals/0-mcp-full-coverage.md.

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { safeExec, ensureNoHardStop } from '../_lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
process.chdir(ROOT)

ensureNoHardStop('goal 0')

// ─── _meta 먼저 ───────────────────────────────────────────────────────────
console.log('[goal 0] running _meta gate first')
const meta = safeExec('node', [join(ROOT, 'scripts', 'check-meta.mjs')])
if (meta.out) console.log(meta.out)
if (!meta.ok) {
  console.log('    ✗ _meta failed — fix cross-cutting gates first')
  process.exit(1)
}

let pass = true
const serverFile = 'src/mcp/server.ts'
if (!existsSync(serverFile)) {
  console.log(`    ✗ ${serverFile} missing`)
  process.exit(1)
}
const serverSrc = readFileSync(serverFile, 'utf-8')

// ─── G0.1 registerTool count ──────────────────────────────────────────────
console.log('[G0.1] registerTool count >= 24')
const toolCount = (serverSrc.match(/registerTool\(/g) || []).length
if (toolCount >= 24) {
  console.log(`    ✓ pass (${toolCount} tools registered)`)
} else {
  console.log(`    ✗ fail (found ${toolCount}, need >= 24)`)
  pass = false
}

// ─── G0.2 inquirer import ─────────────────────────────────────────────────
console.log('[G0.2] server.ts does not import inquirer')
if (/from\s+['"]inquirer['"]/.test(serverSrc)) {
  console.log(`    ✗ fail — inquirer import found in ${serverFile}`)
  pass = false
} else {
  console.log('    ✓ pass')
}

// ─── G0.3 execSync ────────────────────────────────────────────────────────
console.log('[G0.3] server.ts does not use execSync')
if (/\bexecSync\b/.test(serverSrc)) {
  console.log('    ✗ fail — execSync found (use safeExecFile)')
  pass = false
} else {
  console.log('    ✓ pass')
}

if (pass) {
  console.log('✅ goal 0 gate passes')
  process.exit(0)
}
console.log('❌ goal 0 gate failed')
process.exit(1)
