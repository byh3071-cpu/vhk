import { describe, it, expect } from 'vitest'
import { localDate } from '../src/lib/date.js'

/** Date 의 '로컬' getter 로 YYYY-MM-DD 를 직접 구성(로컬 타임존 기준 참값). */
function localGetterDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

describe('localDate (VHK-019)', () => {
  it('YYYY-MM-DD 형식을 반환한다', () => {
    expect(localDate(new Date('2026-03-05T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('UTC 가 아니라 로컬 타임존 날짜를 쓴다(로컬 getter 와 일치)', () => {
    // 어느 타임존에서 돌려도 로컬 getter 기준값과 같아야 함(toISOString 의 UTC 와 달리).
    for (const iso of ['2026-05-31T16:00:00Z', '2026-01-01T02:30:00Z', '2026-12-31T23:59:00Z']) {
      const d = new Date(iso)
      expect(localDate(d)).toBe(localGetterDate(d))
    }
  })

  it('버그 재현: UTC 저녁 시각은 KST 로 다음날 — UTC slice 는 하루 밀린다', () => {
    // 2026-05-31 16:00Z = 2026-06-01 01:00 KST. 날짜 표기는 KST(로컬) 기준이어야 함.
    const d = new Date('2026-05-31T16:00:00Z')
    expect(d.toISOString().slice(0, 10)).toBe('2026-05-31') // 기존 버그: UTC '어제'
    expect(d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })).toBe('2026-06-01') // KST '오늘'
  })
})
