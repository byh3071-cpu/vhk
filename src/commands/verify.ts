import chalk from 'chalk'
import { readConfig } from '../lib/config.js'
import { SAFETY_MODE_DESC } from '../lib/safety-mode.js'
import { printNextStep } from '../lib/next-step.js'

/**
 * 저장/위험 작업 전 돌려야 하는 검증 묶음 — 현재는 "메타러너 자리"(lite).
 * 실제 실행은 사용자/CI 가 돌리는 기계 게이트를 가리키고, 여기선 묶음을 안내만 한다.
 * (PRD: 검증 루프 강제 ≠ 전문 개발자 대체. 기계 게이트 위에 얹는 안내층.)
 */
export function verificationChecklist(): string[] {
  return [
    '타입 체크 — pnpm exec tsc --noEmit',
    '테스트 — pnpm run test:run',
    '빌드 — pnpm run build',
    '보안 스캔 — vhk secure scan',
  ]
}

export async function verify(): Promise<void> {
  console.log(chalk.bold('\n🔎 검증 묶음 (verify — lite)'))
  console.log(chalk.gray('─'.repeat(40)))

  const mode = readConfig().safetyMode
  console.log(chalk.dim(`  현재 Safety Mode: ${mode} — ${SAFETY_MODE_DESC[mode]}`))
  console.log(chalk.cyan('\n  위험 작업/저장 전 권장 검증:'))
  for (const item of verificationChecklist()) {
    console.log(`   ☐ ${item}`)
  }
  console.log(chalk.dim('\n  ※ 메타러너(자동 실행) 자리 — 현재는 묶음 안내만(lite).'))

  printNextStep({
    message: '검증 통과 후 저장하세요:',
    command: 'vhk save',
    cursorHint: '저장해줘',
  })
}
