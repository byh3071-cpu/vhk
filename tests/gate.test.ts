import { describe, it, expect } from 'vitest'
import { GATE_QUESTIONS, judgeGate } from '../src/commands/gate.js'

describe('vhk gate', () => {
  it('13단계 검증 질문이 정의되어 있다', () => {
    expect(GATE_QUESTIONS).toHaveLength(13)
    expect(GATE_QUESTIONS[0]?.id).toBe(1)
    expect(GATE_QUESTIONS[12]?.id).toBe(13)
    expect(GATE_QUESTIONS.every(q => q.stage && q.question && q.failIf)).toBe(true)
  })

  it('GO: fail ≤2, hold ≤3', () => {
    expect(judgeGate(0, 0)).toBe('GO')
    expect(judgeGate(2, 3)).toBe('GO')
  })

  it('REFINE: fail 3~4', () => {
    expect(judgeGate(3, 0)).toBe('REFINE')
    expect(judgeGate(4, 0)).toBe('REFINE')
  })

  it('DROP: fail 5개 이상', () => {
    expect(judgeGate(5, 0)).toBe('DROP')
    expect(judgeGate(13, 0)).toBe('DROP')
  })

  it('hold 초과 시 GO 불가', () => {
    expect(judgeGate(0, 4)).toBe('REFINE')
  })
})
