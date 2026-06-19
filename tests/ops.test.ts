import { describe, it, expect } from 'vitest'

// goal 76: vhk ops — 제품 한 줄(VISION What) → 운영 현황 체크리스트 + 운영 회고·다음 결정 초안 생성 프롬프트(.vhk/ops-prompt.md)
// 순수함수 buildOpsPrompt 직접 검증 — Fable5 프롬프트 위생(good/bad 쌍·수치 하드리밋·중단/삭제 금지) 회귀 고정.

describe('ops — buildOpsPrompt 순수함수 (goal 76)', () => {
  it('제품 한 줄(what)이 프롬프트에 들어가고 운영 체크리스트·다음 결정 지시 포함', async () => {
    const { buildOpsPrompt } = await import('../src/commands/ops.js')
    const p = buildOpsPrompt({ what: '3초에 할 일 추가하는 앱' })
    expect(p).toContain('3초에 할 일 추가하는 앱')
    expect(p).toContain('체크리스트')
    expect(p).toContain('운영 회고')
    expect(p).toMatch(/유지|피벗|아카이브/)
  })

  it('what 미지정 시 graceful 안내(크래시 0, 구조 유지)', async () => {
    const { buildOpsPrompt } = await import('../src/commands/ops.js')
    const p = buildOpsPrompt({})
    expect(p).toContain('VISION')
    expect(p).toContain('체크리스트')
  })

  it('Fable5 하드리밋 — 사람 승인 전 제품 중단·삭제 금지(치명 규칙)', async () => {
    const { buildOpsPrompt } = await import('../src/commands/ops.js')
    const p = buildOpsPrompt({ what: 'x' })
    expect(p).toMatch(/승인 전.*(중단|삭제).*(금지|마)/)
  })

  it('Fable5 하드리밋 — 수치 상한(액션 ≤3개)', async () => {
    const { buildOpsPrompt } = await import('../src/commands/ops.js')
    const p = buildOpsPrompt({ what: 'x' })
    expect(p).toMatch(/≤\s*3|3종|3개/)
  })

  it('Fable5 good/bad 예시쌍(✅/❌) 포함', async () => {
    const { buildOpsPrompt } = await import('../src/commands/ops.js')
    const p = buildOpsPrompt({ what: 'x' })
    expect(p).toContain('✅')
    expect(p).toContain('❌')
  })
})
