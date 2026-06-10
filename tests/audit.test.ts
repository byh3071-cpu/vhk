import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSafeExecFile = vi.fn()
const mockExistsSync = vi.fn()
const mockPrompt = vi.fn()

vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: (...a: unknown[]) => mockSafeExecFile(...a),
}))

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
}))

vi.mock('inquirer', () => ({
  default: { prompt: (...a: unknown[]) => mockPrompt(...a) },
}))

vi.mock('ora', () => ({
  default: () => ({
    start: () => ({
      succeed: () => {},
      fail: () => {},
      warn: () => {},
      stop: () => {},
    }),
  }),
}))

describe('audit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mockExistsSync.mockReturnValue(false) // npm 기본
  })

  afterEach(() => {
    delete process.env.VHK_FORCE_INTERACTIVE // #244: 테스트 간 TTY 시뮬레이션 누수 방지
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/audit.js')
    expect(mod.audit).toBeDefined()
  })

  it('취약점 0건이면 자동 fix 호출 없음', async () => {
    mockSafeExecFile.mockReturnValue({
      ok: true,
      out: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }),
    })
    const { audit } = await import('../src/commands/audit.js')
    await audit(false)
    expect(mockSafeExecFile).toHaveBeenCalledTimes(1)
  })

  it('autoFix=true + npm 환경이면 critical/high 없어도 npm audit fix를 호출한다', async () => {
    mockSafeExecFile.mockReturnValue({
      ok: true,
      out: JSON.stringify({
        metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 2, low: 0, total: 2 } },
      }),
    })
    const { audit } = await import('../src/commands/audit.js')
    await audit(true)
    const fixCall = mockSafeExecFile.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('fix')
    )
    expect(fixCall).toBeDefined()
    expect(fixCall![0]).toBe('npm')
  })

  it('critical/high가 있고 autoFix=false면 (TTY) 사용자에게 fix 여부를 묻는다', async () => {
    process.env.VHK_FORCE_INTERACTIVE = '1' // #244: TTY 시뮬레이션 — 프롬프트 경로 검증
    mockSafeExecFile.mockReturnValue({
      ok: true,
      out: JSON.stringify({
        metadata: { vulnerabilities: { critical: 1, high: 0, moderate: 0, low: 0, total: 1 } },
      }),
    })
    mockPrompt.mockResolvedValue({ shouldFix: false })
    const { audit } = await import('../src/commands/audit.js')
    await audit(false)
    expect(mockPrompt).toHaveBeenCalled()
  })

  it('#244: 비-TTY(CI/agent) + critical/high + autoFix=false면 프롬프트 없이 report-only(fix 호출 안 함)', async () => {
    // VHK_FORCE_INTERACTIVE 미설정 = 비-TTY → promptOrDefault 가 prompt 호출 없이 false 폴백.
    mockSafeExecFile.mockReturnValue({
      ok: true,
      out: JSON.stringify({
        metadata: { vulnerabilities: { critical: 2, high: 1, moderate: 0, low: 0, total: 3 } },
      }),
    })
    const { audit } = await import('../src/commands/audit.js')
    await audit(false)
    expect(mockPrompt).not.toHaveBeenCalled() // hang 안 함
    const fixCall = mockSafeExecFile.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('fix')
    )
    expect(fixCall).toBeUndefined() // report-only — 자동 수정 안 함
  })

  it('exit code !=0지만 stdout에 JSON이 담겨도 파싱한다 (safeExecFile err 경로)', async () => {
    process.env.VHK_FORCE_INTERACTIVE = '1' // TTY 시뮬레이션 — 파싱 성공 시 프롬프트 도달 확인
    mockSafeExecFile.mockReturnValue({
      ok: false,
      err: 'audit exit 1',
      out: JSON.stringify({ metadata: { vulnerabilities: { high: 3, total: 3 } } }),
    })
    mockPrompt.mockResolvedValue({ shouldFix: false })
    const { audit } = await import('../src/commands/audit.js')
    await audit(false)
    expect(mockPrompt).toHaveBeenCalled()
  })

  it('pnpm 프로젝트면 pnpm audit를 호출한다', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'pnpm-lock.yaml')
    mockSafeExecFile.mockReturnValue({
      ok: true,
      out: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }),
    })
    const { audit } = await import('../src/commands/audit.js')
    await audit(false)
    expect(mockSafeExecFile.mock.calls[0][0]).toBe('pnpm')
  })

  it('autoFix=true + pnpm 환경이면 audit fix를 호출하지 않고 안내만 출력', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'pnpm-lock.yaml')
    mockSafeExecFile.mockReturnValue({
      ok: true,
      out: JSON.stringify({
        metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 1, low: 0, total: 1 } },
      }),
    })
    const { audit } = await import('../src/commands/audit.js')
    await audit(true)
    const fixCall = mockSafeExecFile.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('fix')
    )
    expect(fixCall).toBeUndefined()
  })
})
