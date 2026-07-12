import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 기타(other) 프로젝트 타입 + 스택 직접 입력/건너뛰기 흐름 (예: Rust 베어메탈 OS).
// prompt 를 큐 기반 mock 으로 대체 — 예상보다 많은 프롬프트 호출은 throw 로 잡는다.
const promptQueue: Array<Record<string, unknown>> = []
vi.mock('../src/lib/prompt.js', () => ({
  prompt: vi.fn(async () => {
    const next = promptQueue.shift()
    if (!next) throw new Error('PROMPT_QUEUE_EMPTY: 예상보다 많은 프롬프트 호출')
    return next
  }),
}))

describe('vhk init — 기타(other) 타입 + 스택 직접 입력', () => {
  let origCwd: string
  let dir: string
  let origTty: boolean | undefined

  beforeEach(() => {
    origCwd = process.cwd()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-init-other-'))
    process.chdir(dir)
    promptQueue.length = 0
    // 대화형 흐름 테스트 — stdin TTY 강제 (isInteractive 의 단일 축)
    origTty = process.stdin.isTTY
    process.stdin.isTTY = true
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.stdin.isTTY = origTty
    process.chdir(origCwd)
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('type=other + 스택 직접 입력 → 입력한 스택으로 파일 생성', async () => {
    const { init } = await import('../src/commands/init.js')
    promptQueue.push({ customStack: 'Rust, QEMU, x86_64' }, { confirmStack: true })
    await init({ name: 'yohan-os', description: 'AI 베어메탈 OS', type: 'other' })
    const rules = fs.readFileSync(path.join(dir, 'RULES.md'), 'utf-8')
    expect(rules).toContain('Rust')
    expect(rules).toContain('QEMU')
    // RFC 0060 T3: init 이 자동 sync 하므로 CLAUDE.md 는 RULES.md 파생(스택은 리스트 형태로 반영).
    // 스택 토큰은 CLAUDE.md 에 남고, 정확한 "A + B + C" 조합 문자열은 sync 비대상인
    // ARCHITECTURE.md 에 보존된다(정보 손실 없음 — 포맷만 파생 규칙을 따름).
    const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8')
    expect(claude).toContain('Rust')
    expect(claude).toContain('QEMU')
    const arch = fs.readFileSync(path.join(dir, 'docs', 'ARCHITECTURE.md'), 'utf-8')
    expect(arch).toContain('Rust + QEMU + x86_64')
  })

  it('type=other + Enter(건너뛰기) → 스택 미정으로 진행, confirmStack 프롬프트 없음', async () => {
    const { init } = await import('../src/commands/init.js')
    promptQueue.push({ customStack: '' }) // 이후 프롬프트 호출되면 큐 고갈 throw
    await init({ name: 'yohan-os', description: 'd', type: 'other' })
    expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(true)
    const rules = fs.readFileSync(path.join(dir, 'RULES.md'), 'utf-8')
    expect(rules).toContain('미정')
  })

  it('프리셋 타입 + confirmStack 거절 → 직접 입력으로 교체 (취소 아님)', async () => {
    const { init } = await import('../src/commands/init.js')
    promptQueue.push({ confirmStack: false }, { customStack: 'Rust' })
    await init({ name: 'mytool', description: 'd', type: 'cli' })
    const rules = fs.readFileSync(path.join(dir, 'RULES.md'), 'utf-8')
    expect(rules).toContain('Rust')
    expect(rules).not.toContain('commander')
  })

  it('confirmStack 거절 + Enter → 기존처럼 취소 (파일 미생성)', async () => {
    const { init } = await import('../src/commands/init.js')
    promptQueue.push({ confirmStack: false }, { customStack: '' })
    await init({ name: 'mytool', description: 'd', type: 'cli' })
    expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(false)
  })

  it('유효하지 않은 type 은 여전히 거부 (other 가 VALID_TYPES 에 포함됨)', async () => {
    const { init } = await import('../src/commands/init.js')
    await expect(init({ name: 'x', description: 'y', type: 'spaceship', yes: true }))
      .rejects.toThrow(/유효하지 않은 type/)
  })
})

describe('parseStackInput', () => {
  it('쉼표 구분 입력을 trim 해 파싱', async () => {
    const { parseStackInput } = await import('../src/commands/init.js')
    expect(parseStackInput('Rust, QEMU , x86_64')).toEqual(['Rust', 'QEMU', 'x86_64'])
  })

  it('빈/공백 입력 → []', async () => {
    const { parseStackInput } = await import('../src/commands/init.js')
    expect(parseStackInput('')).toEqual([])
    expect(parseStackInput('   ')).toEqual([])
    expect(parseStackInput(undefined)).toEqual([])
  })

  it('"C++"·"C/C++"·"CI·CD" 같은 항목을 분리자로 망가뜨리지 않음', async () => {
    const { parseStackInput } = await import('../src/commands/init.js')
    expect(parseStackInput('C++, CMake')).toEqual(['C++', 'CMake'])
    expect(parseStackInput('C/C++')).toEqual(['C/C++'])
    expect(parseStackInput('CI·CD')).toEqual(['CI·CD'])
  })

  it('전각 쉼표(，)·모점(、)도 분리 — IME 입력 대응', async () => {
    const { parseStackInput } = await import('../src/commands/init.js')
    expect(parseStackInput('Rust，QEMU')).toEqual(['Rust', 'QEMU'])
    expect(parseStackInput('Rust、QEMU')).toEqual(['Rust', 'QEMU'])
  })
})
