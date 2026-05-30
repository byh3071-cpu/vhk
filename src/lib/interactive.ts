import chalk from 'chalk'

/**
 * 대화형 명령 진입 가드 — 비-TTY(파이프/CI/EOF stdin)면 inquirer 프롬프트가
 * `ERR_USE_AFTER_CLOSE` 로 크래시하므로, 진입부에서 friendly 안내 + 비-0 종료 신호 후 중단한다.
 * 반환 true = 대화형 진행 가능. (VHK-014)
 */
export function ensureInteractive(hint = ''): boolean {
  if (process.stdin.isTTY) return true
  console.error(chalk.yellow('  ⚠️  이 명령은 대화형 입력이 필요합니다 — 비-TTY/파이프 환경에서는 실행할 수 없어요.'))
  if (hint) console.error(chalk.dim(`     ${hint}`))
  process.exitCode = 1
  return false
}

/** 프롬프트 강제 종료/EOF 류 에러인지 — 전역 catch 에서 friendly 처리용. */
export function isPromptAbortError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /ERR_USE_AFTER_CLOSE|force closed|ExitPromptError|readline was closed|User force closed/i.test(msg)
}
