import { describe, it, expect } from 'vitest'
import { evaluateBudget, costToGuard, usdOf } from '../src/lib/cost-policy.js'

// Goal 56: cost-policy 는 비용/예산 판정의 순수 SoT(결정만, 부작용 0). risk-policy 동형.
// 임계: 예산의 80%(warn) / 100%(block). 예산 미설정(0/undefined)이면 가드 없음(allow).

describe('cost-policy — evaluateBudget (임계 판정)', () => {
  it('예산 미설정(undefined) → 가드 없음(allow, pct 0)', () => {
    expect(evaluateBudget(50, undefined)).toEqual({ pct: 0, level: 'allow' })
  })

  it('예산 0/음수 → allow (의미 없는 예산은 가드 안 함)', () => {
    expect(evaluateBudget(50, 0).level).toBe('allow')
    expect(evaluateBudget(50, -10).level).toBe('allow')
  })

  it('79% → allow (warn 임계 미만)', () => {
    expect(evaluateBudget(79, 100).level).toBe('allow')
  })

  it('80% → warn (경계 포함)', () => {
    const r = evaluateBudget(80, 100)
    expect(r.level).toBe('warn')
    expect(r.pct).toBeCloseTo(0.8)
  })

  it('99% → warn', () => {
    expect(evaluateBudget(99, 100).level).toBe('warn')
  })

  it('100% → block (경계 포함)', () => {
    expect(evaluateBudget(100, 100).level).toBe('block')
  })

  it('120% → block', () => {
    const r = evaluateBudget(120, 100)
    expect(r.level).toBe('block')
    expect(r.pct).toBeCloseTo(1.2)
  })

  it('warnPct 커스텀(0.5) → 50%에서 warn', () => {
    expect(evaluateBudget(49, 100, 0.5).level).toBe('allow')
    expect(evaluateBudget(50, 100, 0.5).level).toBe('warn')
  })
})

describe('cost-policy — costToGuard (level → Guard 매핑)', () => {
  it('block → confirm, warn → warn, allow → allow', () => {
    expect(costToGuard('block')).toBe('confirm')
    expect(costToGuard('warn')).toBe('warn')
    expect(costToGuard('allow')).toBe('allow')
  })
})

describe('cost-policy — usdOf (토큰→$ 환산, config 요율 주입)', () => {
  const pricing = { 'claude-x': { inputPer1k: 3, outputPer1k: 15 } }

  it('usd 명시 시 그대로 사용(요율 무시)', () => {
    expect(usdOf({ usd: 5 }, pricing)).toBe(5)
  })

  it('usd 0(명시) → 0', () => {
    expect(usdOf({ usd: 0 }, pricing)).toBe(0)
  })

  it('토큰 + 모델 + 요율 → 환산($)', () => {
    // 1k input × 3 + 2k output × 15 = 3 + 30 = 33
    expect(usdOf({ model: 'claude-x', inputTokens: 1000, outputTokens: 2000 }, pricing)).toBe(33)
  })

  it('요율 없으면(pricing 미주입 또는 모델 미매칭) → 0', () => {
    expect(usdOf({ model: 'claude-x', inputTokens: 1000 })).toBe(0)
    expect(usdOf({ model: 'unknown', inputTokens: 1000 }, pricing)).toBe(0)
  })
})
