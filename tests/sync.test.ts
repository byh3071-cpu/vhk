import { describe, it, expect } from 'vitest'

describe('vhk sync', () => {
  it('RULES.md 없으면 경고 메시지', () => {
    // TODO: RULES.md 없는 디렉토리에서 실행
    expect(true).toBe(true)
  })

  it('RULES.md → .cursorrules 변환', () => {
    // TODO: 파싱 로직 단위 테스트
  })

  it('CLAUDE.md의 "현재 상태" 섹션이 보존된다', () => {
    // TODO: 기존 상태 섹션이 덮어써지지 않는지 확인
  })
})
