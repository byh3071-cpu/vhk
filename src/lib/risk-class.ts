/*
 * risk-class.ts — 위험도 분류와 단계×위험도 매트릭스 (작업 단위 124-T2 · RFC 0066 §5).
 *
 * 새 분류 체계를 만들지 않는다. `task-kind.ts` 가 이미 7종 닫힌집합을 갖고 있고,
 * 유형은 변경된 파일 경로에서 유도하므로 에이전트가 "이건 잡무입니다" 라고 신고해도
 * 승인 경계를 우회할 수 없다. 여기서 하는 일은 그 7종을 두 갈래로 접는 순수 매핑뿐이다.
 */
import type { TaskKindBreakdown, TaskKind } from './task-kind.js'
import type { PermissionLevel } from './permission-level.js'

/**
 * `auto` 는 "사람 없이 진행 가능" 이 아니다. **"이 단계에서 상한을 낮추는 추가 사유가 없다"** 는 뜻이다.
 * `human` 은 권한 단계가 무엇이든 사람 확인 없이 넘어가지 않는다는 뜻이다.
 */
export type RiskClass = 'auto' | 'human'

/**
 * ADR-009 ③ 이 자동 허용으로 지정한 셋만 `auto` 다.
 * 지정하지 않은 것은 전부 `human` — 목록에 없다는 이유로 낙관 추정하지 않는다.
 */
export const RISK_MAP: Record<TaskKind, RiskClass> = {
  chore: 'auto',
  docs: 'auto',
  deps: 'auto', // §11 Q2 재검토 대상 — 관찰 게이트 종료 시 판정
  source: 'human', // ADR-009 ③ 이 자동 허용으로 지정하지 않음 → fail-closed
  schema: 'human',
  security: 'human',
  unknown: 'human', // 유도 실패. 낙관 추정 금지
}

/**
 * 변경 내역 → 위험도 (§5.3).
 *
 * 미분류가 하나라도 섞이면 최댓값 유형이 무엇이든 `human` 이다. `deriveTaskKind` 의 최댓값만
 * 보면 `['docs/a.md', 'Dockerfile']` 이 통째로 `docs` = `auto` 로 통과하는데, 컨테이너 정의·
 * CI 보조 파일·확장자 없는 스크립트가 문서 파일 하나에 묻어 낮은 위험도로 새는 구멍이다.
 *
 * 경로가 0개인 것도 `human` 이다 — 범위를 못 구한 상태를 "바꾼 게 없으니 안전" 으로 읽지 않는다.
 */
export function riskClassOf(breakdown: TaskKindBreakdown): RiskClass {
  if (breakdown.total === 0) return 'human'
  if (breakdown.unclassified > 0) return 'human'
  return RISK_MAP[breakdown.kind]
}

/**
 * 단계 × 위험도 매트릭스 (§5.2) — 이 조합에서 실제로 허용되는 상한.
 *
 * 표의 전부는 `human` 열이 단계와 무관하게 같다는 것이다.
 * **권한 단계는 `human` 위험도를 절대 완화하지 않는다.** 단계가 올라가면 `auto` 열만 넓어진다.
 *
 * 적용 지점은 커밋·push 같은 **런 종결 행위**다. 개별 명령 실행 전 검사(RFC 0067 §4)에는
 * 적용하지 않는다 — 근거는 그쪽 문서에 있다.
 */
export function effectiveCeiling(level: PermissionLevel, risk: RiskClass): PermissionLevel {
  return risk === 'human' ? 'L0' : level
}
