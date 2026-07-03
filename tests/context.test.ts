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

  // gh#289 재현: goals/blockers/memory 가 전부 비어있는(신규·희소 프로젝트) 상태에서
  // context.md 가 크래시 없이 생성되는지 + "작업상태" 관련 섹션이 실제로 어떻게 되는지 실측.
  it('context — goals/blockers/memory 전부 비어있어도 크래시 없이 생성(gh#289 재현)', async () => {
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
    // Active Goal/Blockers/저장된 기억 섹션은 empty 조건부라 이 시나리오에선 전부 생략됨 —
    // "작업상태·핵심결정 부재"라는 gh#289 제보가 (신규/희소 프로젝트 한정) 여전히 유효함을 실측 확인.
    expect(md).not.toContain('## Active Goal')
    expect(md).not.toContain('## Active Blockers')
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
  let origBrain: string | undefined

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    origBrain = process.env.YOHAN_BRAIN_ROOT
    delete process.env.YOHAN_BRAIN_ROOT
  })

  afterEach(() => {
    if (origBrain === undefined) delete process.env.YOHAN_BRAIN_ROOT
    else process.env.YOHAN_BRAIN_ROOT = origBrain
  })

  it('YOHAN_BRAIN_ROOT 미설정 → context.md 에 bundled 소스 표기 (vhk start 5단계 경로 커버)', async () => {
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

  // critic 지적(2026-07-03): vhk-dir.ts 의 VHK_CONTEXT_SEED 와 동일한 "미설정" 단정 문구가
  // context.ts 에도 그대로 복제돼 있었다 — env는 설정됐지만 읽기 실패한 케이스를 놓침.
  // (version="unknown" 코스메틱 케이스는 실제 번들 스냅샷 버전이 '0.1.0'이라 이 mock 경로로는
  // 재현 불가 — vhk-dir.ts 쪽은 tests/init.test.ts 가 VHK_CONTEXT_SEED 직접 호출로 커버함)
  it('bundled 문구가 "미설정"으로 단정하지 않는다 (읽기실패 케이스도 포괄, goal 91 critic)', async () => {
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue('{}')
    mockReaddirSync.mockReturnValue([])
    mockStatSync.mockReturnValue({ isDirectory: () => false })

    const { context } = await import('../src/commands/context.js')
    await context()

    const call = mockWriteFileSync.mock.calls.find((c) => String(c[0]).includes('context.md'))
    const md = String(call![1])
    expect(md).toContain('읽기 실패')
  })
})
