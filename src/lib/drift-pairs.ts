// RFC 0062 — 문서-실측 드리프트 자동감지 (warn 모드, 차단 0).
// "선언 ↔ 실측" 쌍의 단일 등록부. 원칙(§6): 오탐 = 신뢰 사망 — 보수적 패턴(명시 마커·헤더
// 형식)만 검사하고, 애매하면 검사하지 않는다. 대상 파일 부재 = 검사 부적용(사용자 레포 호환).
// fail 승격은 warn 실측(오탐률) 후 사람이 판정 — measure-first.
import fs from 'node:fs'
import path from 'node:path'
import { readJsonFile } from './read-json.js'

export type DriftSeries = 'numeric' | 'crossref' | 'state'

export interface DriftFinding {
  series: DriftSeries
  file: string
  message: string
}

export interface DriftCheckOptions {
  /** MCP 실등록 도구 수(호출부 주입 — lib 이 mcp/server 를 직접 import 하지 않게). */
  mcpToolCount?: number
}

function readIfExists(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf-8')
  } catch {
    return null
  }
}

// ── A 수치: 버전·MCP 수 ↔ package.json 실측 ─────────────────────────────────

// 보수적 마커만: README 의 굵은 버전(**vX.Y.Z**) · CLAUDE.md LIVE 의 `**버전:** vX.Y.Z` 줄 ·
// "MCP N tools" 문구. **하나라도 현재값과 일치하면 통과** — 릴리즈 이력 속 과거 굵은 표기가
// 먼저 나오는 레이아웃에서 first-match 가 오탐 내던 결함(적대검증 중대-2) 회피. 표기가 전부
// 구버전일 때만 stale 판정.
const BOLD_VERSION = /\*\*v(\d+\.\d+\.\d+)\*\*/g
const CLAUDE_VERSION_LINE = /\*\*버전:\*\*\s*v(\d+\.\d+\.\d+)/g
const MCP_TOOLS = /MCP\s+(\d+)\s+tools/g
// MCP 수 검사는 vhk 자기 레포 한정(scope 'self') — vhk 의 내부 카운트를 사용자 레포 문서의
// "MCP N tools"(그들 자신의 서버 설명)에 들이대면 확정 오탐(적대검증 중대-1).
const VHK_PKG_NAME = '@byh3071/vhk'

/** 패턴의 모든 매치값 수집(정규식은 g 플래그 필수). */
function allMatches(content: string, pattern: RegExp): string[] {
  return [...content.matchAll(pattern)].map((m) => m[1])
}

function checkNumeric(cwd: string, opts: DriftCheckOptions): DriftFinding[] {
  const findings: DriftFinding[] = []
  let version: string | undefined
  let pkgName: string | undefined
  try {
    const pkg: { version?: string; name?: string } = readJsonFile(path.join(cwd, 'package.json'))
    version = pkg.version
    pkgName = pkg.name
  } catch {
    return findings // package.json 부재/손상 — 여기서 진단할 일 아님(오탐 방지 우선)
  }
  if (!version) return findings
  const mcpApplies = opts.mcpToolCount !== undefined && pkgName === VHK_PKG_NAME

  const targets: Array<{ rel: string; pattern: RegExp; label: string }> = [
    { rel: 'README.md', pattern: BOLD_VERSION, label: '굵은 버전 표기' },
    { rel: 'CLAUDE.md', pattern: CLAUDE_VERSION_LINE, label: 'LIVE 버전 줄' },
  ]
  for (const t of targets) {
    const content = readIfExists(path.join(cwd, t.rel))
    if (content === null) continue
    const versions = allMatches(content, t.pattern)
    if (versions.length > 0 && !versions.includes(version)) {
      findings.push({
        series: 'numeric',
        file: t.rel,
        message: `${t.label} ${versions.map((v) => `v${v}`).join('·')} 중 package.json v${version} 와 일치 없음`,
      })
    }
    if (mcpApplies) {
      const counts = allMatches(content, MCP_TOOLS)
      if (counts.length > 0 && !counts.some((c) => Number(c) === opts.mcpToolCount)) {
        findings.push({
          series: 'numeric',
          file: t.rel,
          message: `MCP tools 표기(${counts.join('·')}) 중 실등록 ${opts.mcpToolCount} 와 일치 없음`,
        })
      }
    }
  }
  return findings
}

// ── B 상호참조: RFC 헤더 상태 ↔ 타 문서의 지칭 ──────────────────────────────

const RFC_HEADER_STATUS = /^>\s*상태:\s*([^\n]+)/m
const ARCHIVED_WORD = /archiv|supersed|폐기/i
// 괄호형 지칭만: "RFC 0055(Proof Protocol, archived)" — 첫 라이브 실측에서 근접 패턴(40자)이
// "0056·0057이 archived로 지칭"(0056 은 지칭 '주체')을 대상으로 오독하는 오탐 2건을 냄 →
// §6 원칙(오탐=신뢰 사망, 애매하면 검사 안 함)대로 괄호 안 상태 표기 형태로 한정.
const REF_ARCHIVED = /\b(0\d{3})\s*\(([^)\n]{0,60}?)(archived|superseded|폐기)/gi

function checkCrossref(cwd: string): DriftFinding[] {
  const findings: DriftFinding[] = []
  const rfcDir = path.join(cwd, 'docs', 'rfc')
  let files: string[]
  try {
    files = fs.readdirSync(rfcDir).filter((f) => /^\d{4}-.*\.md$/.test(f))
  } catch {
    return findings
  }

  const statusByNum = new Map<string, string>()
  const contentByFile = new Map<string, string>()
  for (const f of files) {
    const content = readIfExists(path.join(rfcDir, f))
    if (content === null) continue
    contentByFile.set(f, content)
    const status = RFC_HEADER_STATUS.exec(content)?.[1]
    if (status) statusByNum.set(f.slice(0, 4), status)
  }

  for (const [f, content] of contentByFile) {
    const selfNum = f.slice(0, 4)
    for (const m of content.matchAll(REF_ARCHIVED)) {
      const refNum = m[1]
      if (refNum === selfNum) continue
      const refStatus = statusByNum.get(refNum)
      if (refStatus !== undefined && !ARCHIVED_WORD.test(refStatus)) {
        findings.push({
          series: 'crossref',
          file: `docs/rfc/${f}`,
          message: `RFC ${refNum} 를 "${m[3]}" 로 지칭하는데 ${refNum} 헤더 상태는 "${refStatus.trim()}"`,
        })
      }
    }
  }
  return findings
}

// ── C 상태 정합: "블로커 없음" 선언 ↔ blockers.md 활성 항목 ──────────────────

// 두 실존 '선언형'만(보수적 — 적대검증 경미-3: 산문 "블로커 판단 근거 없음" 류 오탐 방지):
// ①CLAUDE LIVE 형 `**블로커:** 없음` ②섹션형 "## 블로커" 바로 다음 불릿 "- 없음"
// (구 next-task — 2026-07-13 실사고가 정확히 이 형태).
const NO_BLOCKER_CLAIM = /\*\*블로커:?\*\*\s*없음|^#{1,4}\s*블로커\s*\r?\n\s*-\s*없음/m

function hasActiveBlockers(cwd: string): boolean | null {
  const content = readIfExists(path.join(cwd, 'docs', 'state', 'blockers.md'))
  if (content === null) return null
  return content
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith('- [') && !line.includes('~~'))
}

function checkState(cwd: string): DriftFinding[] {
  const findings: DriftFinding[] = []
  const active = hasActiveBlockers(cwd)
  if (active !== true) return findings

  for (const rel of [path.join('docs', 'state', 'next-task.md'), 'CLAUDE.md']) {
    const content = readIfExists(path.join(cwd, rel))
    if (content === null) continue
    if (NO_BLOCKER_CLAIM.test(content)) {
      findings.push({
        series: 'state',
        file: rel.replace(/\\/g, '/'),
        message: '"블로커 없음" 선언 ↔ blockers.md 에 비취소선 활성 항목 존재',
      })
    }
  }
  return findings
}

/** RFC 0062 진입점 — 3계열 전부 실행(대상 파일 없으면 각 검사 스스로 건너뜀). */
export function runDocDriftChecks(cwd: string, opts: DriftCheckOptions = {}): DriftFinding[] {
  return [...checkNumeric(cwd, opts), ...checkCrossref(cwd), ...checkState(cwd)]
}
