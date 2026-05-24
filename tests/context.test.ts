import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockReaddirSync = vi.fn()
const mockStatSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  readdirSync: (...a: unknown[]) => mockReaddirSync(...a),
  statSync: (...a: unknown[]) => mockStatSync(...a),
}))

describe('context', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/context.js')
    expect(mod.context).toBeDefined()
    expect(mod.contextShow).toBeDefined()
  })

  it('context — .vhk/context.md를 생성한다', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('package.json'))
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        name: 'test-pkg',
        version: '1.2.3',
        dependencies: { next: '15.0.0', typescript: '5.5.0' },
        devDependencies: { vitest: '2.0.0' },
      })
    )
    mockReaddirSync.mockReturnValue([])
    mockStatSync.mockReturnValue({ isDirectory: () => false })

    const { context } = await import('../src/commands/context.js')
    await context()

    expect(mockMkdirSync).toHaveBeenCalledWith('.vhk', { recursive: true })
    const call = mockWriteFileSync.mock.calls.find((c) =>
      String(c[0]).includes('context.md')
    )
    expect(call).toBeDefined()
    const md = String(call![1])
    expect(md).toContain('# 프로젝트 컨텍스트')
    expect(md).toContain('Next.js')
    expect(md).toContain('TypeScript')
    expect(md).toContain('vitest')
    expect(md).toContain('test-pkg')
    expect(md).toContain('1.2.3')
    expect(md).toContain('vhk context')
  })

  it('context — node_modules / .git 등은 트리에서 제외', async () => {
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue('{}')
    mockReaddirSync.mockImplementation((dir: unknown) => {
      if (dir === '.') return ['src', 'node_modules', '.git', 'package.json']
      return []
    })
    mockStatSync.mockImplementation((p: unknown) => ({
      isDirectory: () => String(p) === 'src' || String(p).endsWith('node_modules') || String(p).endsWith('.git'),
    }))

    const { context } = await import('../src/commands/context.js')
    await context()

    const call = mockWriteFileSync.mock.calls.find((c) =>
      String(c[0]).includes('context.md')
    )
    const md = String(call![1])
    expect(md).toContain('src')
    expect(md).not.toContain('node_modules/')
    expect(md).not.toContain('.git/')
  })

  it('contextShow — 파일 없으면 안내만, readFileSync 호출 X', async () => {
    mockExistsSync.mockReturnValue(false)
    const { contextShow } = await import('../src/commands/context.js')
    await contextShow()
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })

  it('contextShow — 파일 있으면 내용을 출력한다', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('# 컨텍스트\n\n내용')
    const logSpy = vi.spyOn(console, 'log')
    const { contextShow } = await import('../src/commands/context.js')
    await contextShow()
    const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(joined).toContain('# 컨텍스트')
  })
})
