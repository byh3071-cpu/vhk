import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Goal 8 / VHK-021: `vhk init -y` 완전 비대화형 보장.
// inquirer.prompt 가 한 번이라도 호출되면 throw → init -y 가 프롬프트를 안 띄움을 강제 증명.
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(async () => {
      throw new Error('PROMPT_CALLED: init -y 가 프롬프트를 호출함 (비대화형 위반)')
    }),
  },
}))

describe('vhk init -y 비대화형 (goal 8)', () => {
  let origCwd: string
  let dir: string
  beforeEach(() => {
    origCwd = process.cwd()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-init-yes-'))
    process.chdir(dir)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('-y 면 프롬프트 0개 + 기본 타입으로 파일 생성', async () => {
    const { init } = await import('../src/commands/init.js')
    // 프롬프트를 호출하면 mock 이 throw → 여기서 reject 되어 테스트 실패.
    await init({ yes: true })
    expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'RULES.md'))).toBe(true)
  })

  it('--type 미지정 -y 라도 type 프롬프트에서 멈추지 않음 (핵심 회귀)', async () => {
    const { init } = await import('../src/commands/init.js')
    await init({ yes: true, name: 'x', description: 'y' })
    expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(true)
  })

  it('#132: -y 라도 기존 규칙 파일을 RULES.md 로 자동 adopt (thin 템플릿 함정 방지, 프롬프트 0)', async () => {
    // 기존 .cursorrules(알맹이) + RULES.md 없음 → 비대화형이라도 adopt 해야 thin RULES.md 가
    // SoT 가 돼 알맹이를 덮어쓰는 함정을 막는다. 프롬프트 호출 시 mock throw → 무프롬프트 보장.
    fs.writeFileSync(path.join(dir, '.cursorrules'), '# 기존 프로젝트\n\n## 코딩 규칙\n- 채택될 규칙 ABC123\n', 'utf-8')
    const { init } = await import('../src/commands/init.js')
    await init({ yes: true, name: 'app', description: 'd', type: 'cli' })
    const rules = fs.readFileSync(path.join(dir, 'RULES.md'), 'utf-8')
    expect(rules).toContain('채택될 규칙 ABC123') // 자동 adopt
    expect(rules).toContain('.cursorrules') // 출처 주석
  })

  it('#132: -y + 기존 RULES.md 있으면 보존 (adopt 가 덮어쓰지 않음)', async () => {
    fs.writeFileSync(path.join(dir, '.cursorrules'), '# 기존\n## 코딩 규칙\n- X\n', 'utf-8')
    fs.writeFileSync(path.join(dir, 'RULES.md'), '# 내 손글 RULES\n\n## 코딩 규칙\n- 보존되어야 함 KEEP999\n', 'utf-8')
    const { init } = await import('../src/commands/init.js')
    await init({ yes: true, name: 'app', description: 'd', type: 'cli' })
    const rules = fs.readFileSync(path.join(dir, 'RULES.md'), 'utf-8')
    expect(rules).toContain('보존되어야 함 KEEP999') // 기존 RULES.md 보존
  })

  it('비-TTY + -y 없음: confirmStack/adopt 도 프롬프트 0개 (Codex #3 회귀)', async () => {
    const origIn = process.stdin.isTTY
    const origOut = process.stdout.isTTY
    process.stdin.isTTY = false
    process.stdout.isTTY = false
    try {
      // 기존 규칙 파일 → adopt 분기 트리거 조건. 비-TTY 면 프롬프트 없이 skip 돼야 함.
      fs.writeFileSync(path.join(dir, '.cursorrules'), '# 기존\n## 규칙\n- X\n', 'utf-8')
      const { init } = await import('../src/commands/init.js')
      await init({}) // yes 없음 + 비-TTY → 비대화형. 프롬프트 호출 시 mock throw.
      expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(true)
    } finally {
      process.stdin.isTTY = origIn
      process.stdout.isTTY = origOut
    }
  })
})
