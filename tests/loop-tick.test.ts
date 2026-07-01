import { describe, it, expect } from 'vitest'
import { computeLoopTick, type LoopTickState } from '../src/commands/loop.js'
import { KNOWN_COMMAND_TOKENS } from '../src/lib/cli-args.js'

// N1(ⓐ): computeLoopTick 순수함수 — 결정적 우선순위 사다리 검증.

function state(over: Partial<LoopTickState> = {}): LoopTickState {
  return {
    hardStop: false,
    activeBlockers: 0,
    blockerThreshold: 3,
    evolvePending: 0,
    unqueuedPatterns: 0,
    trendDelta: null,
    activeGoalId: null,
    ...over,
  }
}

describe('computeLoopTick 우선순위 사다리', () => {
  it('HARD_STOP 최우선 (블로커·진화보다 위)', () => {
    const c = computeLoopTick(state({ hardStop: true, activeBlockers: 5, evolvePending: 3 }))
    expect(c.nextMove.priority).toBe('HARD_STOP')
    expect(c.nextMove.command).toBe('vhk resume --confirm')
  })

  it('블로커 임계 > 진화 대기', () => {
    const c = computeLoopTick(state({ activeBlockers: 3, blockerThreshold: 3, evolvePending: 2 }))
    expect(c.nextMove.priority).toBe('블로커 임계')
  })

  it('진화 대기 > 추세 악화', () => {
    const c = computeLoopTick(state({ evolvePending: 1, trendDelta: 0.5 }))
    expect(c.nextMove.priority).toBe('진화 대기')
    expect(c.nextMove.command).toBe('vhk evolve list')
  })

  it('추세 악화 > 미제안 패턴', () => {
    const c = computeLoopTick(state({ trendDelta: 0.5, unqueuedPatterns: 2 }))
    expect(c.nextMove.priority).toBe('추세 악화')
    expect(c.nextMove.command).toBe('vhk stats --trend')
  })

  it('미제안 패턴 > 정상', () => {
    const c = computeLoopTick(state({ unqueuedPatterns: 2, activeGoalId: 5 }))
    expect(c.nextMove.priority).toBe('패턴 감지')
    expect(c.nextMove.command).toBe('vhk evolve suggest')
  })

  it('정상 + active goal → work', () => {
    const c = computeLoopTick(state({ activeGoalId: 88 }))
    expect(c.nextMove.priority).toBe('정상')
    expect(c.nextMove.command).toBe('vhk work')
    expect(c.nextMove.action).toContain('88')
  })

  it('정상 + goal 없음 → goal peek', () => {
    const c = computeLoopTick(state())
    expect(c.nextMove.command).toBe('vhk goal peek')
  })

  it('닫힌 신호 집계 (모두 정상 + 추세 비악화)', () => {
    const c = computeLoopTick(state({ trendDelta: -0.1 }))
    expect(c.closed).toContain('HARD_STOP 없음')
    expect(c.closed).toContain('블로커 0')
    expect(c.closed).toContain('진화 대기 0')
    expect(c.closed).toContain('추세 비악화')
    expect(c.closed).toContain('미제안 패턴 0')
  })

  it('trendDelta 양수(악화) → 추세 비악화 신호 미포함', () => {
    const c = computeLoopTick(state({ trendDelta: 0.3 }))
    expect(c.closed).not.toContain('추세 비악화')
  })

  it('trendDelta null(표본부족) → 추세 신호 미포함 (모름을 정상으로 위장 안 함)', () => {
    const c = computeLoopTick(state({ trendDelta: null }))
    expect(c.closed).not.toContain('추세 비악화')
  })
})

describe('loop 명령 등록 (NL 라우터 가드)', () => {
  it('영문·한글 별칭이 KNOWN_COMMAND_TOKENS 에 등록됨 — 없으면 NL 라우터가 가로챔', () => {
    expect(KNOWN_COMMAND_TOKENS.has('loop')).toBe(true)
    expect(KNOWN_COMMAND_TOKENS.has('틱')).toBe(true)
  })
})
