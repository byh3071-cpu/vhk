import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

/**
 * gh CLI 계약(contract) 테스트 — 실제 설치된 gh 바이너리의 `--help` 출력을 읽어
 * cloud push/pull 이 의존하는 서브커맨드·플래그가 여전히 존재하는지 검증한다.
 *
 * 목적: mock 기반 E2E 가 못 잡는 "gh 버전 업그레이드로 플래그가 사라짐/이름 변경" 회귀 탐지.
 * - 네트워크·인증·gist mutation 불필요 (오프라인, side-effect 0) → 일반 CI 에서 안전 실행.
 * - gh 미설치 환경(로컬 Windows 일부 등)에서는 describe.skip 으로 graceful skip.
 *
 * 실제 GitHub 왕복(gist 생성·삭제)까지 검증하는 full E2E 는 GH_TOKEN + 계정 side-effect 가
 * 필요하므로 별도 인증 CI 단계의 몫. 이 계약 테스트가 그 사이의 핵심 위험(flag churn)을 메운다.
 */

function ghHelp(args: string[]): string | null {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return null
  }
}

const ghAvailable = ghHelp(['--version']) !== null
const d = ghAvailable ? describe : describe.skip

d('gh CLI contract — cloud 가 의존하는 플래그가 실제 gh 에 존재', () => {
  it('gh api 는 --method 와 --input 지원 (원자적 purge: PATCH /gists/{id} --input body)', () => {
    const help = ghHelp(['api', '--help']) ?? ''
    expect(help).toMatch(/--method/)
    expect(help).toMatch(/--input/)
  })

  it('gh gist view 는 --files 와 --raw 지원 (목록 조회 + 복원)', () => {
    const help = ghHelp(['gist', 'view', '--help']) ?? ''
    expect(help).toMatch(/--files/)
    expect(help).toMatch(/--raw/)
  })

  it('gh gist edit 는 --add 와 --filename 지원 (백업 add/덮어쓰기)', () => {
    const help = ghHelp(['gist', 'edit', '--help']) ?? ''
    expect(help).toMatch(/--add/)
    expect(help).toMatch(/--filename/)
  })

  it('gh gist create 는 --desc 지원 (첫 백업 secret gist 생성)', () => {
    const help = ghHelp(['gist', 'create', '--help']) ?? ''
    expect(help).toMatch(/--desc/)
  })
})
