import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// goal 91: YOHAN_BRAIN_ROOT 미설정 시 헌법(core-rules)이 조용히 번들 스냅샷으로 생성되는 문제 —
// init -y 가 프롬프트 없이 경고를 내는지 + .vhk/context.md 에 소스가 표기되는지 검증.
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(async () => {
      throw new Error('PROMPT_CALLED: init -y 가 프롬프트를 호출함 (비대화형 위반)')
    }),
  },
}))

describe('vhk init — core-rules 폴백 가시화 (goal 91)', () => {
  let origCwd: string
  let origBrain: string | undefined
  let origLegacy: string | undefined
  let dir: string
  let logs: string[]

  beforeEach(() => {
    origCwd = process.cwd()
    origBrain = process.env.YOHAN_BRAIN_ROOT
    origLegacy = process.env.VHK_LEGACY_RULES
    process.env.VHK_LEGACY_RULES = '0'
    delete process.env.VHK_RULES_FILE
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-init-core-warn-'))
    process.chdir(dir)
    logs = []
    vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { logs.push(String(m)) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.chdir(origCwd)
    fs.rmSync(dir, { recursive: true, force: true })
    if (origBrain === undefined) delete process.env.YOHAN_BRAIN_ROOT
    else process.env.YOHAN_BRAIN_ROOT = origBrain
    if (origLegacy === undefined) delete process.env.VHK_LEGACY_RULES
    else process.env.VHK_LEGACY_RULES = origLegacy
    vi.restoreAllMocks()
  })

  it('YOHAN_BRAIN_ROOT 미설정 → 완료 시 번들 폴백 경고 + context.md 에 bundled 표기', async () => {
    delete process.env.YOHAN_BRAIN_ROOT
    const { init } = await import('../src/commands/init.js')
    await init({ yes: true, name: 'demo', description: 'd', type: 'cli' })

    expect(logs.join('\n')).toContain('번들 스냅샷')
    const context = fs.readFileSync(path.join(dir, '.vhk', 'context.md'), 'utf-8')
    expect(context).toContain('bundled')
  })

  // critic 지적(2026-07-03): 예전 문구가 'vhk sync 를 다시 실행하세요'라고 안내했지만
  // sync.ts SYNC_TARGETS 는 .agents/CORE-RULES.md 를 절대 건드리지 않는다(실측 확인) —
  // 실제 재생성기는 inject-bootstrap.ts 뿐이고 force/yes 없인 skip 된다. 안내 문구가
  // 사용자를 거짓 확신(sync 성공=헌법 갱신)으로 유도하는 실질 결함이라 회귀 가드로 고정.
  it('경고 문구가 실제로 헌법 파일을 갱신하는 명령을 안내한다 (vhk sync 아님)', async () => {
    delete process.env.YOHAN_BRAIN_ROOT
    const { init } = await import('../src/commands/init.js')
    await init({ yes: true, name: 'demo', description: 'd', type: 'cli' })

    const joined = logs.join('\n')
    expect(joined).toContain('vhk inject-bootstrap --force')
    expect(joined).not.toContain('vhk sync')
  })

  // 원래 의도 이행 감사(2026-07-03) 발견 2건 — 실전 검증 갭:
  // (1) --force 는 CORE-RULES.md 뿐 아니라 ecosystem.mdc 등 다른 tier-S 파일도 함께
  //     덮어씀(tests/inject-bootstrap.test.ts:64-77 로 실증된 부작용) — 부작용 고지 누락.
  // (2) 사용자 자신의 글로벌 규칙("Windows env var 설정 후 VSCode 완전 재시작 필수")과
  //     경고 문구가 안내하는 즉시 실행 흐름이 충돌 — "시킨 대로 했는데 안 됨" 루프 위험.
  it('경고 문구가 --force 부작용과 범용 규칙 파일 대안을 고지한다', async () => {
    delete process.env.YOHAN_BRAIN_ROOT
    const { init } = await import('../src/commands/init.js')
    await init({ yes: true, name: 'demo', description: 'd', type: 'cli' })

    const joined = logs.join('\n')
    expect(joined).toContain('ecosystem.mdc')
    expect(joined).toContain('VHK_RULES_FILE')
  })

  // goal 92: 재시작 문제를 원천 회피하는 vhk config set-brain-root 도 함께 안내(대안 병기).
  it('경고 문구가 vhk config set-rules-file 대안을 안내한다', async () => {
    delete process.env.YOHAN_BRAIN_ROOT
    const { init } = await import('../src/commands/init.js')
    await init({ yes: true, name: 'demo', description: 'd', type: 'cli' })

    const joined = logs.join('\n')
    expect(joined).toContain('vhk config set-rules-file')
  })

  it('legacy root 유효 → 제거 예정 경고 + context.md 에 configured 표기', async () => {
    const brainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-brain-warn-'))
    const yamlPath = path.join(brainDir, 'memory', 'core', 'core-ruleset.yaml')
    fs.mkdirSync(path.dirname(yamlPath), { recursive: true })
    fs.writeFileSync(yamlPath, 'version: "9.9.9"\nnon_negotiable:\n  - x\n', 'utf-8')
    process.env.YOHAN_BRAIN_ROOT = brainDir
    delete process.env.VHK_LEGACY_RULES

    try {
      const { init } = await import('../src/commands/init.js')
      await init({ yes: true, name: 'demo', description: 'd', type: 'cli' })

      expect(logs.join('\n')).toContain('v3.0')
      const context = fs.readFileSync(path.join(dir, '.vhk', 'context.md'), 'utf-8')
      expect(context).toContain('configured')
    } finally {
      fs.rmSync(brainDir, { recursive: true, force: true })
    }
  })
})
