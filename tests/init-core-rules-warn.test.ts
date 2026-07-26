import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(async () => {
      throw new Error('PROMPT_CALLED: init -y 가 프롬프트를 호출함 (비대화형 위반)')
    }),
  },
}))

describe('vhk init — 범용 규칙 소스 가시화', () => {
  let originalCwd: string
  let originalRulesFile: string | undefined
  let dir: string
  let logs: string[]

  beforeEach(() => {
    originalCwd = process.cwd()
    originalRulesFile = process.env.VHK_RULES_FILE
    delete process.env.VHK_RULES_FILE
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-init-core-warn-'))
    process.chdir(dir)
    logs = []
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => { logs.push(String(message)) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(dir, { recursive: true, force: true })
    if (originalRulesFile === undefined) delete process.env.VHK_RULES_FILE
    else process.env.VHK_RULES_FILE = originalRulesFile
    vi.restoreAllMocks()
  })

  it('규칙 파일 미설정 → 번들 경고와 context 소스를 남긴다', async () => {
    const { init } = await import('../src/commands/init.js')
    await init({ yes: true, name: 'demo', description: 'd', type: 'cli' })

    expect(logs.join('\n')).toContain('번들 스냅샷')
    const context = fs.readFileSync(path.join(dir, '.vhk', 'context.md'), 'utf-8')
    expect(context).toContain('bundled')
  })

  it('경고가 실제 재생성 명령과 범용 규칙 파일 설정을 안내한다', async () => {
    const { init } = await import('../src/commands/init.js')
    await init({ yes: true, name: 'demo', description: 'd', type: 'cli' })

    const joined = logs.join('\n')
    expect(joined).toContain('vhk inject-bootstrap --force')
    expect(joined).toContain('ecosystem.mdc')
    expect(joined).toContain('VHK_RULES_FILE')
    expect(joined).toContain('vhk config set-rules-file')
  })

  it('VHK_RULES_FILE이 유효하면 configured 소스를 사용한다', async () => {
    const rulesFile = path.join(dir, 'rules.yaml')
    fs.writeFileSync(rulesFile, 'version: "3.0.0"\nnon_negotiable:\n  - x\n', 'utf-8')
    process.env.VHK_RULES_FILE = rulesFile

    const { init } = await import('../src/commands/init.js')
    await init({ yes: true, name: 'demo', description: 'd', type: 'cli' })

    const context = fs.readFileSync(path.join(dir, '.vhk', 'context.md'), 'utf-8')
    expect(context).toContain('configured')
    expect(logs.join('\n')).not.toContain('번들 스냅샷')
  })
})
