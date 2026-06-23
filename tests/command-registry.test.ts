import { describe, it, expect } from 'vitest'
import { program } from '../src/index.js'
import { CONTAINER_SUBCOMMANDS, CONTAINER_ALIASES, TOP_LEVEL_COMMANDS } from '../src/lib/command-registry.js'
import { detectNaturalLanguageInput, KNOWN_COMMAND_TOKENS } from '../src/lib/cli-args.js'

// R1 드리프트 가드: commander 정의(index.ts)와 R1 가드의 단일 소스(command-registry)가
// 따로 놀지 않는지 실제 introspect 로 검증. (주석 grep 이 아니라 코드 구조 검증)
describe('R1 드리프트 가드 — command-registry 단일 소스', () => {
  it('commander 의 실제 서브커맨드가 모두 레지스트리에 있음 (누락 = R1 재발 위험)', () => {
    for (const [container, subs] of Object.entries(CONTAINER_SUBCOMMANDS)) {
      const cmd = program.commands.find((c) => c.name() === container)
      if (!cmd) continue // 위치 인자형(mode 등) — commander 서브커맨드 없음
      const actual = cmd.commands.map((c) => c.name())
      for (const s of actual) {
        expect(subs, `${container}.${s} 가 registry 에 없음 → 자연어 라우터가 가로챌 위험`).toContain(s)
      }
    }
  })

  // #344 유령 서브커맨드 가드(역방향): registry 에만 있고 commander 엔 없는 '유령 서브'를 잡는다.
  // (기존 가드는 commander→registry 방향만 검사해 env:[check]·design:[palette] 같은 유령을 못 잡았다.)
  it('registry 의 서브커맨드 보유 컨테이너는 commander 서브커맨드 또는 positional 인자를 실제로 가진다 (유령 서브 0)', () => {
    for (const name of Object.keys(CONTAINER_SUBCOMMANDS)) {
      const cmd = program.commands.find((c) => c.name() === name)
      if (!cmd) continue
      const hasSubs = cmd.commands.length > 0
      const hasPositional = cmd.registeredArguments.length > 0
      expect(
        hasSubs || hasPositional,
        `'${name}' 는 commander 에 서브커맨드도 positional 인자도 없는 leaf 인데 registry 가 서브커맨드를 선언함 → 유령 서브 → 'vhk ${name} <x>' 가 raw too-many-arguments`
      ).toBe(true)
    }
  })

  // #327: `vhk mission show` 가 commander 서브커맨드로 등록돼야 함.
  // 미등록이면 'show' 가 mission(0-arity) 위치인자로 처리돼 'too many arguments' cryptic 에러.
  it('#327 mission 에 show 서브커맨드가 등록돼 있음 (set/check/clear 와 대칭)', () => {
    const mission = program.commands.find((c) => c.name() === 'mission')
    expect(mission, 'mission 컨테이너 명령이 commander 에 없음').toBeDefined()
    const subs = mission!.commands.map((c) => c.name())
    expect(subs).toContain('show')
    // 회귀: 기존 서브커맨드도 그대로
    expect(subs).toEqual(expect.arrayContaining(['set', 'check', 'clear', 'show']))
  })

  it('레지스트리가 cli-args R1 가드를 실제로 작동시킴', () => {
    // goal check / mode strict 가 commander 로 가야 함(자연어 라우터 가로채기 금지)
    expect(detectNaturalLanguageInput(['node', 'vhk', 'goal', 'check'])).toBeNull()
    expect(detectNaturalLanguageInput(['node', 'vhk', 'mode', 'strict'])).toBeNull()
  })

  it('모든 한글 별칭이 유효한 영문 컨테이너를 가리킨다', () => {
    for (const [, canonical] of Object.entries(CONTAINER_ALIASES)) {
      expect(CONTAINER_SUBCOMMANDS[canonical]).toBeDefined()
    }
  })

  it('새 컨테이너 명령(서브커맨드 보유)이 registry 에 누락되지 않음', () => {
    const containers = program.commands.filter((c) => c.commands.length > 0).map((c) => c.name())
    for (const name of containers) {
      expect(
        CONTAINER_SUBCOMMANDS[name],
        `새 컨테이너 '${name}' 가 command-registry 에 없음 → R1 가드 누락`
      ).toBeDefined()
    }
  })

  it('모든 컨테이너 명령이 KNOWN_COMMAND_TOKENS 에 있음 (없으면 옵션 없는 서브커맨드가 NL 로 샘)', () => {
    for (const container of Object.keys(CONTAINER_SUBCOMMANDS)) {
      expect(
        KNOWN_COMMAND_TOKENS.has(container),
        `컨테이너 '${container}' 가 KNOWN_COMMAND_TOKENS 에 없음 → '${container} <sub>' 가 자연어로 둔갑`
      ).toBe(true)
    }
  })

  it('모든 한글 컨테이너 별칭도 KNOWN_COMMAND_TOKENS 에 있음', () => {
    for (const alias of Object.keys(CONTAINER_ALIASES)) {
      expect(
        KNOWN_COMMAND_TOKENS.has(alias),
        `한글 별칭 '${alias}' 가 KNOWN_COMMAND_TOKENS 에 없음 → 한글 서브커맨드가 자연어로 둔갑`
      ).toBe(true)
    }
  })
})

// SoT 드리프트 가드(2층): context.ts 가 명령 목록을 다시 하드코딩하지 않도록,
// TOP_LEVEL_COMMANDS 가 commander 의 실제 top-level 명령과 1:1 일치하는지 introspect 검증.
// (commander 가 자동 추가하는 'help' 는 카탈로그 대상이 아니므로 제외.)
describe('SoT 가드 — TOP_LEVEL_COMMANDS 단일 소스', () => {
  const actual = program.commands.map((c) => c.name()).filter((n) => n !== 'help')
  const registry = TOP_LEVEL_COMMANDS.map((c) => c.name)

  it('레지스트리에 중복 명령이 없다', () => {
    expect(new Set(registry).size).toBe(registry.length)
  })

  it('commander 의 모든 top-level 명령이 TOP_LEVEL_COMMANDS 에 있다 (누락 = context 목록 stale)', () => {
    for (const name of actual) {
      expect(registry, `명령 '${name}' 가 TOP_LEVEL_COMMANDS 에 없음`).toContain(name)
    }
  })

  it('TOP_LEVEL_COMMANDS 의 모든 명령이 commander 에 실제 등록돼 있다 (유령 명령 금지)', () => {
    for (const name of registry) {
      expect(actual, `'${name}' 가 commander 에 등록되지 않음`).toContain(name)
    }
  })

  it('모든 항목에 한 줄 설명(desc)이 있다', () => {
    for (const c of TOP_LEVEL_COMMANDS) {
      expect(c.desc.length, `'${c.name}' 설명 누락`).toBeGreaterThan(0)
    }
  })
})
