import type { SafetyMode } from './safety-mode.js'

/**
 * 정책 적용 대상 high-risk 액션 10종 — 되돌리기 어렵거나 외부에 영향 주는 작업.
 * (undo: 커밋 되돌림 / deploy·publish: 외부 배포 / migrate: 패키지매니저 전환 /
 *  cloud-pull: 로컬 .vhk 덮어씀 / resume: HARD_STOP 해제 / env-write: 시크릿 파일 변경 /
 *  delete: 삭제 / restore: 백업 덮어쓰기 / policy-baseline: 정책 신뢰 기준 갱신)
 */
export const HIGH_RISK_ACTIONS = [
  'undo',
  'deploy',
  'publish',
  'migrate',
  'cloud-pull',
  'resume',
  'env-write',
  'delete',
  'restore',
  'policy-baseline',
] as const

export type HighRiskAction = (typeof HIGH_RISK_ACTIONS)[number]

/** 실행 경로(채널). CLI=대화형 터미널, MCP=에이전트 도구, NL=자연어 라우터. */
export type Channel = 'cli' | 'mcp' | 'nl'

/** 가드 결정. confirm=y/N 확인, preview=dry-run 출력, warn=경고만, allow=그대로 진행. */
export type Guard = 'confirm' | 'preview' | 'warn' | 'allow'

/** strict 모드에서 추가로 확인을 요구하는(보통은 저위험) 작업. */
export const STRICT_EXTRA_ACTIONS: ReadonlySet<string> = new Set(['save', 'sync'])

/**
 * 자연어(NlpCommand) → 가드 대상 action 의 **단일 소스**.
 * 자연어 dispatch 에서 위험/strict-extra 작업을 호출하는 모든 명령을 여기에 등록한다.
 * (별도 손관리 리스트 금지 — nlp-run 은 import 만. 완전성 가드 테스트가 dispatch 와 교차검증해
 *  여기 누락 시 FAIL → R1/env 류 드리프트 차단.)
 */
export const NL_GUARDED_ACTIONS: Readonly<Record<string, string>> = {
  undo: 'undo',
  deploy: 'deploy',
  publish: 'publish',
  migrate: 'migrate',
  'cloud-pull': 'cloud-pull',
  env: 'env-write',
  save: 'save',
  sync: 'sync',
  restore: 'restore',
}

export function isHighRisk(action: string): action is HighRiskAction {
  return (HIGH_RISK_ACTIONS as readonly string[]).includes(action)
}

/**
 * Goal 57: 파일·경로 글롭 위험 차원 — 액션 문자열(10종)만으로는 못 잡는 "위험 대상".
 * 자동수정/삭제가 위험한 대상을 basename/정규식만으로 판정(신규 의존성 0):
 *  - 생성-SoT 파일(RULES.md·AGENTS.md·.cursorrules·.windsurfrules): vhk sync 산출 원본 — 자동수정 시 규칙 드리프트.
 *  - .env 시작 시크릿 파일: 변경 시 자격증명 노출/손상.
 *  - rm -rf 경로성 문자열: 경로 통째 삭제.
 * resolveGuard 의 target 차원 단일 소스(분산 결정점은 이걸 참조만 — 정책 재정의 금지).
 */
export const RISKY_TARGET_PATTERNS: ReadonlyArray<{ re: RegExp; reason: string }> = [
  { re: /(^|[\\/])(RULES\.md|AGENTS\.md|\.cursorrules|\.windsurfrules)$/i, reason: '생성-SoT 자동수정(vhk sync 산출 원본)' },
  // .env / .env.<X> 는 risky. 단 .env.example|.sample|.template 은 시크릿 값 없는 커밋용 템플릿이라 제외(오탐 방지).
  { re: /(^|[\\/])\.env(\.(?!example|sample|template)[^\\/]*)?$/i, reason: '시크릿 파일(.env*) 변경' },
  { re: /\brm\s+-rf\b/i, reason: '경로 통째 삭제(rm -rf)' },
]

/** 대상(파일/경로/명령 문자열)이 글롭 위험에 해당하는지. 첫 매칭 사유를 반환. */
export function isRiskyTarget(target: string): { risky: boolean; reason?: string } {
  for (const { re, reason } of RISKY_TARGET_PATTERNS) {
    if (re.test(target)) return { risky: true, reason }
  }
  return { risky: false }
}

/**
 * 액션·모드·채널(+선택적 대상)로 가드 결정.
 * - 저위험(+strict 추가대상 아님, +위험 대상 아님) → allow
 * - lite → 막지 않고 warn(경고만)
 * - standard/strict → CLI 는 confirm, MCP/자연어는 preview(실행 전 무엇을 할지 출력)
 * Goal 57: target 은 optional(하위호환) — 주어지고 isRiskyTarget 이면 액션이 저위험이어도 가드 발동.
 */
export function resolveGuard(action: string, mode: SafetyMode, channel: Channel, target?: string): Guard {
  const guarded =
    isHighRisk(action) ||
    (mode === 'strict' && STRICT_EXTRA_ACTIONS.has(action)) ||
    (target !== undefined && isRiskyTarget(target).risky)
  if (!guarded) return 'allow'
  if (mode === 'lite') return 'warn'
  return channel === 'cli' ? 'confirm' : 'preview'
}
