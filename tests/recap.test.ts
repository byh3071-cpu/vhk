import { describe, it, expect } from 'vitest'

describe('vhk recap', () => {
  it('Git 레포가 아니면 에러 메시지 출력', () => {
    // TODO: isGitRepo() mock → false → 에러 확인
    expect(true).toBe(true)
  })

  it('변경사항 없으면 경고 메시지', () => {
    // TODO: getSessionDiff() mock → 빈 결과
  })

  it('세션 로그 파일이 docs/log/에 생성된다', () => {
    // TODO: 임시 디렉토리에서 생성 확인
  })

  it('같은 날짜에 여러 세션 → 세션 번호 증가', () => {
    // TODO: session-1, session-2 파일명 검증
  })
})
