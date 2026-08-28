import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { dispatchNlpRoute, runNaturalLanguageRoute } from '../src/lib/nlp-run.js'

const { doctorMock, policyCheckMock } = vi.hoisted(() => ({
  doctorMock: vi.fn(async () => {}),
  policyCheckMock: vi.fn(() => {}),
}))
vi.mock('../src/commands/doctor.js', () => ({ doctor: doctorMock }))
vi.mock('../src/commands/policy.js', () => ({ policyCheck: policyCheckMock, policyShow: vi.fn() }))

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

  it('doctor 자연어의 --diff 의미를 DoctorOptions로 전달', async () => {
    await dispatchNlpRoute({
      command: 'doctor',
      explanation: '설정 불일치 전체 차이',
      confidence: 'high',
      args: ['--diff'],
    }, '규칙 불일치 전체 보여줘')
    expect(doctorMock).toHaveBeenCalledWith({ diff: true })
  })

  it('policy check 자연어가 추출한 argv를 그대로 판정기에 전달', async () => {
    await dispatchNlpRoute({
      command: 'policy',
      explanation: '명령 허용 여부',
      confidence: 'high',
      args: ['check', 'pnpm', 'test:run', '--coverage'],
    }, 'pnpm test:run --coverage 실행 가능해?')
    expect(policyCheckMock).toHaveBeenCalledWith(['pnpm', 'test:run', '--coverage'])
  })

  it('비-TTY의 policy baseline 자연어는 프롬프트를 열지 않고 TTY_REQUIRED로 안내한다', async () => {
    const prior = process.env.VHK_FORCE_INTERACTIVE
    delete process.env.VHK_FORCE_INTERACTIVE
    try {
      await runNaturalLanguageRoute('정책 기준선 고정해줘')
      expect(process.exitCode).toBe(2)
      expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('TTY_REQUIRED')
    } finally {
      if (prior === undefined) delete process.env.VHK_FORCE_INTERACTIVE
      else process.env.VHK_FORCE_INTERACTIVE = prior
    }
  })
})
