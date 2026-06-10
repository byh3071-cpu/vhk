import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { countRegexAssertions, countMustAssertions } from '../src/lib/goal-drift.js'

// Goal 53: 가드 신뢰도 — 정규식 shape 단언(must(/.../.test(src)))은 거짓양성(import만 통과)·
// 거짓음성(함수명 변경 실패) 위험. 비율을 측정·상한(ratchet)으로 묶고, 핵심 행동은 behavior 테스트로 검증.

const SAMPLE = `const must = (cond, label) => {}
must(/export function foo/.test(src), 'foo export')
must(/import bar/.test(src), 'bar import')
must(existsSync('tests/x.test.ts'), 'behavior 테스트 존재')
// must(/commented/.test(src), '주석 — 무시')
`

describe('countRegexAssertions', () => {
  it('정규식 shape 단언만 카운트(주석·behavior must 제외)', () => {
    const { count, examples } = countRegexAssertions(SAMPLE)
    expect(count).toBe(2)
    expect(examples).toHaveLength(2)
    expect(examples[0]).toContain('.test')
  })

  it('전체 must() 호출은 별도 카운트(분모)', () => {
    // 정규식 2 + behavior 1 = 3 (헬퍼 정의·주석 제외)
    expect(countMustAssertions(SAMPLE)).toBe(3)
  })

  it('shape 0 인 슬림 게이트 → count 0', () => {
    const slim = `const must = (cond,label)=>{}\nmust(existsSync('tests/x.test.ts'),'존재')\n`
    expect(countRegexAssertions(slim).count).toBe(0)
    expect(countMustAssertions(slim)).toBe(1)
  })
})

describe('check-goal 게이트 정규식 비율 (ratchet)', () => {
  // 현황 ~75% (감사: 92%에서 측정 시점차). 상한 0.85 — 신규 shape 단언 폭증 차단.
  // 점진 마이그레이션으로 낮춰가는 ratchet (전 게이트 일괄 개조는 스코프 아웃).
  const CEILING = 0.85

  function scanScripts(): { total: number; shape: number } {
    const dir = path.join(process.cwd(), 'scripts')
    let total = 0
    let shape = 0
    for (const f of fs.readdirSync(dir)) {
      if (!/^check-goal-\d+\.mjs$/.test(f)) continue
      const c = fs.readFileSync(path.join(dir, f), 'utf-8')
      total += countMustAssertions(c)
      shape += countRegexAssertions(c).count
    }
    return { total, shape }
  }

  it('정규식 shape 비율이 상한(0.85) 이하', () => {
    const { total, shape } = scanScripts()
    expect(total).toBeGreaterThan(0)
    const ratio = shape / total
    expect(ratio).toBeLessThanOrEqual(CEILING)
  })
})

describe('behavior 테스트 목록 대조', () => {
  // 감사가 지목한, 이미 behavior 검증이 존재하는 항목 — shape grep 의 신뢰 대체재.
  it('핵심 behavior 테스트 파일이 존재한다', () => {
    for (const f of ['goal-drift.test.ts', 'git-repo.test.ts', 'version-sync.test.ts']) {
      expect(fs.existsSync(path.join(process.cwd(), 'tests', f))).toBe(true)
    }
  })
})
