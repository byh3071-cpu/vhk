import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { routeNaturalLanguage } from '../src/lib/nlp-router.js'

// 무거운 하위 단계는 no-op — init()·git init 만 실제 실행(발견성/회귀 검증용).
vi.mock('../src/commands/sync.js', () => ({ sync: vi.fn(async () => {}) }))
vi.mock('../src/commands/mcp-init.js', () => ({ mcpInit: vi.fn(async () => {}) }))
vi.mock('../src/commands/context.js', () => ({ context: vi.fn(async () => {}) }))

describe('vhk start — NLP 라우팅', () => {
  it("'시작' 한 단어 입력은 start로 라우팅된다", () => {
    const route = routeNaturalLanguage('시작')
    expect(route?.command).toBe('start')
  })

  it("'새 프로젝트 시작해줘'는 start로 라우팅된다", () => {
    const route = routeNaturalLanguage('새 프로젝트 시작해줘')
    expect(route?.command).toBe('start')
  })

  it("'프로젝트 만들고 싶어'는 start로 라우팅된다", () => {
    const route = routeNaturalLanguage('프로젝트 만들고 싶어')
    expect(route?.command).toBe('start')
  })

  it("'마법사'는 start로 라우팅된다", () => {
    const route = routeNaturalLanguage('마법사')
    expect(route?.command).toBe('start')
  })

  it("'기획 끝났어요 바로 시작'은 start로 라우팅된다", () => {
    const route = routeNaturalLanguage('기획 끝났어요 바로 시작')
    expect(route?.command).toBe('start')
  })

  it("'노션에서 가져와서 시작'은 start --from-notion으로 라우팅된다", () => {
    const route = routeNaturalLanguage('노션에서 가져와서 시작')
    expect(route?.command).toBe('start')
    expect(route?.args).toContain('--from-notion')
  })

  it("'초기화'는 init으로 라우팅된다 (start 아님)", () => {
    const route = routeNaturalLanguage('초기화')
    expect(route?.command).toBe('init')
  })

  it("'init만'은 init으로 라우팅된다", () => {
    const route = routeNaturalLanguage('init만')
    expect(route?.command).toBe('init')
  })

  it("디자인 관련 키워드와 함께 '시작'은 start로 가지 않는다", () => {
    const route = routeNaturalLanguage('디자인 토큰 만들기 시작')
    expect(route?.command).not.toBe('start')
  })

  it("컨텍스트 관련 키워드와 함께 '만들'은 start로 가지 않는다", () => {
    const route = routeNaturalLanguage('컨텍스트 만들어줘')
    expect(route?.command).toBe('context')
  })
})

describe('vhk start — 모듈 구조', () => {
  it('start 함수가 export된다', async () => {
    const mod = await import('../src/commands/start.js')
    expect(typeof mod.start).toBe('function')
  })

  it('StartOptions 타입의 필드를 모두 받는다 (컴파일 시간 검증)', async () => {
    const mod = await import('../src/commands/start.js')
    // 런타임에서는 함수 존재만 확인. 타입은 tsc가 검증.
    expect(mod.start.length).toBeLessThanOrEqual(1)
  })
})

describe('vhk start — 완료 안내에 goal init 발견성 (goal 88)', () => {
  let origCwd: string
  let dir: string
  let logs: string[]

  beforeEach(() => {
    origCwd = process.cwd()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-start-'))
    process.chdir(dir)
    logs = []
    vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { logs.push(String(m)) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.chdir(origCwd)
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('start -y 완료 출력에 vhk goal init 힌트가 포함된다', async () => {
    const { start } = await import('../src/commands/start.js')
    await start({ yes: true, name: 'demo', description: 'd', type: 'cli' })
    expect(logs.join('\n')).toContain('vhk goal init')
  })

  it('start 는 goal init 을 자동 실행하지 않는다 (goals/·docs/state 미생성 — 회귀 가드)', async () => {
    const { start } = await import('../src/commands/start.js')
    await start({ yes: true, name: 'demo', description: 'd', type: 'cli' })
    expect(fs.existsSync(path.join(dir, 'goals', '_meta.md'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'docs', 'state', 'next-task.md'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(true)
  })

  it('start --stack은 타입 프리셋 대신 지정값을 확정해 init으로 전달한다', async () => {
    const { start } = await import('../src/commands/start.js')
    await start({
      yes: true,
      name: 'demo',
      description: 'd',
      type: 'webapp',
      stack: 'Vite, React, TypeScript',
    })
    const rules = fs.readFileSync(path.join(dir, 'RULES.md'), 'utf-8')
    expect(rules).toContain('Vite')
    expect(rules).toContain('React')
    expect(rules).toContain('기술 스택 상태: 확정')
    expect(rules).not.toContain('Next.js')
    expect(rules).not.toContain('Supabase')
  })
})
