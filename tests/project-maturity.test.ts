import { describe, it, expect } from 'vitest'
import {
  classifyMaturity,
  ESTABLISHED_COMMIT_THRESHOLD,
} from '../src/lib/project-maturity.js'
import { selectDoctorOkNextStep } from '../src/commands/doctor.js'
import { selectStatusNextStep } from '../src/commands/status.js'

// Goal 84: doctor/status next-step 이 신규 vs 기존 레포를 맥락 판정.
//   D9: 396커밋 활성 레포에서도 "이제 프로젝트를 시작하세요(vhk 시작)" 온보딩이 떠 안내 신뢰도 저하.
//   Forbidden: 신규 레포에선 온보딩 멘트 유지(퇴행 0).

describe('Goal 84 — project maturity 분류 (순수)', () => {
  it('.vhk/context.md 존재 → established (커밋 수 무관)', () => {
    expect(classifyMaturity({ contextExists: true, commitCount: 0 })).toBe('established')
  })
  it('커밋 수 ≥ 임계 → established', () => {
    expect(classifyMaturity({ contextExists: false, commitCount: ESTABLISHED_COMMIT_THRESHOLD })).toBe('established')
    expect(classifyMaturity({ contextExists: false, commitCount: 396 })).toBe('established')
  })
  it('커밋 적고 context 없음 → new (신규/초기 레포)', () => {
    expect(classifyMaturity({ contextExists: false, commitCount: 1 })).toBe('new')
    expect(classifyMaturity({ contextExists: false, commitCount: 0 })).toBe('new')
  })
})

describe('Goal 84 — doctor 통과 next-step 맥락 분기', () => {
  it('established → "프로젝트를 시작하세요" 아님 (이어서 작업, vhk work)', () => {
    const s = selectDoctorOkNextStep('established')
    expect(s.command).toBe('vhk work')
    expect(s.command).not.toMatch(/시작/)
    expect(s.message).not.toMatch(/프로젝트를 시작/)
  })
  it('new → 기존 온보딩 멘트 유지 (vhk 시작) — 퇴행 0', () => {
    const s = selectDoctorOkNextStep('new')
    expect(s.command).toBe('vhk 시작')
    expect(s.message).toMatch(/시작/)
  })
})

describe('Goal 84 — status next-step 맥락 분기', () => {
  it('clean + established → vhk goal next (기존 동작 유지)', () => {
    expect(selectStatusNextStep(false, 'established').command).toBe('vhk goal next')
  })
  it('clean + new → 온보딩 (vhk 시작)', () => {
    expect(selectStatusNextStep(false, 'new').command).toMatch(/시작/)
  })
  it('변경 있으면 maturity 무관하게 vhk diff (데이터 안전 — 기존 동작)', () => {
    expect(selectStatusNextStep(true, 'new').command).toBe('vhk diff')
    expect(selectStatusNextStep(true, 'established').command).toBe('vhk diff')
  })
  it('maturity 생략 시 established 기본 (하위호환 — 기존 호출부)', () => {
    expect(selectStatusNextStep(false).command).toBe('vhk goal next')
  })
})
