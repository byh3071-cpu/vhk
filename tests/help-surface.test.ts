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
