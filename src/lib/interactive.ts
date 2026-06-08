import chalk from 'chalk'

// 프롬프트 가능 여부 단일출처. stdin TTY + --yes 아님.
// VHK_FORCE_INTERACTIVE=1 = Git Bash/MinTTY 탈출구. 비-TTY 는 undefined → !!.
export function isInteractive(opts?: { yes?: boolean }): boolean {
  if (opts?.yes) return false
  if (process.env.VHK_FORCE_INTERACTIVE === '1') return true
  return !!process.stdin.isTTY
}

// benign 프롬프트: 비대화형이면 ask 호출 없이 fallback (stdin 미접근 = MCP 안전).
// 대화형이면 그대로 ask — abort(Ctrl+C/ESC)는 삼키지 않고 전파한다.
// (비대화형은 위에서 early-return 하므로, 여기 도달한 abort 는 항상 "사용자 취소"다.
//  과거엔 이를 fallback 으로 바꿔 save 가 취소 의도를 무시하고 커밋하던 위험버그 — 제거.)
export async function promptOrDefault<T>(ask: () => Promise<T>, fallback: T, opts?: { yes?: boolean }): Promise<T> {
  if (!isInteractive(opts)) return fallback
  return await ask()
}

/**
 * 대화형 명령 진입 가드 — 비-TTY(파이프/CI/EOF stdin)면 inquirer 프롬프트가
 * `ERR_USE_AFTER_CLOSE` 로 크래시하므로, 진입부에서 friendly 안내 + 비-0 종료 신호 후 중단한다.
 * 반환 true = 대화형 진행 가능. (VHK-014)
 */
/**
 * 비-TTY 대화형 명령 거부 시 종료 코드 — generic 실패(1)와 구분(#153, CI/에이전트 감지용).
 * 값 2 = "자동으로 진행 불가, 사람 개입 필요" 라는 공통 의미로, blocker 의 HARD_STOP 트립
 * (agent.ts)도 같은 2를 쓴다. 구체 사유는 stderr 마커(TTY_REQUIRED / 🛑 HARD_STOP)로 구분.
 */
export const TTY_REQUIRED_EXIT_CODE = 2

export function ensureInteractive(hint = ''): boolean {
  if (isInteractive()) return true
  // 'TTY_REQUIRED' 마커 — 에이전트/CI 가 stderr 로 사유를 기계 감지(#153).
  console.error(chalk.yellow('  ⚠️  TTY_REQUIRED — 이 명령은 대화형 입력이 필요합니다 (비-TTY/파이프 환경 불가).'))
  if (hint) console.error(chalk.dim(`     ${hint}`))
  process.exitCode = TTY_REQUIRED_EXIT_CODE
  return false
}

/** 프롬프트 강제 종료/EOF 류 에러인지 — 전역 catch 에서 friendly 처리용. */
export function isPromptAbortError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /ERR_USE_AFTER_CLOSE|force closed|ExitPromptError|readline was closed|User force closed/i.test(msg)
}
