/**
 * RFC 0051 — 세션 변경에서 "미기록 의사결정/에러" 후보를 감지하는 순수 모듈.
 * 기존에 recap.ts 안에만 있던 감지 로직을 단일 SoT 로 추출 →
 * recap(대화형 생성)·work handoff(프롬프트 주입)·향후 MCP 가 공유한다.
 * fs/Date 부수효과 0 (테스트 가능).
 */
import type { SessionDiff, RecentCommit } from './git.js'
import { detectAdrCandidates, type AdrCandidate } from './adr.js'

/** 버그·오류 해결 커밋 감지 키워드 (recap.ts:191 에서 이전). */
const TROUBLESHOOTING_KEYWORDS = /fix|bug|error|crash|hotfix|patch|revert|트러블|에러|버그|수정|핫픽스/i

export interface TroubleshootingCandidate {
  hash: string
  message: string
}

export interface DocCandidates {
  adr: AdrCandidate[]
  troubleshooting: TroubleshootingCandidate[]
}

/** 커밋 메시지가 트러블슈팅 키워드에 매칭되는 것만 후보로. */
export function detectTroubleshootingCommits(commits: RecentCommit[]): TroubleshootingCandidate[] {
  return commits
    .filter(c => TROUBLESHOOTING_KEYWORDS.test(c.message))
    .map(c => ({ hash: c.hash, message: c.message }))
}

/** 변경 파일(ADR 룰) + 커밋(트러블슈팅 키워드)에서 미기록 문서 후보를 모은다. */
export function detectDocCandidates(diff: SessionDiff, commits: RecentCommit[]): DocCandidates {
  return {
    adr: detectAdrCandidates(diff),
    troubleshooting: detectTroubleshootingCommits(commits),
  }
}

/**
 * 후보를 핸드오프 프롬프트에 끼울 텍스트 줄로 변환.
 * 후보가 0건이면 빈 배열 → 호출부가 섹션을 통째로 생략한다.
 * 자문형: "감지했으니 해당하면 기록" — 강제 생성 아님(과안정화 경계).
 */
export function formatDocCandidatesForPrompt(c: DocCandidates): string[] {
  if (c.adr.length === 0 && c.troubleshooting.length === 0) return []

  const lines: string[] = ['', '[📋 미기록 의사결정/에러 후보 — 자동 감지]']

  if (c.adr.length > 0) {
    lines.push('- ADR 후보 (의사결정 기록 → docs/adr/ 검토):')
    for (const a of c.adr) lines.push(`  • ${a.title}: ${a.context}`)
  }
  if (c.troubleshooting.length > 0) {
    lines.push('- 트러블슈팅 후보 (해결 기록 → docs/troubleshooting/ 검토):')
    for (const t of c.troubleshooting.slice(0, 10)) lines.push(`  • ${t.hash.slice(0, 7)} ${t.message}`)
  }
  lines.push('→ 해당하면 정리 중 docs/adr·docs/troubleshooting 에 지금 기록하세요(아니면 생략).')

  return lines
}
