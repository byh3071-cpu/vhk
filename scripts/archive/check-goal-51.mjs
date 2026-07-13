#!/usr/bin/env node
// scripts/check-goal-51.mjs — 자동 생성 (vhk goal sync).
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역에 추가.
// sync 재실행해도 기존 파일은 덮어쓰지 않습니다 (idempotent).
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
    // maxBuffer 상향: 큰 빌드/테스트 로그(>1MB)에서 성공해도 ENOBUFS 거짓실패 방지.
    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return true
  } catch (e) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')
    if (out.trim()) console.log(out.split('\n').slice(-25).join('\n'))
    return false
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 51 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 51] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
const must = (cond, label) => { console.log((cond ? '    ✓ ' : '    ✗ ') + label); if (!cond) pass = false }

// typecheck (스크립트 우선, 없으면 tsc --noEmit)
if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))
else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))
if (scripts.lint) gate('lint', run(pm, ['run', 'lint']))
if (!skipDeep) {
  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))
  else if (scripts.test && /vitest/.test(scripts.test)) gate('test', run(pm, ['run', 'test', '--', '--run']))
  else if (scripts.test) gate('test', run(pm, ['run', 'test']))
  if (scripts.build) gate('build', run(pm, ['run', 'build']))
}

// ─── goal 51 고유 검증 (직접 추가) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) logger 가 출력 SoT 로 승격 — 단일 sink + 조용한 모드 + 확장 프린터.
const logger = read('src/utils/logger.ts')
must(!!logger, 'src/utils/logger.ts 존재')
must(/export function setSink\b/.test(logger ?? ''), 'logger.setSink (테스트 캡처/리다이렉트 단일 지점)')
must(/export function setQuiet\b/.test(logger ?? ''), 'logger.setQuiet (조용한 모드 단일 지점)')
must(/\bplain:\s*\(/.test(logger ?? '') && /\blist:\s*\(/.test(logger ?? ''), 'logger 렌더 프린터 확장(plain/list 등)')
must(/function emit\(/.test(logger ?? '') && /sink\(/.test(logger ?? ''), 'logger 가 단일 sink 경유(emit→sink)')

// 2) 신규 raw console.log(chalk…) 차단 가드 존재 + 동작(리포트 모드 exit 0).
must(existsSync('scripts/check-no-raw-output.mjs'), 'scripts/check-no-raw-output.mjs 가드 존재')
const guardScript = read('scripts/check-no-raw-output.mjs') ?? ''
must(/vhk-allow-raw-output/.test(guardScript), '가드에 allow 주석 경로(vhk-allow-raw-output)')
must(guardScript.includes('console') && guardScript.includes('chalk'), '가드가 console.log(chalk…) 패턴 대상')
must(run('node', ['scripts/check-no-raw-output.mjs', 'src']), 'check-no-raw-output 리포트 실행(exit 0)')

if (pass) { console.log('✅ goal 51 gate passes'); process.exit(0) }
console.log('❌ goal 51 gate failed'); process.exit(1)
