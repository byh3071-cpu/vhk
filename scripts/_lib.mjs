// 게이트 스크립트(.mjs) 공통 헬퍼. Windows / macOS / Linux 모두에서 동작.
// src/lib/exec.ts 의 safeExecFile 패턴과 동일하지만 ts-build 없이 Node 직실행 가능.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

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

/**
 * "직접 실행일 때만 main" 가드 — 테스트가 import 해도 부수효과 0 (governance 게이트 공통).
 * Windows 8.3 단축경로·심링크로 argv[1]과 import.meta.url 이 어긋나면 게이트가 조용히
 * no-op 되는 함정(레포 교훈: realpathSync.native) → realpath 양쪽 정규화로 비교.
 */
export function isMainModule(importMetaUrl) {
  const argv = process.argv[1]
  if (!argv) return false
  try {
    if (pathToFileURL(argv).href === importMetaUrl) return true
    const a = realpathSync.native(argv)
    const b = realpathSync.native(fileURLToPath(importMetaUrl))
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
  } catch {
    return false
  }
}

/** git 이 비ASCII 경로를 감싸는 따옴표 제거 (core.quotepath=false 와 이중 방어). */
export function unquoteGitPath(p) {
  return p.replace(/^"|"$/g, '')
}

/** porcelain 라인 → 경로. XY+공백 3칸 고정 오프셋(라인 trim 금지!), 리네임은 new 쪽. */
export function porcelainPath(line) {
  const body = line.slice(3)
  const arrow = body.indexOf(' -> ')
  return unquoteGitPath(arrow >= 0 ? body.slice(arrow + 4) : body)
}

/**
 * flat `key: value` frontmatter 파싱(BOM 허용·`#` 주석 스킵·값은 string 보존). 블록 없으면 null.
 * src/lib/goal-frontmatter.ts parseSimpleYaml 과 동형 — .mjs 가 TS(번들 dist)를 import 못해 복제
 * (이 파일이 .mjs 쪽 단일본 — 게이트들은 여기서 import 할 것, 재복제 금지).
 */
export function parseFlatFrontmatter(md) {
  const text = md.charCodeAt(0) === 0xfeff ? md.slice(1) : md
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return null
  const out = {}
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return out
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
