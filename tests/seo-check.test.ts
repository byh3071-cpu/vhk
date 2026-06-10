import { describe, it, expect } from 'vitest'
import {
  canInspect,
  inspectionRemaining,
  URL_INSPECTION_LIMIT,
  ADSENSE_V14_FORBIDDEN,
} from '../src/commands/seo/check.js'

describe('Goal 23·24: URL Inspection 한도 가드(순수)', () => {
  it('한도 = 2,000/일 · 600/분', () => {
    expect(URL_INSPECTION_LIMIT).toEqual({ perDay: 2000, perMin: 600 })
  })

  it('canInspect — 일·분 한도 내면 true', () => {
    expect(canInspect(0, 0)).toBe(true)
    expect(canInspect(1999, 599)).toBe(true)
  })

  it('canInspect — 일 또는 분 한도 도달 시 false', () => {
    expect(canInspect(2000, 0)).toBe(false) // 일 한도
    expect(canInspect(0, 600)).toBe(false) // 분 한도
  })

  it('inspectionRemaining — 일·분 중 더 작은 쪽', () => {
    expect(inspectionRemaining(0, 0)).toBe(600) // 분(600) < 일(2000)
    expect(inspectionRemaining(1995, 100)).toBe(5) // 일(5) < 분(500)
    expect(inspectionRemaining(2000, 600)).toBe(0)
  })

  it('AdSense v1.4 금지 가드(상수)', () => {
    expect(ADSENSE_V14_FORBIDDEN).toBe(true)
  })
})
