import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { useIsolatedHome, type IsolatedHome } from '../src/lib/test-support/isolated-home.js'

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(async () => {
      throw new Error('PROMPT_CALLED: 기존 프로젝트 비대화형 흐름에서 프롬프트를 호출함')
    }),
  },
}))

vi.mock('../src/lib/version-check.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/version-check.js')>()
  return {
    ...actual,
    fetchLatestNpmVersion: vi.fn(() => null),
    recordLatest: vi.fn(),
  }
})

describe('기존 프로젝트 반복 적용 신뢰성 (#544~#546)', () => {
  let originalCwd: string
  let dir: string
  let home: IsolatedHome

  beforeEach(() => {
    originalCwd = process.cwd()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-existing-flow-'))
    home = useIsolatedHome('vhk-existing-flow-home-')
    process.chdir(dir)
    process.exitCode = 0
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.chdir(originalCwd)
    process.exitCode = 0
    fs.rmSync(dir, { recursive: true, force: true })
    home.restore()
    vi.restoreAllMocks()
  })

  it('init/adopt → sync → doctor → sync --check를 두 번 실행해도 중복·손상·거짓 성공이 없다', async () => {
    const block = '<!-- SAMPLE:BEGIN -->\n## 코딩 규칙\n- 같은 규칙\n<!-- SAMPLE:END -->\n'
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), block, 'utf-8')
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), block, 'utf-8')

    const { init } = await import('../src/commands/init.js')
    const { sync } = await import('../src/commands/sync.js')
    const { doctor } = await import('../src/commands/doctor.js')

    for (let run = 0; run < 2; run += 1) {
      await init({ yes: true, name: 'existing-app', description: '기존 프로젝트', type: 'cli' })
      await sync({ yes: true })
      process.exitCode = 0
      await doctor({ strict: true })
      expect(process.exitCode).toBe(0)
      await sync({ check: true })
      expect(process.exitCode).toBe(0)
    }

    const rules = fs.readFileSync(path.join(dir, 'RULES.md'), 'utf-8')
    expect(rules.match(/SAMPLE:BEGIN/g)).toHaveLength(1)
    expect(rules.match(/SAMPLE:END/g)).toHaveLength(1)
  })
})
