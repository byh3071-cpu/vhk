import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSafeExecFile = vi.fn()
const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()

vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: (...a: unknown[]) => mockSafeExecFile(...a),
}))

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
}))

describe('brief', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/brief.js')
    expect(mod.brief).toBeDefined()
  })

  it('.vhk/brief.md를 생성한다', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'package.json')
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        name: 'p',
        version: '1.0.0',
        description: 'd',
        dependencies: { a: '1' },
        devDependencies: { b: '2', c: '3' },
      })
    )
    mockSafeExecFile.mockReturnValue({ ok: true, out: '' })
    const { brief } = await import('../src/commands/brief.js')
    await brief()

    expect(mockMkdirSync).toHaveBeenCalledWith('.vhk', { recursive: true })
    const call = mockWriteFileSync.mock.calls.find((c) =>
      String(c[0]).includes('brief.md')
    )
    expect(call).toBeDefined()
  })

  it('git 정보가 마크다운에 포함된다', async () => {
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue(JSON.stringify({}))
    mockSafeExecFile.mockImplementation((bin: string, args: string[]) => {
      const argv = args.join(' ')
      if (argv.includes('branch --show-current')) return { ok: true, out: 'main' }
      if (argv.includes('log -1')) return { ok: true, out: 'abc123 commit msg (5분 전)' }
      if (argv.includes('rev-list')) return { ok: true, out: '42' }
      if (argv.includes('status --porcelain')) return { ok: true, out: 'M file.ts' }
      return { ok: true, out: '' }
    })
    const { brief } = await import('../src/commands/brief.js')
    await brief()

    const call = mockWriteFileSync.mock.calls.find((c) =>
      String(c[0]).includes('brief.md')
    )
    const md = String(call![1])
    expect(md).toContain('main')
    expect(md).toContain('abc123')
    expect(md).toContain('42')
  })

  it('미커밋 변경 없으면 "없음 ✅" 표시', async () => {
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue(JSON.stringify({}))
    mockSafeExecFile.mockImplementation((bin: string, args: string[]) => {
      const argv = args.join(' ')
      if (argv.includes('status --porcelain')) return { ok: true, out: '' }
      return { ok: true, out: 'main' }
    })
    const { brief } = await import('../src/commands/brief.js')
    await brief()

    const md = String(mockWriteFileSync.mock.calls[0][1])
    expect(md).toContain('없음 ✅')
  })

  it('memory.json 있으면 기억 섹션 포함 (v1 배열 자동 마이그)', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('memory.json'))
    mockReadFileSync.mockImplementation((p: unknown) => {
      if (String(p).includes('memory.json'))
        return JSON.stringify([{ content: '결정-1', addedAt: '2026-01-01' }])
      return '{}'
    })
    mockSafeExecFile.mockReturnValue({ ok: true, out: '' })
    const { brief } = await import('../src/commands/brief.js')
    await brief()

    // readMemory 가 v1 디스크를 v2 로 영구화(write)하므로 brief.md 쓰기를 경로로 특정한다.
    const call = mockWriteFileSync.mock.calls.find((c) => String(c[0]).includes('brief.md'))
    const md = String(call![1])
    expect(md).toContain('저장된 기억')
    expect(md).toContain('결정-1')
  })
})
