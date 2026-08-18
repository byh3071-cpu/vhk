import { describe, it, expect } from 'vitest'
// @ts-expect-error — 게이트 스크립트는 .mjs 라 타입 선언이 없다(빌드 산출물 아님).
import { judge, classify, BYPASS_TOKEN } from '../scripts/check-pr-record.mjs'

/*
 * #526 — 원격 에이전트·CI 가 기록 집행 사각지대인 문제.
 *
 * 로컬 훅이 요구하는 세션 기록은 docs/devlog/ 와 .vhk/events/*.jsonl 로 전부 비추적이라
 * 클론만 받는 CI 는 존재 자체를 볼 수 없다. 그래서 추적되는 공개 기록물로 축을 바꿨고,
 * 그 판정 규칙을 여기서 고정한다.
 */

describe('check-pr-record (#526)', () => {
  it('코드 변경이 없으면 검사 대상이 아니다', () => {
    const r = judge(['docs/adr/ADR-001.md'], ['docs: ADR 추가'])
    expect(r.ok).toBe(true)
    expect(r.reason).toContain('검사 대상 아님')
  })

  it('코드 변경에 기록물이 동반되면 통과', () => {
    const r = judge(['src/commands/foo.ts', 'CHANGELOG.md'], ['fix: foo'])
    expect(r.ok).toBe(true)
  })

  it('코드만 바뀌고 기록물이 없으면 차단', () => {
    const r = judge(['src/commands/foo.ts', 'tests/foo.test.ts'], ['fix: foo'])
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('기록물 변경이 없습니다')
  })

  it('우회 토큰이 있으면 통과 — 로컬 훅과 같은 탈출구', () => {
    const r = judge(['src/commands/foo.ts'], ['fix: 오타\n\n[skip-record]'])
    expect(r.ok).toBe(true)
    expect(r.reason).toContain(BYPASS_TOKEN)
  })

  // 테스트만 있는 PR 은 기록 요구 대상이 아니다 — 과안정화 경계(로컬 훅의 CODE_GLOBS 와 같은 판단).
  it('tests 만 바뀌면 검사 대상이 아니다', () => {
    expect(judge(['tests/a.test.ts'], ['test: 추가']).ok).toBe(true)
  })

  it('scripts 변경도 코드로 센다 — 게이트 자체가 바뀌는 경우', () => {
    const { code } = classify(['scripts/check-foo.mjs'])
    expect(code).toEqual(['scripts/check-foo.mjs'])
    expect(judge(['scripts/check-foo.mjs'], ['chore: 게이트 수정']).ok).toBe(false)
  })

  it('docs 하위는 어느 경로든 기록으로 인정', () => {
    for (const rec of ['docs/rfc/0001-x.md', 'docs/troubleshooting/TS-001.md', 'docs/patterns/PAT-001.md']) {
      expect(judge(['src/a.ts', rec], ['fix: a']).ok).toBe(true)
    }
  })
})
