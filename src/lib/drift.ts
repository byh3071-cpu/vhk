import fs from 'node:fs'
import path from 'node:path'
import { parseRulesMd, deriveProjectName, SYNC_TARGETS } from '../commands/sync.js'
import { gitOut } from './git-repo.js'

/**
 * 드리프트 = sync 원본(RULES.md)과 생성 파일이 조용히 어긋난 상태, 또는 context.md 가
 * 코드보다 낡은 상태. 전부 **읽기 전용 감지** — 자동 수정 안 함.
 */

/**
 * 비교용 정규화 — CRLF→LF + 끝 공백/빈줄 제거.
 * `.gitattributes` 없고 core.autocrlf=true 인 환경에서 디스크 파일이 CRLF 로 체크아웃되어
 * LF 재생성본과 매번 어긋나는 **거짓 드리프트**를 막는다. (줄 내용은 안 건드림.)
 */
export function normalizeForCompare(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n')
}

export type RuleDriftStatus = 'drifted' | 'ok' | 'missing'
export interface RuleDriftResult {
  path: string
  status: RuleDriftStatus
}

/**
 * 규칙 드리프트 점검 — RULES.md 에서 **재생성한 기대값** vs 디스크 파일 비교.
 * 다르면(수동수정·RULES변경·vhk업그레이드 무엇이든) 'drifted' = "다시 sync 필요".
 * RULES.md 없으면 점검 불가(checked=false). 기대값을 박지 않고 매번 재생성 = 하드코딩 아님.
 */
export function checkRuleDrift(rootDir: string): { checked: boolean; results: RuleDriftResult[] } {
  const rulesPath = path.join(rootDir, 'RULES.md')
  if (!fs.existsSync(rulesPath)) return { checked: false, results: [] }

  const rulesContent = fs.readFileSync(rulesPath, 'utf-8')
  const sections = parseRulesMd(rulesContent)
  const projectName = deriveProjectName(rulesContent)

  const results: RuleDriftResult[] = []
  for (const target of SYNC_TARGETS) {
    const fullPath = path.join(rootDir, target.path)
    if (!fs.existsSync(fullPath)) {
      results.push({ path: target.path, status: 'missing' })
      continue
    }
    const expected = normalizeForCompare(target.generate(sections, projectName))
    const actual = normalizeForCompare(fs.readFileSync(fullPath, 'utf-8'))
    results.push({ path: target.path, status: expected === actual ? 'ok' : 'drifted' })
  }
  return { checked: true, results }
}

/** context.md 푸터에 박는 git 마커 키. context.ts(쓰기)·drift(읽기) 공유 상수. */
export const CONTEXT_GIT_MARKER = 'vhk-context-git'
const CONTEXT_PATH = '.vhk/context.md'

/** context.md 본문에서 생성 시점 git sha 추출 (없으면 null) — 순수, 테스트용. */
export function extractContextSha(content: string): string | null {
  const m = content.match(new RegExp(`${CONTEXT_GIT_MARKER}:\\s*([0-9a-f]{7,40})`))
  return m ? m[1] : null
}

export interface ContextDriftResult {
  checked: boolean
  stale: boolean
  generatedSha?: string
  currentSha?: string
}

/**
 * 맥락 드리프트 점검 — context.md 생성 시점 sha vs 현재 HEAD.
 * context.md 없음 / sha 마커 없음(옛 파일) / git 아님 → 점검 불가(checked=false).
 */
export function checkContextDrift(rootDir: string): ContextDriftResult {
  const ctxPath = path.join(rootDir, CONTEXT_PATH)
  if (!fs.existsSync(ctxPath)) return { checked: false, stale: false }

  const generatedSha = extractContextSha(fs.readFileSync(ctxPath, 'utf-8'))
  if (!generatedSha) return { checked: false, stale: false }

  let currentSha: string
  try {
    currentSha = gitOut(['rev-parse', 'HEAD'], rootDir).trim()
  } catch {
    return { checked: false, stale: false }
  }
  if (!currentSha) return { checked: false, stale: false }

  // 짧은 sha 허용 — 한쪽이 다른 쪽의 접두면 같은 커밋.
  const stale = !(currentSha.startsWith(generatedSha) || generatedSha.startsWith(currentSha))
  return { checked: true, stale, generatedSha, currentSha }
}
