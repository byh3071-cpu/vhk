import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { runNaturalLanguageRoute } from '../src/lib/nlp-run.js'

// #346: 미인식 명령(vhk zzzz 등)이 exit 0 으로 '성공' 처리되던 회귀 방지.
// NL 미매칭은 실패(process.exitCode=1) + stderr 안내여야 한다.

describe('runNaturalLanguageRoute 미인식 — exit 1 (#346)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.exitCode = 0 // 다른 테스트 오염 방지
    vi.restoreAllMocks()
  })

  it('미인식 입력은 process.exitCode=1 로 실패 신호 (stdout 아님)', async () => {
    await runNaturalLanguageRoute('zzzz존재하지않는명령qqq')
    expect(process.exitCode).toBe(1)
  })
})
