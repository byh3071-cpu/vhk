import { describe, it, expect } from 'vitest'
import { program } from '../src/index.js'
import { CONTAINER_SUBCOMMANDS, CONTAINER_ALIASES } from '../src/lib/command-registry.js'
import { detectNaturalLanguageInput } from '../src/lib/cli-args.js'

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
    // commander 에서 서브커맨드를 가진 명령 = 컨테이너. registry 에 없으면 R1 가드 누락 → 자연어 가로채기 위험.
    const containers = program.commands.filter((c) => c.commands.length > 0).map((c) => c.name())
    for (const name of containers) {
      expect(
        CONTAINER_SUBCOMMANDS[name],
        `새 컨테이너 '${name}' 가 command-registry 에 없음 → R1 가드 누락`
      ).toBeDefined()
    }
  })
})
