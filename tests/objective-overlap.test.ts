import { describe, it, expect } from 'vitest'
import { computeObjectiveOverlap, isRealObjective } from '../src/commands/receipt.js'
import { MISSION_SCAFFOLD_OBJECTIVE } from '../src/commands/mission.js'

// N4(ⓑ): objective 토큰 교집합 — 결정론(LLM 0). mission.objective ↔ (goal.title+commit) 어휘 대조.

describe('computeObjectiveOverlap (결정론·LLM 0)', () => {
  it('공통 distinct 토큰 수 카운트', () => {
    expect(computeObjectiveOverlap('결제 모듈 리팩터링', '결제 모듈 버그 수정')).toBe(2)
  })

  it('겹침 없음 → 0 (목표와 작업 어휘 불일치 약신호)', () => {
    expect(computeObjectiveOverlap('결제 인증 구현', '오타 문서 정리')).toBe(0)
  })

  it('결정적 — 같은 입력 같은 출력', () => {
    const a = computeObjectiveOverlap('로그인 인증 흐름', '인증 흐름 개선')
    const b = computeObjectiveOverlap('로그인 인증 흐름', '인증 흐름 개선')
    expect(a).toBe(b)
  })

  it('중복 토큰은 distinct 로만(한 번) 카운트', () => {
    expect(computeObjectiveOverlap('결제 결제 결제', '결제 처리')).toBe(1)
  })

  it('토큰화 불가 objective(빈/전부 <2자·불용어) → undefined (미계산, ref-empty 가드와 대칭, 적대리뷰 반영)', () => {
    expect(computeObjectiveOverlap('', '아무 작업이나')).toBeUndefined()
    expect(computeObjectiveOverlap('가 나', '가 나 다 작업')).toBeUndefined()
  })
})

describe('isRealObjective (암묵 opt-in 게이트)', () => {
  it('placeholder(스캐폴드) → false', () => {
    expect(isRealObjective(MISSION_SCAFFOLD_OBJECTIVE)).toBe(false)
  })

  it('빈/공백 → false', () => {
    expect(isRealObjective('')).toBe(false)
    expect(isRealObjective('   ')).toBe(false)
  })

  it('실제 목표 → true (계산 대상)', () => {
    expect(isRealObjective('결제 모듈 구현')).toBe(true)
  })
})
