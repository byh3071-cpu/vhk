import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecSync = vi.fn()
const mockPrompt = vi.fn()

vi.mock('node:child_process', () => ({
  execSync: (...a: unknown[]) => mockExecSync(...a),
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
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/audit.js')
    expect(mod.audit).toBeDefined()
  })

  it('취약점 0건이면 자동 fix 호출 없음', async () => {
    mockExecSync.mockReturnValue(
      Buffer.from(JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }))
    )
    const { audit } = await import('../src/commands/audit.js')
    await audit(false)
    expect(mockExecSync).toHaveBeenCalledTimes(1)
  })

  it('autoFix=true면 critical/high 없어도 npm audit fix를 호출한다', async () => {
    mockExecSync.mockReturnValue(
      Buffer.from(
        JSON.stringify({
          metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 2, low: 0, total: 2 } },
        })
      )
    )
    const { audit } = await import('../src/commands/audit.js')
    await audit(true)
    const fixCall = mockExecSync.mock.calls.find((c) => String(c[0]).includes('audit fix'))
    expect(fixCall).toBeDefined()
  })

  it('critical/high가 있고 autoFix=false면 사용자에게 fix 여부를 묻는다', async () => {
    mockExecSync.mockReturnValue(
      Buffer.from(
        JSON.stringify({
          metadata: { vulnerabilities: { critical: 1, high: 0, moderate: 0, low: 0, total: 1 } },
        })
      )
    )
    mockPrompt.mockResolvedValue({ shouldFix: false })
    const { audit } = await import('../src/commands/audit.js')
    await audit(false)
    expect(mockPrompt).toHaveBeenCalled()
  })

  it('npm audit가 exit code 1로 throw해도 stdout을 읽어 파싱한다', async () => {
    const err = Object.assign(new Error('audit nonzero'), {
      stdout: Buffer.from(
        JSON.stringify({ metadata: { vulnerabilities: { high: 3, total: 3 } } })
      ),
    })
    mockExecSync.mockImplementationOnce(() => {
      throw err
    })
    mockPrompt.mockResolvedValue({ shouldFix: false })
    const { audit } = await import('../src/commands/audit.js')
    await audit(false)
    expect(mockPrompt).toHaveBeenCalled()
  })
})
