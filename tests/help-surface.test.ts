import { describe, expect, it } from 'vitest'
import { program } from '../src/index.js'
import {
  DEFAULT_HELP_HIDDEN_COMMANDS,
  formatRootHelp,
} from '../src/commands/help.js'
import { detectNaturalLanguageInput, KNOWN_COMMAND_TOKENS } from '../src/lib/cli-args.js'

const EXPECTED_HIDDEN = [
  'content',
  'launch',
  'ops',
  'sell',
  'seo',
  'cost',
  'design-palette',
  'theme',
]

function hasCommandLine(output: string, command: string): boolean {
  return output.split('\n').some((line) => line.startsWith(`  ${command} `) || line.startsWith(`  ${command} (`))
}

describe('도움말 명령 표면', () => {
  it('기본 도움말 숨김 목록은 정확히 마케팅·커머스 8종이다', () => {
    expect([...DEFAULT_HELP_HIDDEN_COMMANDS]).toEqual(EXPECTED_HIDDEN)
  })

  it('기본 도움말은 8종을 숨기고 전체 명령 안내를 표시한다', () => {
    const output = formatRootHelp(program, program.createHelp())
    for (const command of EXPECTED_HIDDEN) {
      expect(hasCommandLine(output, command), command).toBe(false)
    }
    expect(output).toContain('기본 명령:')
    expect(output).toContain('전체 명령 보기: vhk help --all')
    expect(hasCommandLine(output, 'start')).toBe(true)
    expect(hasCommandLine(output, 'verify')).toBe(true)
  })

  it('전체 도움말은 숨긴 8종을 모두 표시한다', () => {
    const output = formatRootHelp(program, program.createHelp(), { all: true })
    for (const command of EXPECTED_HIDDEN) {
      expect(hasCommandLine(output, command), command).toBe(true)
    }
    expect(output).toContain('전체 명령:')
    expect(hasCommandLine(output, 'help')).toBe(true)
  })

  it('숨긴 8종과 help --all은 commander에 실제 등록된 상태다', () => {
    const registered = program.commands.map((command) => command.name())
    for (const command of EXPECTED_HIDDEN) expect(registered).toContain(command)
    const help = program.commands.find((command) => command.name() === 'help')
    expect(help).toBeDefined()
    expect(help?.options.some((option) => option.long === '--all')).toBe(true)
    expect(KNOWN_COMMAND_TOKENS.has('help')).toBe(true)
    expect(detectNaturalLanguageInput(['node', 'vhk', 'help'])).toBeNull()
  })
})

// #552 리뷰 대응 — 기본 도움말이 숨기는 것은 8종뿐이고 `help` 자신은 남는다.
describe('기본 도움말의 help 노출과 한국어 별칭', () => {
  it('기본 도움말에도 help 가 표시된다(숨김은 정확히 8종)', () => {
    const output = formatRootHelp(program, program.createHelp())
    expect(hasCommandLine(output, 'help')).toBe(true)
    for (const command of EXPECTED_HIDDEN) {
      expect(hasCommandLine(output, command), command).toBe(false)
    }
  })

  it('help 는 한국어 별칭 도움말을 갖고 KNOWN 토큰에도 등록돼 있다', () => {
    const help = program.commands.find((command) => command.name() === 'help')
    expect(help?.aliases()).toContain('도움말')
    expect(KNOWN_COMMAND_TOKENS.has('도움말')).toBe(true)
    // 한국어 별칭도 commander 로 직행한다(자연어 라우터가 가로채지 않는다).
    expect(detectNaturalLanguageInput(['node', 'vhk', '도움말'])).toBeNull()
    expect(detectNaturalLanguageInput(['node', 'vhk', '도움말', '--all'])).toBeNull()
  })

  it('도움말 목록에는 별칭이 함께 보인다', () => {
    const output = formatRootHelp(program, program.createHelp())
    expect(output).toContain('help (도움말)')
  })
})
