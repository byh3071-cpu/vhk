import { describe, it, expect } from 'vitest'
import type { FailEntry } from '../src/commands/memory.js'

// goal 69: vhk evolve negatives — failures 버킷 + troubleshooting → ❌ 부정예시 후보(.vhk/negative-candidates.md)
// 순수함수 직접 검증(fs/memory mock 우회) — 결정적·부수효과 0.

const fail = (over: Partial<FailEntry>): FailEntry => ({
  id: 'f1',
  content: '',
  tags: [],
  createdAt: '2026-06-16T00:00:00Z',
  status: 'active',
  ...over,
})

describe('evolve negatives — 순수함수 (goal 69)', () => {
  it('buildNegativeFromFailure: content + why → "❌ 하지 마라: … — 이유: …"', async () => {
    const { buildNegativeFromFailure } = await import('../src/commands/evolve.js')
    const out = buildNegativeFromFailure(fail({ content: 'main 에 직접 push', why: '브랜치 보호 우회' }))
    expect(out).toBe('❌ 하지 마라: main 에 직접 push — 이유: 브랜치 보호 우회')
  })

  it('buildNegativeFromFailure: why 없으면 이유 절 생략', async () => {
    const { buildNegativeFromFailure } = await import('../src/commands/evolve.js')
    expect(buildNegativeFromFailure(fail({ content: 'execSync 신규 사용' }))).toBe('❌ 하지 마라: execSync 신규 사용')
  })

  it('buildNegativeFromFailure: content 비면 lesson 폴백', async () => {
    const { buildNegativeFromFailure } = await import('../src/commands/evolve.js')
    expect(buildNegativeFromFailure(fail({ content: '', lesson: '빈 catch 금지' }))).toBe('❌ 하지 마라: 빈 catch 금지')
  })

  it('extractTsTitle: 첫 H1 추출', async () => {
    const { extractTsTitle } = await import('../src/commands/evolve.js')
    expect(extractTsTitle('---\nid: TS-001\n---\n\n# Windows cmd shim EINVAL\n\n본문')).toBe('Windows cmd shim EINVAL')
  })

  it('extractTsTitle: H1 없으면 null', async () => {
    const { extractTsTitle } = await import('../src/commands/evolve.js')
    expect(extractTsTitle('본문만 있고 헤딩 없음')).toBeNull()
  })

  it('renderNegativeCandidates: failures + troubleshooting 양쪽 렌더', async () => {
    const { renderNegativeCandidates } = await import('../src/commands/evolve.js')
    const md = renderNegativeCandidates(
      [fail({ content: 'main 직접 push', why: '보호 우회' })],
      [{ id: 'TS-001', title: 'cmd shim EINVAL' }],
    )
    expect(md).toContain('❌ 하지 마라: main 직접 push — 이유: 보호 우회')
    expect(md).toContain('❌ 반복 금지: cmd shim EINVAL (출처: TS-001)')
  })

  it('renderNegativeCandidates: 빈 입력 → graceful 안내(크래시 0)', async () => {
    const { renderNegativeCandidates } = await import('../src/commands/evolve.js')
    const md = renderNegativeCandidates([], [])
    expect(md).toContain('수집된 실패 교훈 없음')
    expect(md).toContain('트러블슈팅 기록 없음')
  })
})
