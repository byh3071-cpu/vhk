import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { checkContextDrift } from './drift.js'

export interface NextStep {
  message: string
  command?: string
  alternative?: string
  cursorHint?: string
}

export function printNextStep(step: NextStep) {
  console.log('')
  console.log(chalk.cyan.bold('━━━ 다음에 이것만 하세요 ━━━'))
  console.log('')
  console.log(`  ${step.message}`)

  if (step.command) {
    console.log('')
    console.log(chalk.white.bgGray(' 터미널에 복붙 '))
    console.log(chalk.green(`  ${step.command}`))
  }

  if (step.cursorHint) {
    console.log('')
    console.log(chalk.white.bgBlue(' Cursor에게 말하기 '))
    console.log(chalk.blue(`  "${step.cursorHint}"`))
  }

  if (step.alternative) {
    console.log('')
    console.log(chalk.dim(`  또는: ${step.alternative}`))
  }

  console.log('')
  console.log(chalk.cyan.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log('')
}

// Goal 10: `vhk context` 발견성. 세션 진입 명령(status 등) 끝에 한 줄로 노출 →
// AI/사람이 "재개하려면 vhk context" 를 자연스럽게 보게 한다.
//   - .vhk/context.md 없음                 → 생성 안내
//   - 반영 소스가 실제 변경됨(checkContextDrift) → 갱신 안내
//   - 그 외                                → 복원(읽기) 안내
// stale 판정은 자체 mtime 휴리스틱 대신 검증된 checkContextDrift(footer git sha +
// file-change 기반)를 재사용 — 일반 커밋도 정확히 감지(.git/HEAD mtime 은 커밋으로 안 바뀜).
// 경로는 context 커맨드와 동일하게 cwd 기준(.vhk/context.md). 호출부는 인자 없이 cwd 사용.
export function printContextResumeHint(cwd: string = process.cwd()): void {
  const ctxPath = path.join(cwd, '.vhk', 'context.md')
  if (!fs.existsSync(ctxPath)) {
    console.log(chalk.dim(`  ${t('context.resumeMissing')}`))
    return
  }
  const drift = checkContextDrift(cwd)
  if (drift.checked && drift.stale) {
    console.log(chalk.dim(`  ${t('context.resumeStale')}`))
    return
  }
  console.log(chalk.dim(`  ${t('context.resumeExists')}`))
}
