import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockSafeExecFile = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
}))

vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: (...a: unknown[]) => mockSafeExecFile(...a),
}))

describe('ref', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/ref.js')
    expect(mod.refAdd).toBeDefined()
    expect(mod.refList).toBeDefined()
    expect(mod.refOpen).toBeDefined()
  })

  it('refAdd — 빈 URL이면 안내만 출력하고 파일은 쓰지 않는다', async () => {
    const { refAdd } = await import('../src/commands/ref.js')
    await refAdd('')
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('refAdd — 새 URL이면 .vhk/refs.json에 항목을 추가한다', async () => {
    mockExistsSync.mockReturnValue(false)
    const { refAdd } = await import('../src/commands/ref.js')
    await refAdd('https://example.com', '참고 사이트')

    expect(mockMkdirSync).toHaveBeenCalledWith('.vhk', { recursive: true })
    const call = mockWriteFileSync.mock.calls[0]
    expect(String(call[0])).toContain('refs.json')
    const data = JSON.parse(String(call[1]))
    expect(data).toHaveLength(1)
    expect(data[0].url).toBe('https://example.com')
    expect(data[0].memo).toBe('참고 사이트')
    expect(data[0].addedAt).toBeDefined()
  })

  it('refAdd — 중복 URL이면 쓰지 않는다', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ url: 'https://example.com', memo: '', addedAt: '2026-01-01' }])
    )
    const { refAdd } = await import('../src/commands/ref.js')
    await refAdd('https://example.com')
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('refList — 저장된 항목이 없으면 안내만 출력', async () => {
    mockExistsSync.mockReturnValue(false)
    const { refList } = await import('../src/commands/ref.js')
    await refList()
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })

  it('refList — 저장된 항목을 읽어 출력한다', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([
        { url: 'https://a.com', memo: 'A', addedAt: '2026-01-01T00:00:00.000Z' },
        { url: 'https://b.com', memo: '', addedAt: '2026-02-01T00:00:00.000Z' },
      ])
    )
    const logSpy = vi.spyOn(console, 'log')
    const { refList } = await import('../src/commands/ref.js')
    await refList()
    const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(joined).toContain('https://a.com')
    expect(joined).toContain('https://b.com')
  })

  it('refOpen — 유효하지 않은 인덱스면 safeExecFile을 호출하지 않는다', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ url: 'https://a.com', memo: '', addedAt: '2026-01-01' }])
    )
    const { refOpen } = await import('../src/commands/ref.js')
    await refOpen('99')
    expect(mockSafeExecFile).not.toHaveBeenCalled()
  })

  it('refOpen — 유효한 인덱스면 safeExecFile을 호출한다 (argv 분리)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ url: 'https://a.com', memo: '', addedAt: '2026-01-01' }])
    )
    mockSafeExecFile.mockReturnValue({ ok: true, out: '' })
    const { refOpen } = await import('../src/commands/ref.js')
    await refOpen('1')

    expect(mockSafeExecFile).toHaveBeenCalledTimes(1)
    const [cmd, args] = mockSafeExecFile.mock.calls[0]
    // 플랫폼별 cmd는 다르나 args에 URL이 별도 토큰으로 전달돼야 함 (shell injection 차단)
    expect(Array.isArray(args)).toBe(true)
    expect((args as string[]).includes('https://a.com')).toBe(true)
    // cmd 자체는 'open' / 'rundll32.exe' / 'xdg-open' 중 하나
    expect(['open', 'rundll32.exe', 'xdg-open']).toContain(String(cmd))
  })

  it('refOpen — http(s) 외 프로토콜은 차단', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ url: 'javascript:alert(1)', memo: '', addedAt: '2026-01-01' }])
    )
    const { refOpen } = await import('../src/commands/ref.js')
    await refOpen('1')
    expect(mockSafeExecFile).not.toHaveBeenCalled()
  })

  it('refOpen — cmd metachar 포함 URL 도 argv 분리 + 비-shell binary 로 차단', async () => {
    // Windows: rundll32.exe 가 cmd 파싱 없이 ShellExecute 호출 → & | > < % 인젝션 무효.
    // POSIX: open / xdg-open 모두 argv 분리.
    const malicious = 'https://x.com/?a=1&calc.exe'
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ url: malicious, memo: '', addedAt: '2026-01-01' }])
    )
    mockSafeExecFile.mockReturnValue({ ok: true, out: '' })
    const { refOpen } = await import('../src/commands/ref.js')
    await refOpen('1')

    // URL parse에서 통과한 경우 — 따옴표/세미콜론 포함 URL은 잘못된 URL이므로 차단됨
    // 만약 차단됐다면 safeExecFile 안 호출
    // 만약 호출됐다면 args에 별도 토큰으로 들어가 shell 해석 없음
    if (mockSafeExecFile.mock.calls.length > 0) {
      const args = mockSafeExecFile.mock.calls[0][1] as string[]
      // URL이 args의 한 요소로 들어감 → shell metachar 분리 안 됨
      expect(args.some((a) => a.includes('calc.exe') && !a.includes('http'))).toBe(false)
      expect(args.includes(malicious)).toBe(true)
    }
  })
})
