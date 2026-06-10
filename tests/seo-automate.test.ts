import { describe, it, expect } from 'vitest'
import {
  sotKey,
  buildSchedulerCommand,
  SEO_ADAPTER_SLOTS,
} from '../src/commands/seo/automate.js'

describe('Goal 26: automate 순수 로직', () => {
  it('sotKey 멱등 — 같은 (도메인, 날짜) → 동일 키 (시각 무관)', () => {
    const a = sotKey('example.com', '2026-06-10T09:00:00Z')
    const b = sotKey('example.com', '2026-06-10T23:59:59Z')
    expect(a).toBe(b)
    expect(a).toBe('seo:example.com:2026-06-10')
  })

  it('sotKey — 다른 날짜는 다른 키', () => {
    expect(sotKey('x.com', '2026-06-10T00:00:00Z')).not.toBe(sotKey('x.com', '2026-06-11T00:00:00Z'))
  })

  it('buildSchedulerCommand — submit+check+report 체인 비대화형', () => {
    const cmd = buildSchedulerCommand('vhk-seo-daily', '08:30')
    expect(cmd).toContain('schtasks /Create')
    expect(cmd).toContain('vhk seo submit')
    expect(cmd).toContain('vhk seo check')
    expect(cmd).toContain('vhk seo report')
    expect(cmd).toContain('08:30')
  })

  it('확장 슬롯 — 얀덱스 자동 커버, 다음/카카오·GBP 는 자리만', () => {
    const yandex = SEO_ADAPTER_SLOTS.find((s) => s.name === 'yandex')
    expect(yandex?.autoCovered).toBe(true)
    const daum = SEO_ADAPTER_SLOTS.find((s) => s.name === 'daum-kakao')
    expect(daum?.implemented).toBe(false)
    expect(SEO_ADAPTER_SLOTS.some((s) => s.name === 'gbp')).toBe(true)
  })
})
