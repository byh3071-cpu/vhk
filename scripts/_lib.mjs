// 게이트 스크립트(.mjs) 공통 헬퍼. Windows / macOS / Linux 모두에서 동작.
// src/lib/exec.ts 의 safeExecFile 패턴과 동일하지만 ts-build 없이 Node 직실행 가능.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SHIM_BINS = new Set(['pnpm', 'npm', 'npx', 'yarn'])

function resolveCmd(cmd, args) {
  if (process.platform === 'win32' && SHIM_BINS.has(cmd)) {
    // Windows: .cmd shim 직접 호출은 Node 20.12+ CVE-2024-27980 으로 spawnSync EINVAL.
    // cmd.exe /d /s /c 래핑해서 shell:false 유지하면서 동작.
    return { bin: 'cmd.exe', argv: ['/d', '/s', '/c', `${cmd}.cmd`, ...args] }
  }
  return { bin: cmd, argv: args }
}

export function safeExec(cmd, args) {
  const { bin, argv } = resolveCmd(cmd, args)
  try {
    const out = execFileSync(bin, argv, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString()
    return { ok: true, out: out.trim() }
  } catch (err) {
    const stdout = err?.stdout ? err.stdout.toString() : ''
    const msg = err?.message ?? String(err)
    return { ok: false, err: msg, out: stdout.trim() }
  }
}

export function hardStopActive() {
  return existsSync('.vhk/HARD_STOP')
}

export function ensureNoHardStop(goalLabel) {
  if (hardStopActive()) {
    console.log(`🛑 .vhk/HARD_STOP detected — refusing to run ${goalLabel} gate.`)
    process.exit(1)
  }
}

// ─── Goal 60: 메타게이트 — 완료 표시된 goal 의 빈/스텁 게이트 검출 ───────────────
// "헛통과 DONE" 방지: status=DONE 인데 게이트가 미싱 또는 빈 스캐폴드면
// check 가 가짜 통과한다. check-meta.mjs M.4 가 이 함수로 검출 → FAIL.
// IN_PROGRESS 는 제외(완료 주장 아님·진행 중 스텁 게이트 정상 — 머지 발견으로 완화).
// 게이트사이드 단일 소스(.mjs) — check-meta 는 node 직실행이라 TS(src/lib) import 불가.
// 개념상 src/lib/goal-drift.ts 의 드리프트 게이트(goal 43)와 역방향 짝.

/**
 * 게이트가 `vhk goal sync` 스캐폴드 그대로(고유 검증 0)인가.
 * 시그니처 = 마커 `고유 검증 (직접 추가)` 가 있고, 그 아래 닫는 `if (pass)` 전까지
 * 비주석 실행코드가 0. 마커가 없으면 false — goal 0/1/2 같은 구버전 진짜 게이트(수동 if/
 * _lib.mjs 기반, must() 미사용)를 스텁으로 오탐하지 않기 위함.
 */
export function isStubGate(content) {
  const m = /고유 검증 \(직접 추가\)/.exec(content)
  if (!m) return false // 스캐폴드 마커 없음 → 구버전/커스텀 진짜 게이트
  const lines = content.slice(m.index).split(/\r?\n/).slice(1) // 마커 라인 이후
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (/^if\s*\(\s*pass\s*\)/.test(line)) return true // 닫는 블록 도달 = 사이에 코드 없음 → 스텁
    return false // 마커와 닫는 블록 사이 실제 코드 → 채워진 게이트
  }
  return true // 닫는 블록도 없고 전부 주석/빈줄(비정상) → 보수적으로 스텁
}

/** goal 카드 frontmatter 에서 id(숫자)·status 만 최소 파싱. id 없으면 null(=_meta.md 등 스킵). */
export function parseGoalMeta(md) {
  const text = md.charCodeAt(0) === 0xfeff ? md.slice(1) : md // BOM 제거
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const block = fm ? fm[1] : text
  const idM = /^id:[ \t]*(\d+)[ \t]*$/m.exec(block)
  if (!idM) return null
  const stM = /^status:[ \t]*([A-Z_]+)[ \t]*$/m.exec(block)
  return { id: Number(idM[1]), status: stM ? stM[1] : 'NOT_STARTED' }
}

/**
 * goals/ ↔ scripts/ 대조: status=DONE 인데 게이트가 미싱 or 스텁인 goal(헛통과 DONE).
 * NOT_STARTED(미구현)·IN_PROGRESS(진행 중·완료 주장 아님)·BLOCKED 는 제외. 순수(fs 읽기만), id 오름차순.
 */
export function findCompletedStubGates(goalsDir, scriptsDir) {
  const out = []
  let files
  try {
    files = readdirSync(goalsDir)
  } catch {
    return out
  }
  for (const f of files) {
    if (!f.endsWith('.md')) continue
    let md
    try {
      md = readFileSync(join(goalsDir, f), 'utf-8')
    } catch {
      continue
    }
    const meta = parseGoalMeta(md)
    if (!meta) continue
    if (meta.status !== 'DONE') continue // DONE-only: IN_PROGRESS 는 진행 중이라 스텁 게이트 정상(완화)
    const gate = join(scriptsDir, `check-goal-${meta.id}.mjs`)
    if (!existsSync(gate)) {
      out.push({ id: meta.id, status: meta.status, reason: '게이트 파일 없음(미싱)' })
      continue
    }
    let gc
    try {
      gc = readFileSync(gate, 'utf-8')
    } catch {
      out.push({ id: meta.id, status: meta.status, reason: '게이트 읽기 실패' })
      continue
    }
    if (isStubGate(gc)) {
      out.push({ id: meta.id, status: meta.status, reason: '빈 스캐폴드 스텁(고유 검증 없음)' })
    }
  }
  out.sort((a, b) => a.id - b.id)
  return out
}
