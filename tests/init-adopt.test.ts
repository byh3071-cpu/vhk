import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ④ 대화형 adopt 분기 e2e — inquirer 를 모킹해 실제 init() 흐름(감지→adopt→RULES.md 채택)을 돈다.
// (지금까지 순수함수(detectExistingRuleFiles/buildAdoptedRules)만 단위테스트 → 통합 경로 무검증이었음.)
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(async (qs: unknown) => {
      const q = (Array.isArray(qs) ? qs[0] : qs) as { name?: string }
      if (q?.name === 'confirmStack') return { confirmStack: true }
      if (q?.name === 'adopt') return { adopt: true }
      if (q?.name === 'overwrite') return { overwrite: true }
      return {}
    }),
  },
}))

describe('vhk init — ④ adopt 대화형 분기 e2e', () => {
  let origCwd: string
  let dir: string
  let origStdinTTY: boolean | undefined
  let origStdoutTTY: boolean | undefined
  beforeEach(() => {
    origCwd = process.cwd()
    // 대화형 경로 e2e — isNonInteractive(stdin/stdout TTY) 가 false 가 되도록 TTY 강제.
    origStdinTTY = process.stdin.isTTY
    origStdoutTTY = process.stdout.isTTY
    process.stdin.isTTY = true
    process.stdout.isTTY = true
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-adopt-e2e-'))
    process.chdir(dir)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.stdin.isTTY = origStdinTTY
    process.stdout.isTTY = origStdoutTTY
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('기존 .cursorrules 감지 → adopt 채택 → RULES.md 가 채택본(출처주석 포함)', async () => {
    fs.writeFileSync('.cursorrules', '# 기존 프로젝트\n\n## 코딩 규칙\n- 채택될 규칙 XYZ\n', 'utf-8')

    const { init } = await import('../src/commands/init.js')
    await init({ name: 'my-app', description: '설명', type: 'cli' })

    const rules = fs.readFileSync(path.join(dir, 'RULES.md'), 'utf-8')
    expect(rules).toContain('채택될 규칙 XYZ') // 기존 규칙이 RULES.md 로 채택됨
    expect(rules).toContain('.cursorrules') // 출처 주석
  })
})
