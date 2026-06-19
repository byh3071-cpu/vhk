import { describe, it, expect } from 'vitest'

// goal 75: vhk launch — 제품 한 줄(VISION What) → 런칭 준비 체크리스트 + 게시물/채널별 변형 초안 생성 프롬프트(.vhk/launch-prompt.md)
// 순수함수 buildLaunchPrompt 직접 검증 — Fable5 프롬프트 위생(good/bad 쌍·수치 하드리밋·발송금지) 회귀 고정.

describe('launch — buildLaunchPrompt 순수함수 (goal 75)', () => {
  it('제품 한 줄(what)이 프롬프트에 들어가고 런칭 체크리스트·채널 변형 지시 포함', async () => {
    const { buildLaunchPrompt } = await import('../src/commands/launch.js')
    const p = buildLaunchPrompt({ what: '3초에 할 일 추가하는 앱' })
    expect(p).toContain('3초에 할 일 추가하는 앱')
    expect(p).toContain('체크리스트')
    expect(p).toContain('런칭 게시물')
    expect(p).toContain('채널')
  })

  it('what 미지정 시 graceful 안내(크래시 0, 구조 유지)', async () => {
    const { buildLaunchPrompt } = await import('../src/commands/launch.js')
    const p = buildLaunchPrompt({})
    expect(p).toContain('VISION')
    expect(p).toContain('체크리스트')
  })

  it('Fable5 하드리밋 — 사람 승인 전 게시·발송 금지(치명 규칙)', async () => {
    const { buildLaunchPrompt } = await import('../src/commands/launch.js')
    const p = buildLaunchPrompt({ what: 'x' })
    expect(p).toMatch(/승인 전.*(게시|발송).*(금지|마)/)
  })

  it('Fable5 하드리밋 — 수치 상한(변형 ≤3 · X 글자수)', async () => {
    const { buildLaunchPrompt } = await import('../src/commands/launch.js')
    const p = buildLaunchPrompt({ what: 'x' })
    expect(p).toMatch(/≤\s*3|3종|3개/)
    expect(p).toMatch(/\d+자/)
  })

  it('Fable5 good/bad 예시쌍(✅/❌) 포함', async () => {
    const { buildLaunchPrompt } = await import('../src/commands/launch.js')
    const p = buildLaunchPrompt({ what: 'x' })
    expect(p).toContain('✅')
    expect(p).toContain('❌')
  })
})
