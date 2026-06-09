#!/usr/bin/env node
// scripts/check-goal-59.mjs — Goal 59: secure 불완전 신호(scan-incomplete-signal).
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역.
//
// Env: VHK_GATES_SKIP_DEEP=1  → test + build 스킵 (빠른 typecheck-only 패스)

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])
function run(cmd, args) {
  let bin = cmd, argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) {
    // Windows: .cmd shim 직접 spawn 은 Node CVE-2024-27980 으로 EINVAL → cmd.exe 래핑.
    bin = 'cmd.exe'; argv = ['/d', '/s', '/c', cmd + '.cmd', ...args]
  }
  try {
    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return true
  } catch (e) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')
    if (out.trim()) console.log(out.split('\n').slice(-25).join('\n'))
    return false
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 59 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 59] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
const must = (cond, label) => { console.log((cond ? '    ✓ ' : '    ✗ ') + label); if (!cond) pass = false }

if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))
else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))
if (scripts.lint) gate('lint', run(pm, ['run', 'lint']))
if (!skipDeep) {
  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))
  else if (scripts.test && /vitest/.test(scripts.test)) gate('test', run(pm, ['run', 'test', '--', '--run']))
  else if (scripts.test) gate('test', run(pm, ['run', 'test']))
  if (scripts.build) gate('build', run(pm, ['run', 'build']))
}

// ─── goal 59 고유 검증 (secure 불완전 신호 — 거짓 PASS 차단) ───────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) scan-files: 512KB 초과 파일을 호출부에 신호하는 optional 콜백.
const scanFiles = read('src/lib/scan-files.ts') ?? ''
must(/onSkippedLargeFile\?\s*:/.test(scanFiles), 'scan-files.ts: walkProjectFiles 에 onSkippedLargeFile 콜백 param')
must(/onSkippedLargeFile\?\.\(/.test(scanFiles), 'scan-files.ts: 512KB 초과 시 onSkippedLargeFile 호출')

// 2) scan-secrets: 불완전 사유(truncationReasons) 3종 노출.
const scanSecrets = read('src/lib/scan-secrets.ts') ?? ''
must(/truncationReasons\s*:\s*string\[\]/.test(scanSecrets), 'scan-secrets.ts: ProjectSecretScan.truncationReasons:string[]')
for (const reason of ['findings-cap', 'line-length', 'file-size']) {
  must(scanSecrets.includes(`'${reason}'`), `scan-secrets.ts: 사유 '${reason}' 기록`)
}
// 사유로 조기 return 하면 후속 파일 미스캔(false-negative) → 별도 cappedFindings 로 분리했는지.
must(/cappedFindings/.test(scanSecrets), 'scan-secrets.ts: findings-cap 조기종료를 불완전 사유와 분리(cappedFindings)')

// 3) verify: GateRunStatus 'warn' + runSecureGate truncated→warn + aggregateStatus warn→WARN.
const verify = read('src/commands/verify.ts') ?? ''
must(/'skip'\s*\|\s*'warn'/.test(verify), "verify.ts: GateRunStatus 에 'warn' 추가")
must(/status:\s*'warn'/.test(verify), 'verify.ts: runSecureGate 가 truncated 시 status warn 반환')
must(/g\.status === 'skip' \|\| g\.status === 'warn'/.test(verify), 'verify.ts: aggregateStatus 가 warn→WARN')
must(/scan-incomplete/.test(verify), 'verify.ts: warn detail 에 scan-incomplete 사유 노출')

// 4) verify-report: GATE_STATUS exhaustive Record 에 warn 키(렌더 누락 방지).
const verifyReport = read('src/commands/verify-report.ts') ?? ''
must(/warn:\s*\{/.test(verifyReport), 'verify-report.ts: GATE_STATUS 에 warn 키')

// 5) 회귀 테스트 존재 + 핵심 단언 포함.
must(existsSync('tests/scan-files.test.ts'), 'tests/scan-files.test.ts 존재')
const scanSecretsTest = read('tests/scan-secrets.test.ts') ?? ''
must(/truncationReasons/.test(scanSecretsTest), 'tests/scan-secrets.test.ts: truncationReasons 회귀 단언')
const verifyTest = read('tests/verify.test.ts') ?? ''
must(/scan-incomplete/.test(verifyTest) || /'warn'/.test(verifyTest), 'tests/verify.test.ts: secure warn 회귀 단언')

if (pass) { console.log('✅ goal 59 gate passes'); process.exit(0) }
console.log('❌ goal 59 gate failed'); process.exit(1)
