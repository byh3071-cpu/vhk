import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
  // writeMemory(readMemory 의 v1 자동 마이그)가 쓰는 fs — 시드가 v1 일 때 throw 방지(durability).
  copyFileSync: () => undefined,
  renameSync: () => undefined,
  rmSync: () => undefined,
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

  // gh#289 수정: goals/blockers/memory 가 전부 비어있는(신규·희소 프로젝트) 상태에서도
  // context.md 가 크래시 없이 생성되고, "작업상태" 폴백(최근 git 커밋)이 실제로 나오는지 확인.
  // (최초 재현 시점엔 이 폴백이 없어 gh#289 제보가 그대로 유효했음 — 이번에 폴백을 추가해 수정.)
  it('context — goals/blockers/memory 전부 비어있으면 최근 git 커밋을 폴백으로 보여준다(gh#289 수정)', async () => {
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue('{}')
    mockReaddirSync.mockReturnValue([])
    mockStatSync.mockReturnValue({ isDirectory: () => false })

    const { context } = await import('../src/commands/context.js')
    await expect(context()).resolves.not.toThrow()

    const call = mockWriteFileSync.mock.calls.find((c) => String(c[0]).includes('context.md'))
    expect(call).toBeDefined()
    const md = String(call![1])
    // 크래시 없이 정적 섹션(기술스택·헌법소스 등)은 항상 나옴 — 세션 복원용 뼈대는 유지.
    expect(md).toContain('# 프로젝트 컨텍스트')
    // Active Goal/Blockers/저장된 기억 섹션 자체는 여전히 empty 조건부라 생략되지만,
    expect(md).not.toContain('## Active Goal')
    expect(md).not.toContain('## Active Blockers')
    // 이 vhk 레포 자체가 git 저장소라 실제 git log 가 폴백으로 잡혀야 함(mock 대상 아님 — gitOut
    // 은 child_process 경유, 이 파일이 모킹하는 node:fs 와 무관하게 실제 실행됨).
    expect(md).toContain('## 최근 활동')
    expect(md).toMatch(/[0-9a-f]{7,}\s/) // git log --pretty=%h 짧은 SHA 형태가 실제로 들어있어야 함
    expect(md).not.toContain('## 저장된 기억')
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

describe('context — 헌법(core-rules) 소스 표기 (goal 91)', () => {
  let origRulesFile: string | undefined

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    origRulesFile = process.env.VHK_RULES_FILE
    delete process.env.VHK_RULES_FILE
  })

  afterEach(() => {
    if (origRulesFile === undefined) delete process.env.VHK_RULES_FILE
    else process.env.VHK_RULES_FILE = origRulesFile
  })

  it('규칙 파일 미설정 → context.md 에 bundled 소스 표기 (vhk start 5단계 경로 커버)', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('package.json'))
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'p', version: '0.0.0' }))
    mockReaddirSync.mockReturnValue([])
    mockStatSync.mockReturnValue({ isDirectory: () => false })

    const { context } = await import('../src/commands/context.js')
    await context()

    const call = mockWriteFileSync.mock.calls.find((c) => String(c[0]).includes('context.md'))
    expect(call).toBeDefined()
    const md = String(call![1])
    expect(md).toContain('## 헌법(core-rules) 소스')
    expect(md).toContain('bundled')
  })

  // 규칙 파일 미설정과 읽기 실패를 모두 포괄하는 안내여야 한다.
  it('bundled 문구가 "미설정"으로 단정하지 않는다 (읽기실패 케이스도 포괄, goal 91 critic)', async () => {
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue('{}')
    mockReaddirSync.mockReturnValue([])
    mockStatSync.mockReturnValue({ isDirectory: () => false })

    const { context } = await import('../src/commands/context.js')
    await context()

    const call = mockWriteFileSync.mock.calls.find((c) => String(c[0]).includes('context.md'))
    const md = String(call![1])
    expect(md).toContain('VHK 기본 규칙 스냅샷')
  })
})
