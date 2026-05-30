import type { SafetyMode } from './safety-mode.js'

/**
 * 정책 적용 대상 high-risk 액션 8종 — 되돌리기 어렵거나 외부에 영향 주는 작업.
 * (undo: 커밋 되돌림 / deploy·publish: 외부 배포 / migrate: 패키지매니저 전환 /
 *  cloud-pull: 로컬 .vhk 덮어씀 / resume: HARD_STOP 해제 / env-write: 시크릿 파일 변경 / delete: 삭제)
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
}

export function isHighRisk(action: string): action is HighRiskAction {
  return (HIGH_RISK_ACTIONS as readonly string[]).includes(action)
}

/**
 * 액션·모드·채널로 가드 결정.
 * - 저위험(+strict 추가대상 아님) → allow
 * - lite → 막지 않고 warn(경고만)
 * - standard/strict → CLI 는 confirm, MCP/자연어는 preview(실행 전 무엇을 할지 출력)
 */
export function resolveGuard(action: string, mode: SafetyMode, channel: Channel): Guard {
  const guarded = isHighRisk(action) || (mode === 'strict' && STRICT_EXTRA_ACTIONS.has(action))
  if (!guarded) return 'allow'
  if (mode === 'lite') return 'warn'
  return channel === 'cli' ? 'confirm' : 'preview'
}
