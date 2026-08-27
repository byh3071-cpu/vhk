import { describe, it, expect } from 'vitest'
import {
  CONTAINER_SUBCOMMANDS,
  CONTAINER_ALIASES,
  CONTAINER_SUBCOMMAND_ALIASES,
  TOP_LEVEL_COMMANDS,
  resolveSubcommandAlias,
} from '../src/lib/command-registry.js'
import { KNOWN_COMMAND_TOKENS } from '../src/lib/cli-args.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * RFC 0066 §8.3 — 신규 명령 등록 지점.
 *
 * 하나라도 빠지면 자연어 라우터가 문장을 삼켜 인자가 조용히 사라진다.
 * 이 저장소에서 2회 실증된 결함 클래스이고, 이번에도 KNOWN_COMMAND_TOKENS 누락으로 재현됐다 —
 * `vhk policy level` 과 `vhk 정책 단계` 가 둘 다 라우터에 먹혔다. 그래서 지점별로 못박는다.
 */

describe('vhk policy 등록 지점 (RFC 0066 §8.3)', () => {
  it('TOP_LEVEL_COMMANDS 에 있다', () => {
    expect(TOP_LEVEL_COMMANDS.map((c) => c.name)).toContain('policy')
  })

  it('조회 네 개와 사람 전용 기준선 명령이 등록돼 있다', () => {
    expect(CONTAINER_SUBCOMMANDS.policy).toEqual(['level', 'risk', 'show', 'check', 'baseline'])
  })

  it('컨테이너 한글 별칭이 있다', () => {
    expect(CONTAINER_ALIASES['정책']).toBe('policy')
  })

  it('서브커맨드 한글 별칭이 전부 있다', () => {
    expect(CONTAINER_SUBCOMMAND_ALIASES.policy).toEqual({
      단계: 'level',
      위험도: 'risk',
      보기: 'show',
      검사: 'check',
      기준선: 'baseline',
    })
  })

  // 이번에 실측으로 잡은 누락 지점. 여기 없으면 firstIsKnown 이 false 라 NL 라우터가 가로챈다.
  it('KNOWN_COMMAND_TOKENS 에 영문·한글 둘 다 있다', () => {
    expect(KNOWN_COMMAND_TOKENS.has('policy')).toBe(true)
    expect(KNOWN_COMMAND_TOKENS.has('정책')).toBe(true)
  })

  it('한글 서브 별칭이 정규 이름으로 해석된다', () => {
    expect(resolveSubcommandAlias('policy', '검사')).toBe('check')
    expect(resolveSubcommandAlias('policy', '단계')).toBe('level')
    expect(resolveSubcommandAlias('policy', '위험도')).toBe('risk')
    expect(resolveSubcommandAlias('policy', '보기')).toBe('show')
    expect(resolveSubcommandAlias('policy', '기준선')).toBe('baseline')
  })
})

describe('조회는 원장에 쓰지 않는다 (§4.3)', () => {
  // 조회로 전이가 일어나면 vhk policy level 을 세 번 불러 L1 → L3 로 올라간다.
  // import 자체를 막아 실수로도 못 쓰게 한다.
  it('policy 커맨드가 원장 append 를 import 하지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'commands', 'policy.ts'), 'utf-8')
    // 주석에서의 언급은 허용한다 — 왜 안 쓰는지 적어두는 편이 낫다. import 문만 본다.
    const imports = source
      .split(/\r?\n/)
      .filter((l) => l.trimStart().startsWith('import'))
      .join(' ')
    expect(imports).not.toContain('appendPolicyDecision')
  })
})
