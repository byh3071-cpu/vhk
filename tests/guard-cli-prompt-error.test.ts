import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { promptMock, deployMock } = vi.hoisted(() => ({
  promptMock: vi.fn(),
  deployMock: vi.fn(),
}))

vi.mock('../src/lib/prompt.js', () => ({ prompt: promptMock }))
vi.mock('../src/commands/deploy.js', () => ({ deploy: deployMock }))
vi.mock('../src/lib/config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/config.js')>('../src/lib/config.js')
  return {
    ...actual,
    readConfigFromProjectRoot: () => ({ ...actual.DEFAULT_CONFIG, safetyMode: 'standard' as const }),
  }
})

describe('guardCli 프롬프트 오류 신호', () => {
  let stdinTtyDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    stdinTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    promptMock.mockReset()
    deployMock.mockReset()
  })

  afterEach(() => {
    if (stdinTtyDescriptor) {
      Object.defineProperty(process.stdin, 'isTTY', stdinTtyDescriptor)
    } else {
      delete (process.stdin as NodeJS.ReadStream & { isTTY?: boolean }).isTTY
    }
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('비-abort 프롬프트 오류를 사람의 No로 위장하지 않고 exit 1로 처리한다', async () => {
    promptMock.mockRejectedValueOnce(new Error('prompt transport failed'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { runCliMain } = await import('../src/index.js')

    await runCliMain(['node', 'vhk', 'deploy'])

    expect(process.exitCode).toBe(1)
    expect(errorSpy.mock.calls.flat().join('\n')).toContain('prompt transport failed')
    expect(deployMock).not.toHaveBeenCalled()
  })
})
