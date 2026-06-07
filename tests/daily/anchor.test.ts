import { describe, it, expect } from 'vitest'
import { buildAnchorLines } from '../../src/daily/anchor.js'

// Goal 32 Phase 3 — 터미널 자동실행 앵커는 "붙여넣을 줄"을 만들기만 한다(출력 전용).
// rc 파일은 절대 자동 수정하지 않는다(사람이 직접 붙여넣음). 여기선 줄 내용만 단언.

describe('buildAnchorLines — 자동실행 앵커 줄(출력 전용)', () => {
  const lines = buildAnchorLines()

  it('bash 줄은 vhk standup --if-stale 를 실행', () => {
    expect(lines.bash).toContain('vhk standup --if-stale')
  })

  it('bash 줄은 vhk 미설치 환경에서 안전하다 (command -v 가드)', () => {
    expect(lines.bash).toMatch(/command -v vhk/)
  })

  it('powershell 줄은 vhk standup --if-stale 를 실행', () => {
    expect(lines.powershell).toContain('vhk standup --if-stale')
  })

  it('powershell 줄은 vhk 미설치 환경에서 안전하다 (Get-Command 가드)', () => {
    expect(lines.powershell).toMatch(/Get-Command vhk/)
  })
})
