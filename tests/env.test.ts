import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockAppendFileSync = vi.fn()
const mockReaddirSync = vi.fn(() => [] as string[])

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  appendFileSync: (...a: unknown[]) => mockAppendFileSync(...a),
  readdirSync: (...a: unknown[]) => mockReaddirSync(...a),
}))

describe('env', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mockReaddirSync.mockReturnValue([]) // 기본 — env 파일 없음
    process.exitCode = 0
  })
  afterEach(() => {
    process.exitCode = 0 // 누수 방지
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

  it('#247: .env 없고 .env.local 있으면 .env.local 로 폴백 (.env.example 생성)', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === '.env.local')
    mockReadFileSync.mockReturnValue('API_KEY=secret\nDB_URL=postgres')
    const { env } = await import('../src/commands/env.js')
    await env()
    // .env.local 을 읽어야 함 (.env 폴백)
    const readCall = mockReadFileSync.mock.calls.find((c) => String(c[0]) === '.env.local')
    expect(readCall).toBeDefined()
    const exampleCall = mockWriteFileSync.mock.calls.find((c) => String(c[0]) === '.env.example')
    expect(exampleCall).toBeDefined()
    expect(String(exampleCall![1])).toContain('API_KEY=')
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
    mockReaddirSync.mockReturnValue(['.env.example', '.env'])
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

  it('VHK-010: envCheck 누락 변수 있으면 process.exitCode=1', async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const s = String(p)
      return s === '.env.example' || s === '.env' || s === '.gitignore'
    })
    mockReaddirSync.mockReturnValue(['.env.example', '.env'])
    mockReadFileSync.mockImplementation((p: unknown) => {
      const s = String(p)
      if (s === '.env.example') return 'API_KEY=\nMISSING_KEY='
      if (s === '.env') return 'API_KEY=value'
      if (s === '.gitignore') return '.env\n'
      return ''
    })
    const { envCheck } = await import('../src/commands/env.js')
    await envCheck()
    expect(process.exitCode).toBe(1)
  })

  it('VHK-009: .env 없고 .env.local 에 키 정의 → 누락 아님(거짓양성 0) + exitCode 0', async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const s = String(p)
      return s === '.env.example' || s === '.env.local' || s === '.gitignore'
    })
    mockReaddirSync.mockReturnValue(['.env.example', '.env.local']) // .env 없음
    mockReadFileSync.mockImplementation((p: unknown) => {
      const s = String(p)
      if (s === '.env.example') return 'ANTHROPIC_API_KEY=\nGYO_MODEL='
      if (s === '.env.local') return 'ANTHROPIC_API_KEY=sk-x\nGYO_MODEL=opus'
      if (s === '.gitignore') return '.env.local\n'
      return ''
    })
    const logSpy = vi.spyOn(console, 'log')
    const { envCheck } = await import('../src/commands/env.js')
    await envCheck()
    const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logs).toContain('모든 필수 환경변수') // 누락 0
    expect(logs).not.toContain('누락된 환경변수')
    expect(process.exitCode).toBe(0)
  })

  it('loadDefinedEnvKeys: .env + .env.local 머지, .example 제외', async () => {
    mockReaddirSync.mockReturnValue(['.env', '.env.local', '.env.example', '.env.sample'])
    mockReadFileSync.mockImplementation((p: unknown) => {
      const s = String(p)
      if (s === '.env') return 'A='
      if (s === '.env.local') return 'B='
      if (s === '.env.example') return 'SHOULD_NOT_APPEAR='
      if (s === '.env.sample') return 'NOR_THIS='
      return ''
    })
    const { loadDefinedEnvKeys } = await import('../src/commands/env.js')
    const keys = loadDefinedEnvKeys()
    expect(keys).toContain('A')
    expect(keys).toContain('B')
    expect(keys).not.toContain('SHOULD_NOT_APPEAR')
    expect(keys).not.toContain('NOR_THIS')
  })

  it('VHK-010: envCheck 누락 없으면 exitCode 0 유지', async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const s = String(p)
      return s === '.env.example' || s === '.env' || s === '.gitignore'
    })
    mockReaddirSync.mockReturnValue(['.env.example', '.env'])
    mockReadFileSync.mockImplementation((p: unknown) => {
      const s = String(p)
      if (s === '.env.example') return 'API_KEY=\nDB_URL='
      if (s === '.env') return 'API_KEY=v\nDB_URL=v'
      if (s === '.gitignore') return '.env\n'
      return ''
    })
    const { envCheck } = await import('../src/commands/env.js')
    await envCheck()
    expect(process.exitCode).toBe(0)
  })
})
