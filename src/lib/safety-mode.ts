/**
 * Safety Mode — 위험 작업 가드의 강도.
 * PRD 프레임: "검증 루프 강제"지 "전문 개발자 대체"가 아니다. 기계 게이트 위에 얹는 레이어.
 * - lite     : 막지 않고 경고만 (숙련자/빠른 반복)
 * - standard : 기본 — 위험 작업은 CLI confirm, MCP/자연어는 preview(dry-run)
 * - strict   : 더 많은 작업(save/sync 등)에도 확인 요구
 */
export type SafetyMode = 'lite' | 'standard' | 'strict'

export const SAFETY_MODES: readonly SafetyMode[] = ['lite', 'standard', 'strict']

export const DEFAULT_SAFETY_MODE: SafetyMode = 'standard'

export const SAFETY_MODE_DESC: Record<SafetyMode, string> = {
  lite: '경고만 — 위험 작업도 막지 않고 경고만 표시 (빠른 반복용)',
  standard: '기본 — 위험 작업은 CLI 확인·MCP/자연어 미리보기',
  strict: '엄격 — 더 많은 작업(저장/동기화 등)에도 확인 요구',
}

export function isSafetyMode(value: unknown): value is SafetyMode {
  return typeof value === 'string' && (SAFETY_MODES as readonly string[]).includes(value)
}
