import { describe, it, expect } from 'vitest'
import {
  riskClassOf,
  effectiveCeiling,
  RISK_MAP,
  type RiskClass,
} from '../src/lib/risk-class.js'
import { deriveTaskKindDetailed, type TaskKind } from '../src/lib/task-kind.js'
import { LEVELS, type PermissionLevel } from '../src/lib/permission-level.js'

/*
 * RFC 0066 §5 — 위험도 분류 (124-T2).
 *
 * 새 분류 체계를 만들지 않는다. 기존 TaskKind 7종을 두 갈래(auto/human)로 접는 순수 매핑이다.
 * `auto` 는 "사람 없이 진행 가능" 이 아니라 "이 단계에서 상한을 낮추는 추가 사유가 없다" 는 뜻이고,
 * `human` 은 권한 단계가 무엇이든 사람 확인 없이 넘어가지 않는다는 뜻이다.
 */

describe('위험도 매핑 (RFC 0066 §5.1)', () => {
  it('ADR-009 ③ 의 자동 허용 셋만 auto 다', () => {
    const expected: Record<TaskKind, RiskClass> = {
      chore: 'auto',
      docs: 'auto',
      deps: 'auto',
      source: 'human',
      schema: 'human',
      security: 'human',
      unknown: 'human',
    }
    expect(RISK_MAP).toEqual(expected)
  })

  it('TaskKind 7종이 모두 매핑돼 있다 — 빠지면 판정이 undefined 가 된다', () => {
    const kinds: TaskKind[] = ['chore', 'docs', 'deps', 'source', 'schema', 'security', 'unknown']
    for (const k of kinds) expect(RISK_MAP[k]).toMatch(/^(auto|human)$/)
  })
})

describe('riskClassOf — 미분류가 섞이면 human (§5.3 치명 1)', () => {
  it('전부 분류된 자동 허용 유형은 auto', () => {
    expect(riskClassOf(deriveTaskKindDetailed(['docs/a.md']))).toBe('auto')
  })

  // 이 케이스가 치명 1 그 자체다. kind 는 docs 지만 Dockerfile 이 미분류로 섞여 있다.
  it('미분류가 하나라도 섞이면 kind 가 auto 라도 human', () => {
    const b = deriveTaskKindDetailed(['docs/a.md', 'Dockerfile'])
    expect(b.kind).toBe('docs')
    expect(riskClassOf(b)).toBe('human')
  })

  it('범위를 못 구했으면(경로 0개) human', () => {
    expect(riskClassOf(deriveTaskKindDetailed([]))).toBe('human')
  })

  it('사람 필수 유형은 미분류가 없어도 human', () => {
    expect(riskClassOf(deriveTaskKindDetailed(['.github/workflows/ci.yml']))).toBe('human')
  })
})

describe('단계 × 위험도 매트릭스 (§5.2)', () => {
  // 이 표의 전부는 human 열이 단계와 무관하게 같다는 것이다.
  it('human 위험도는 어느 단계에서도 완화되지 않는다', () => {
    for (const level of LEVELS) {
      expect(effectiveCeiling(level, 'human')).toBe('L0')
    }
  })

  it('auto 위험도는 단계를 그대로 쓴다', () => {
    for (const level of LEVELS) {
      expect(effectiveCeiling(level, 'auto')).toBe(level)
    }
  })

  it('L0 은 위험도와 무관하게 읽기만', () => {
    expect(effectiveCeiling('L0' as PermissionLevel, 'auto')).toBe('L0')
    expect(effectiveCeiling('L0' as PermissionLevel, 'human')).toBe('L0')
  })
})
