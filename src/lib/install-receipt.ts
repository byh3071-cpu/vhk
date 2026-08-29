import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { checkAgentSkillSync, type AgentSkillSyncCheckResult } from './agent-skill-templates.js'

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

export interface InstallReceiptCoreRules {
  source: 'live' | 'bundled'
  version?: string
}

export interface InstallReceipt {
  ruleTargets: string[]
  rulesPresent: string[]
  rulesMissing: string[]
  recordDirsPresent: number
  recordDirsTotal: number
  interviewPending: boolean
  agentSkills: AgentSkillSyncCheckResult
  coreRules?: InstallReceiptCoreRules
}

/** rootDir 의 규칙 파일·기록 폴더·인터뷰 대기 상태를 디스크에서 실측한다(부수효과 0). */
export function collectInstallReceipt(
  rootDir: string,
  coreRules?: InstallReceiptCoreRules,
): InstallReceipt {
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
    agentSkills: checkAgentSkillSync(rootDir),
    ...(coreRules ? { coreRules } : {}),
  }
}

// RFC 0060 T1b: PRD·ARCHITECTURE 에 남은 [여기에 작성:] 슬롯 수를 센다. vhk check 가 노출해
// "얼마나 채웠나"를 측정 가능하게(§4 성공기준). 마커 문자열은 T1 의 관행 마커와 정확히 일치.
const FILL_MARKER = '[여기에 작성:'

export function countFillSlots(rootDir: string): { prd: number; architecture: number; total: number } {
  const count = (rel: string): number => {
    const full = path.join(rootDir, rel)
    if (!existsSync(full)) return 0
    return readFileSync(full, 'utf-8').split(FILL_MARKER).length - 1
  }
  const prd = count('docs/PRD.md')
  const architecture = count('docs/ARCHITECTURE.md')
  return { prd, architecture, total: prd + architecture }
}

/** 설치 점검 영수증을 사람이 읽는 실무 톤 문자열로. 전문용어 대신 "규칙 파일/기록 폴더". */
export function formatInstallReceipt(r: InstallReceipt): string {
  const rulesOk = r.rulesMissing.length === 0
  const dirsOk = r.recordDirsPresent === r.recordDirsTotal
  const lines = [
    '📋 설치 점검 — 다 준비됐는지 확인했어요',
    `  규칙 파일    ${r.rulesPresent.length}/${r.ruleTargets.length}개 연결됨 ${rulesOk ? '✅' : '⚠️'}`,
  ]
  if (r.coreRules) {
    const version = !r.coreRules.version || r.coreRules.version === 'unknown'
      ? '버전 확인 안 됨'
      : `v${r.coreRules.version}`
    if (r.coreRules.source === 'live') {
      lines.push(`  핵심 규칙    사용자 규칙 파일 · ${version} ✅`)
    } else {
      lines.push(`  핵심 규칙    VHK 내장 기본 규칙 · ${version} ⚠️`)
      lines.push('  ⚠️ 사용자 규칙 파일이 연결된 상태가 아닙니다 → vhk config set-rules-file <HOME>/sample-rules.yaml')
    }
  }
  lines.push(`  기록 폴더    ${r.recordDirsPresent}/${r.recordDirsTotal}종 만들어짐 ${dirsOk ? '✅' : '⚠️'}`)
  lines.push(`  Agent Skills ${r.agentSkills.ok ? '정본·투영 일치 ✅' : '누락·불일치 있음 ⚠️'}`)
  if (r.interviewPending) {
    lines.push('  첫 인터뷰    다음 세션 시작 때 자동으로 시작돼요 (도메인 규칙 + 기획 슬롯)')
  }
  if (!rulesOk) {
    lines.push(`  ⚠️ 누락: ${r.rulesMissing.join(', ')} → 복구: vhk sync`)
  }
  if (!r.agentSkills.ok) {
    const count = r.agentSkills.missing.length
      + r.agentSkills.drifted.length
      + r.agentSkills.conflicts.length
      + r.agentSkills.bundleDrift.length
    lines.push(`  ⚠️ Agent Skill 문제 ${count}건 → 복구·확인: vhk sync`)
  }
  return lines.join('\n')
}
