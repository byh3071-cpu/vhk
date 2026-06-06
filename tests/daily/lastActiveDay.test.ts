import { describe, it, expect } from 'vitest'
import { lastActiveDay } from '../../src/daily/lastActiveDay.js'

describe('lastActiveDay', () => {
  it('today 직전 가장 최근 활동일을 고른다', () => {
    expect(lastActiveDay(['2026-06-05', '2026-06-04'], '2026-06-06')).toBe('2026-06-05')
  })

  it('주말·공백을 자동 스킵 (실제 활동일 기준) — 금요일 작업, 월요일 today → 금요일', () => {
    // 토(6)·일(7) 활동 없음
    expect(lastActiveDay(['2026-06-05', '2026-06-04'], '2026-06-08')).toBe('2026-06-05')
  })

  it('today 자신의 활동은 제외 (strict <) — 오늘만 작업한 첫 세션 → null', () => {
    expect(lastActiveDay(['2026-06-06'], '2026-06-06')).toBeNull()
  })

  it('활동 전무(신규 repo) → null', () => {
    expect(lastActiveDay([], '2026-06-06')).toBeNull()
  })

  it('순서·중복 무관하게 최댓값', () => {
    expect(lastActiveDay(['2026-06-01', '2026-06-05', '2026-06-05', '2026-06-03'], '2026-06-06')).toBe('2026-06-05')
  })
})
