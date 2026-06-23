import { describe, it, expect } from 'vitest'
import {
  decideReceipt,
  buildReceipt,
  renderReceiptMarkdown,
  type ReceiptEvidence,
  type ReceiptDecision,
  HONESTY_LINE,
} from '../src/lib/receipt.js'

// Goal 86 (RFC 0056 T1): vhk receipt — 4대 기계증거 → 영수증 1장.
// 핵심 불변식(테스트로 고정):
//  ① decision 은 기계증거만으로(LLM 0). dirty/stale/red 중 하나라도면 block.
//  ② 단조성: caution → pass 격상 절대 금지(부정 신호가 늘면 결과가 좋아질 수 없다).
//  ③ ④ diff-cover 는 advisory(약신호) — decision 을 block 으로 격하시키지 못한다.

/** 모든 게이트 green·clean·신선·풀커버 = 깨끗한 기준 증거. */
function cleanEvidence(): ReceiptEvidence {
  return {
    gates: { red: false, status: 'PASS', failedGateIds: [], hasSoftWarning: false },
    dirty: false,
    stale: false,
    staleKnown: true,
    diffCover: { measured: true, totalAdded: 10, totalUncovered: 0, ratio: 1 },
  }
}

describe('decideReceipt — 기계증거만(LLM 0)', () => {
  it('전부 green·clean·신선·풀커버 → pass', () => {
    expect(decideReceipt(cleanEvidence())).toBe('pass')
  })

  it('red(게이트 실패 종료코드) → block', () => {
    const e = cleanEvidence()
    e.gates.red = true
    e.gates.status = 'FAIL'
    e.gates.failedGateIds = ['test']
    expect(decideReceipt(e)).toBe('block')
  })

  it('dirty(미커밋 변경) → block', () => {
    const e = cleanEvidence()
    e.dirty = true
    expect(decideReceipt(e)).toBe('block')
  })

  it('stale(작업시작 SHA ≠ HEAD) → block', () => {
    const e = cleanEvidence()
    e.stale = true
    expect(decideReceipt(e)).toBe('block')
  })

  it('실차단 3종(red·dirty·stale) 중 하나라도면 block — 조합 무관', () => {
    for (const key of ['red', 'dirty', 'stale'] as const) {
      const e = cleanEvidence()
      if (key === 'red') e.gates.red = true
      else e[key] = true
      expect(decideReceipt(e), `${key} 단독이면 block`).toBe('block')
    }
  })

  it('stale 미상(staleKnown=false) 단독은 block 아님 — 모르는 걸 빨강으로 위장 금지', () => {
    const e = cleanEvidence()
    e.stale = false
    e.staleKnown = false
    // 기준선 미기록 = 알 수 없음 → 거짓 block 안 함(단 pass 도 아니고 caution 으로 정직).
    expect(decideReceipt(e)).not.toBe('block')
  })
})

describe('단조성 불변식 — caution → pass 격상 절대 금지', () => {
  it('soft 경고(skip/warn 게이트)가 있으면 caution 이지 pass 아님', () => {
    const e = cleanEvidence()
    e.gates.status = 'WARN'
    e.gates.hasSoftWarning = true
    expect(decideReceipt(e)).toBe('caution')
  })

  it('diff-cover 미검증 변경분이 있으면 caution 이지 pass 아님(advisory 약신호)', () => {
    const e = cleanEvidence()
    e.diffCover = { measured: true, totalAdded: 10, totalUncovered: 4, ratio: 0.6 }
    expect(decideReceipt(e)).toBe('caution')
  })

  it('stale 미상도 caution(모르면 안심 금지)', () => {
    const e = cleanEvidence()
    e.staleKnown = false
    expect(decideReceipt(e)).toBe('caution')
  })

  it('부정 신호를 더해도 결과가 절대 좋아지지 않는다(pass→caution→block 단조)', () => {
    const order: Record<ReceiptDecision, number> = { pass: 0, caution: 1, block: 2 }
    const base = cleanEvidence()
    const baseRank = order[decideReceipt(base)]
    // caution 유발 신호를 추가 → pass 로 떨어질 수 없음(>= base).
    const cautioned = cleanEvidence()
    cautioned.gates.hasSoftWarning = true
    expect(order[decideReceipt(cautioned)]).toBeGreaterThanOrEqual(baseRank)
    // block 유발 신호를 추가 → caution 이상.
    const blocked = cleanEvidence()
    blocked.gates.hasSoftWarning = true
    blocked.dirty = true
    expect(order[decideReceipt(blocked)]).toBeGreaterThanOrEqual(order[decideReceipt(cautioned)])
    expect(decideReceipt(blocked)).toBe('block')
  })
})

describe('④ diff-cover 는 advisory — decision 을 block 으로 격하 못 함', () => {
  it('diff-cover 0% 미커버여도(나머지 clean) block 아님 — 최대 caution', () => {
    const e = cleanEvidence()
    e.diffCover = { measured: true, totalAdded: 20, totalUncovered: 20, ratio: 0 }
    const d = decideReceipt(e)
    expect(d).not.toBe('block')
    expect(d).toBe('caution')
  })

  it('실차단(dirty)에 더해 diff-cover 가 풀커버여도 여전히 block — 차단은 3종만이 결정', () => {
    const e = cleanEvidence()
    e.dirty = true
    e.diffCover = { measured: true, totalAdded: 10, totalUncovered: 0, ratio: 1 }
    expect(decideReceipt(e)).toBe('block')
  })

  it('diff-cover 미측정(리포트 없음)도 block 아님 — advisory 부재는 차단 사유 아님', () => {
    const e = cleanEvidence()
    e.diffCover = { measured: false, totalAdded: 0, totalUncovered: 0, ratio: 1 }
    expect(decideReceipt(e)).not.toBe('block')
  })
})

describe('buildReceipt — .json 영수증 구조', () => {
  it('decision·증거·생성시각·날짜·슬러그를 담는다', () => {
    const r = buildReceipt(cleanEvidence(), {
      generatedAt: '2026-06-23T00:00:00.000Z',
      date: '2026-06-23',
      slug: 'test-slug',
      headSha: 'abc1234def',
      baseSha: 'abc1234def',
    })
    expect(r.decision).toBe('pass')
    expect(r.date).toBe('2026-06-23')
    expect(r.slug).toBe('test-slug')
    expect(r.evidence.dirty).toBe(false)
    expect(r.head.shortSha).toBe('abc1234')
  })
})

describe('renderReceiptMarkdown — PR/대화 붙여넣기 1블록', () => {
  it('decision 배지 + 게이트표 + 정직성 1줄을 포함', () => {
    const r = buildReceipt(cleanEvidence(), {
      generatedAt: '2026-06-23T00:00:00.000Z',
      date: '2026-06-23',
      slug: 'test-slug',
      headSha: 'abc1234def',
      baseSha: 'abc1234def',
    })
    const md = renderReceiptMarkdown(r)
    expect(md).toContain('PASS')
    expect(md).toContain('게이트')
    expect(md).toContain(HONESTY_LINE)
    // 정직성 1줄 — 게으른 거짓완료 vs 미묘한 오류 경계 명시.
    expect(HONESTY_LINE).toMatch(/게으른 거짓완료|미묘한 오류/)
  })

  it('block 영수증은 사유(dirty/stale/red)를 표기', () => {
    const e = cleanEvidence()
    e.dirty = true
    e.stale = true
    e.gates.red = true
    e.gates.status = 'FAIL'
    e.gates.failedGateIds = ['build']
    const r = buildReceipt(e, {
      generatedAt: '2026-06-23T00:00:00.000Z',
      date: '2026-06-23',
      slug: 's',
      headSha: 'x',
      baseSha: 'y',
    })
    const md = renderReceiptMarkdown(r)
    expect(md).toContain('BLOCK')
    expect(md).toMatch(/미커밋|dirty/)
    expect(md).toMatch(/낡|stale|작업\s*시작/)
  })
})
