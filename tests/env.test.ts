import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockAppendFileSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  appendFileSync: (...a: unknown[]) => mockAppendFileSync(...a),
}))

describe('env', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('parseEnvKeys: 일반 키 추출', async () => {
    const { parseEnvKeys } = await import('../src/commands/env.js')
    const result = parseEnvKeys('API_KEY=abc\nDB_URL=postgres://...\nSECRET=xyz')
    expect(result).toEqual(['API_KEY', 'DB_URL', 'SECRET'])
  })

  it('parseEnvKeys: 빈 줄/주석 무시', async () => {
    const { parseEnvKeys } = await import('../src/commands/env.js')
    const result = parseEnvKeys('# comment\n\nAPI_KEY=abc\n# another comment\nDB_URL=xyz\n')
    expect(result).toEqual(['API_KEY', 'DB_URL'])
  })

  it('parseEnvKeys: 공백/빈 값 처리', async () => {
    const { parseEnvKeys } = await import('../src/commands/env.js')
    const result = parseEnvKeys('  API_KEY  =  value  \nDB_URL=\n  ')
    expect(result).toEqual(['API_KEY', 'DB_URL'])
  })

  it('env: .env 없으면 경고 후 종료', async () => {
    mockExistsSync.mockReturnValue(false)
    const { env } = await import('../src/commands/env.js')
    await env()
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('env: .env 있으면 .env.example 생성 (값 비움)', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === '.env')
    mockReadFileSync.mockReturnValue('API_KEY=secret\nDB_URL=postgres')
    const { env } = await import('../src/commands/env.js')
    await env()
    // .env.example 쓰기 호출 확인
    const exampleCall = mockWriteFileSync.mock.calls.find(
      (c) => String(c[0]) === '.env.example'
    )
    expect(exampleCall).toBeDefined()
    expect(String(exampleCall![1])).toContain('API_KEY=')
    expect(String(exampleCall![1])).toContain('DB_URL=')
    // 값은 비어 있어야 함
    expect(String(exampleCall![1])).not.toContain('secret')
    expect(String(exampleCall![1])).not.toContain('postgres')
  })

  it('envCheck: .env.example 없으면 경고', async () => {
    mockExistsSync.mockReturnValue(false)
    const { envCheck } = await import('../src/commands/env.js')
    await envCheck()
    // 어떤 파일도 쓰지 않음
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('envCheck: 누락 키가 있으면 console.log에 누락 표시', async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const s = String(p)
      return s === '.env.example' || s === '.env' || s === '.gitignore'
    })
    mockReadFileSync.mockImplementation((p: unknown) => {
      const s = String(p)
      if (s === '.env.example') return 'API_KEY=\nDB_URL=\nMISSING_KEY='
      if (s === '.env') return 'API_KEY=value\nDB_URL=value'
      if (s === '.gitignore') return '.env\nnode_modules/\n'
      return ''
    })
    const logSpy = vi.spyOn(console, 'log')
    const { envCheck } = await import('../src/commands/env.js')
    await envCheck()
    const allLogs = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(allLogs).toContain('MISSING_KEY')
  })
})
