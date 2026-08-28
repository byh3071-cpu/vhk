/*
 * policy-baseline.ts — 사람이 정책 설정 해시를 명시적으로 고정하는 유일한 명령.
 *
 * 자율 레인이 이 writer를 import하거나 자동 호출하면 설정 변조를 스스로 승인할 수 있다.
 * 그래서 별도 command 모듈에 격리하고 `--confirm`과 공통 high-risk 가드를 모두 요구한다.
 */
import chalk from 'chalk'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { writePolicyBaseline } from '../lib/policy-baseline.js'
import { readPolicyConfigSnapshot } from '../lib/policy-config.js'
import { ensurePolicyFilesIgnored } from '../lib/policy-files.js'

export interface PolicyBaselineOptions {
  confirm?: boolean
}

export function policyBaseline(
  opts: PolicyBaselineOptions = {},
  cwd: string = process.cwd(),
): void {
  console.log(chalk.bold(`\n${ko.policy.baselineTitle}`))

  if (!opts.confirm) {
    console.log(chalk.red(`  ${ko.policy.baselineConfirmRequired}`))
    process.exitCode = 1
    printNextStep({
      message: ko.policy.baselineConfirmNext,
      command: 'vhk policy baseline --confirm',
      cursorHint: '정책 기준선 고정 명령 알려줘',
    })
    return
  }

  // 유효성 판정이 실패해도 손상된 로컬 정책 파일이 Git에 노출되면 안 된다.
  ensurePolicyFilesIgnored(cwd)
  const snapshot = readPolicyConfigSnapshot(cwd)
  const configPresent = snapshot.configPresent
  const config = snapshot.config
  if (config.failClosed) {
    console.log(chalk.red(`  ${ko.policy.configFailClosed(config.reasonCode ?? 'UNKNOWN')}`))
    process.exitCode = 1
    printNextStep({
      message: ko.policy.baselineConfigNext,
      command: 'vhk policy show',
      cursorHint: '권한 정책 보여줘',
    })
    return
  }

  try {
    writePolicyBaseline(cwd, snapshot)
    console.log(chalk.green(`  ${configPresent ? ko.policy.baselineWritten : ko.policy.baselineDefaultOffWritten}`))
  } catch (error) {
    const errorCode =
      error instanceof Error && 'code' in error
        ? (error as NodeJS.ErrnoException).code
        : undefined
    const code = typeof errorCode === 'string' ? errorCode : 'UNKNOWN'
    console.log(chalk.red(`  ${ko.policy.baselineWriteFailed(code)}`))
    process.exitCode = 1
    return
  }

  printNextStep({
    message: ko.policy.baselineShowNext,
    command: 'vhk policy show',
    cursorHint: '권한 정책 보여줘',
  })
}
