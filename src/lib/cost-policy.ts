import type { Guard } from './risk-policy.js'
import type { PricingRate } from './config.js'

// Goal 56: 비용/예산 판정의 순수 SoT(결정만, 부작용 0). risk-policy 동형(결정/집행 분리).
// 집행은 cost.ts 가 runGuarded 와 *동형 의미*(비-TTY+미승인 block · TTY confirm · --yes 승인)로 수행.
// (runGuarded 는 action 기반 resolveGuard 로 guard 를 자체 계산 → 임계 기반 비용 level 을 못 먹이므로
//  직접 호출 대신 동일 의미를 cost level 로 구동. risk-policy 중복 아님 = 별도 정책 차원.)

export type CostLevel = 'allow' | 'warn' | 'block'

export interface BudgetEval {
  /** used / limit (예산 미설정 시 0) */
  pct: number
  level: CostLevel
}

/** 모델별 요율 — .vhk/config.json 주입(코드 하드코딩 금지). 타입 SoT = config.PricingRate 재사용(중복 제거). */
export type PricingTable = Record<string, PricingRate>

/**
 * 누적 사용량 vs 예산 판정. ≥100% block · ≥warnPct(기본 0.8) warn · 그 외 allow.
 * 예산 미설정/0/음수면 가드 없음(allow) — 예산을 안 걸면 비용 가드도 없다.
 */
export function evaluateBudget(
  usedUsd: number,
  limitUsd: number | undefined,
  warnPct = 0.8
): BudgetEval {
  if (!limitUsd || limitUsd <= 0) return { pct: 0, level: 'allow' }
  const pct = usedUsd / limitUsd
  const level: CostLevel = pct >= 1 ? 'block' : pct >= warnPct ? 'warn' : 'allow'
  return { pct, level }
}

/** 비용 level → 기존 Guard 어휘(집행 의미 통일). */
export function costToGuard(level: CostLevel): Guard {
  return level === 'block' ? 'confirm' : level === 'warn' ? 'warn' : 'allow'
}

/**
 * 한 기록의 비용($). usd 명시되면 그대로, 아니면 model+토큰×config 요율로 환산.
 * 요율 없으면(pricing 미주입 또는 모델 미매칭) 0 — 추정 금지(없는 비용 지어내지 않음).
 */
export function usdOf(
  input: { usd?: number; model?: string; inputTokens?: number; outputTokens?: number },
  pricing?: PricingTable
): number {
  if (typeof input.usd === 'number') return input.usd
  const rate = input.model && pricing ? pricing[input.model] : undefined
  if (!rate) return 0
  const inK = (input.inputTokens ?? 0) / 1000
  const outK = (input.outputTokens ?? 0) / 1000
  return inK * rate.inputPer1k + outK * rate.outputPer1k
}
