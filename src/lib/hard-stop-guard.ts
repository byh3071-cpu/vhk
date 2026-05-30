import chalk from 'chalk'
import { isHardStopActive, readHardStopReason } from './state-files.js'

/**
 * VHK-020: `.vhk/HARD_STOP` 트립와이어 가드.
 *
 * HARD_STOP 이 존재하면 위험/자동화 작업을 즉시 차단한다 — 사유를 출력하고
 * `process.exitCode = 1` 설정 후 `false` 를 반환하므로, 호출부는 곧바로 `return` 하면 된다.
 *
 * 적용처: CLI high-risk chokepoint(guardCli) + harness/recap/ship.
 * 제외: `resume`(해제 명령) · `blocker`/`learn`(트립와이어를 *생성*하는 쪽) · 읽기전용(status 등).
 * 해제는 사람이 직접 `vhk resume --confirm` 으로만 — 자동 호출 금지(CLAUDE.md Safety).
 *
 * @returns 진행 가능하면 true, HARD_STOP 으로 차단되면 false.
 */
export function ensureNotHardStopped(action: string): boolean {
  if (!isHardStopActive()) return true
  console.error(chalk.red.bold(`\n🛑 HARD STOP 활성 — '${action}' 을(를) 실행하지 않았습니다.`))
  const reason = readHardStopReason()
  if (reason) console.error(chalk.dim(`   사유: ${reason.replace(/\s*\n\s*/g, ' ')}`))
  console.error(chalk.dim('   해제: vhk resume --confirm (사람이 직접 실행)'))
  process.exitCode = 1
  return false
}
