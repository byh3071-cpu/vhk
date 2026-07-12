import { existsSync } from 'node:fs'
import path from 'node:path'

// RFC 0060 T3: init 자동 sync 후 "다 준비됐나"를 디스크 실측(읽기검증)으로 보고한다.
// "썼다"고 믿지 않고 실제 파일 존재를 확인 — 거짓완료(RFC 0056) 금지. 실무/조립설명서 톤.

// sync.ts SYNC_TARGETS(7) + CLAUDE.md + RULES.md 와 동기. 여기서 하드코딩하는 이유:
// commands/sync.js 를 import 하면 sync 를 vi.mock 하는 테스트(start·init-other-type)에서
// SYNC_TARGETS export 가 사라져 collectInstallReceipt 가 터진다. 규칙 파일 경로는 GA 안정이라
// 하드코딩 무방 — SYNC_TARGETS 변경 시 이 목록도 갱신(install-receipt 테스트가 개수 고정).
const RULE_TARGETS = [
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
  '.agents/rules/vhk-rules.md',
  'AGENTS.md',
  'GEMINI.md',
  '.clinerules/vhk-rules.md',
  'CLAUDE.md',
  'RULES.md',
]

const RECORD_DIRS = ['docs/adr', 'docs/rfc', 'docs/patterns', 'docs/log', 'docs/troubleshooting']

export interface InstallReceipt {
  ruleTargets: string[]
  rulesPresent: string[]
  rulesMissing: string[]
  recordDirsPresent: number
  recordDirsTotal: number
  interviewPending: boolean
}

/** rootDir 의 규칙 파일·기록 폴더·인터뷰 대기 상태를 디스크에서 실측한다(부수효과 0). */
export function collectInstallReceipt(rootDir: string): InstallReceipt {
  const ruleTargets = RULE_TARGETS
  const rulesPresent: string[] = []
  const rulesMissing: string[] = []
  for (const rel of ruleTargets) {
    if (existsSync(path.join(rootDir, rel))) rulesPresent.push(rel)
    else rulesMissing.push(rel)
  }
  const recordDirsPresent = RECORD_DIRS.filter((d) => existsSync(path.join(rootDir, d))).length
  const interviewPending =
    existsSync(path.join(rootDir, '.vhk', 'NEEDS_CUSTOMIZATION')) &&
    !existsSync(path.join(rootDir, '.vhk', 'customization-done'))
  return {
    ruleTargets,
    rulesPresent,
    rulesMissing,
    recordDirsPresent,
    recordDirsTotal: RECORD_DIRS.length,
    interviewPending,
  }
}

/** 설치 점검 영수증을 사람이 읽는 실무 톤 문자열로. 전문용어 대신 "규칙 파일/기록 폴더". */
export function formatInstallReceipt(r: InstallReceipt): string {
  const rulesOk = r.rulesMissing.length === 0
  const dirsOk = r.recordDirsPresent === r.recordDirsTotal
  const lines = [
    '📋 설치 점검 — 다 준비됐는지 확인했어요',
    `  규칙 파일    ${r.rulesPresent.length}/${r.ruleTargets.length}개 연결됨 ${rulesOk ? '✅' : '⚠️'}`,
    `  기록 폴더    ${r.recordDirsPresent}/${r.recordDirsTotal}종 만들어짐 ${dirsOk ? '✅' : '⚠️'}`,
  ]
  if (r.interviewPending) {
    lines.push('  첫 인터뷰    다음 세션 시작 때 자동으로 시작돼요 (도메인 규칙 + 기획 슬롯)')
  }
  if (!rulesOk) {
    lines.push(`  ⚠️ 누락: ${r.rulesMissing.join(', ')} → 복구: vhk sync`)
  }
  return lines.join('\n')
}
