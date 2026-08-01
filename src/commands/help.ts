import chalk from 'chalk'
import type { Command, Help } from 'commander'

export const DEFAULT_HELP_HIDDEN_COMMANDS = [
  'content',
  'launch',
  'ops',
  'sell',
  'seo',
  'cost',
  'design-palette',
  'theme',
] as const

const DEFAULT_HELP_HIDDEN_SET = new Set<string>(DEFAULT_HELP_HIDDEN_COMMANDS)

export function formatRootHelp(
  cmd: Command,
  helper: Help,
  options: { all?: boolean } = {},
): string {
  const commands = helper
    .visibleCommands(cmd)
    .filter((command) => command.name() !== 'help')
    .filter((command) => options.all === true || !DEFAULT_HELP_HIDDEN_SET.has(command.name()))
  const terms = commands.map((command) => {
    const aliases = command.aliases()
    return aliases.length > 0 ? `${command.name()} (${aliases[0]})` : command.name()
  })
  const termWidth = Math.max(...terms.map((term) => term.length), 0)
  const lines = [
    helper.commandDescription(cmd),
    '',
    options.all === true ? '전체 명령:' : '기본 명령:',
    ...commands.map((command, index) => {
      const term = terms[index].padEnd(termWidth + 2)
      return `  ${term}${command.description()}`
    }),
  ]

  if (options.all !== true) {
    lines.push('', '전체 명령 보기: vhk help --all')
  }
  return lines.join('\n') + '\n'
}

/**
 * 초보자용 quick actions — 자연어 "도움말/사용법/명령어" 라우팅의 **읽기전용** 대상.
 * (적대 리뷰 HIGH 수정: 이전엔 도움말이 start 마법사로 라우팅돼 빈 디렉터리에서
 *  scaffold 가 유발됐다. 도움말은 절대 상태를 바꾸지 않는다 — 출력만.)
 */
export const QUICK_ACTIONS: ReadonlyArray<{ say: string; does: string }> = [
  { say: '상태 알려줘', does: 'vhk status' },
  { say: '뭐 바뀌었어?', does: 'vhk diff' },
  { say: '저장해줘', does: 'vhk save' },
  { say: '오늘 한 일 정리해줘', does: 'vhk recap' },
  { say: '다음에 뭐 하면 돼?', does: 'vhk goal next' },
  { say: '규칙 동기화해줘', does: 'vhk sync' },
  { say: '백업 복원해줘', does: 'vhk restore' },
  { say: '보안 점검해줘', does: 'vhk secure scan' },
  { say: '새 프로젝트 시작', does: 'vhk start' },
  { say: '전체 명령어 보기', does: 'vhk help --all' },
]

/** 자연어로 vhk 를 쓰는 법(quick actions) 출력. 부수효과 없음(콘솔 출력만). */
export function quickActions(): void {
  console.log(chalk.bold('\n🧭 VHK — 이렇게 말하면 됩니다 (quick actions)'))
  console.log(chalk.gray('─'.repeat(40)))
  for (const a of QUICK_ACTIONS) {
    console.log(`  "${chalk.cyan(a.say)}"  →  ${chalk.dim(a.does)}`)
  }
  console.log(chalk.gray('\n  기본 명령은 `vhk help`, 전체 명령은 `vhk help --all` 또는 COMMANDS.md 를 보세요.'))
  console.log('')
}
