import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import {
  scanProjectForSecrets,
  MAX_SECRET_FINDINGS,
} from '../lib/scan-secrets.js'
import { MAX_SCAN_FILE_BYTES } from '../lib/scan-files.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'

export async function secure() {
  console.log(chalk.bold(`\n${ko.secure.title}\n`))

  const cwd = process.cwd()
  const gitignorePath = path.join(cwd, '.gitignore')
  const hasGitignore = fs.existsSync(gitignorePath)

  if (!hasGitignore) {
    console.log(chalk.yellow(`  ${ko.secure.noGitignore}`))
    console.log(chalk.dim('  .env 파일이 커밋될 수 있습니다.\n'))
  } else {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8')
    if (!gitignoreContent.includes('.env')) {
      console.log(chalk.yellow(`  ${ko.secure.noEnvInGitignore}`))
      console.log(chalk.dim('  추가를 권장합니다.\n'))
    }
  }

  console.log(chalk.dim(`  ${ko.secure.scanning}\n`))

  const { findings, scannedFiles, truncated, truncationReasons } = scanProjectForSecrets(cwd)

  console.log(chalk.dim(`  📂 ${scannedFiles}개 파일 스캔 완료 (lock·node_modules·>${MAX_SCAN_FILE_BYTES / 1024}KB 제외)`))
  if (truncated) {
    // Goal 59: truncated 는 이제 findings-cap 뿐 아니라 file-size·line-length 도 포함 → 실제 사유를 정직하게 표기.
    const reasonText = truncationReasons
      .map((r) =>
        r === 'findings-cap'
          ? `발견 ${MAX_SECRET_FINDINGS}건 한도 도달`
          : r === 'file-size'
            ? `${MAX_SCAN_FILE_BYTES / 1024}KB 초과 파일 스킵`
            : r === 'line-length'
              ? '초장문(4000자 초과) 라인 스킵'
              : r
      )
      .join(', ')
    console.log(chalk.yellow(`  ⚠️  스캔 불완전 — 일부 미검사(${reasonText}). 결과가 완전하지 않을 수 있습니다.`))
  }
  console.log('')

  if (findings.length === 0) {
    console.log(chalk.green.bold(`  ${ko.secure.clean}`))
    printNextStep({
      message: '보안 이상 없음! 깨끗합니다.',
      command: 'vhk 정리',
      cursorHint: '오늘 한 일 정리해줘',
    })
    return
  }

  const critical = findings.filter(f => f.severity === 'critical')
  const high = findings.filter(f => f.severity === 'high')
  const medium = findings.filter(f => f.severity === 'medium')

  if (critical.length > 0) {
    console.log(chalk.red.bold(`  🚨 CRITICAL — ${critical.length}건`))
    critical.forEach(f => {
      console.log(chalk.red(`    ✖ ${f.patternName}`))
      console.log(chalk.dim(`      ${f.file}:${f.line} → ${f.match}`))
    })
    console.log('')
  }

  if (high.length > 0) {
    console.log(chalk.yellow.bold(`  ⚠️ HIGH — ${high.length}건`))
    high.forEach(f => {
      console.log(chalk.yellow(`    ⚠ ${f.patternName}`))
      console.log(chalk.dim(`      ${f.file}:${f.line} → ${f.match}`))
    })
    console.log('')
  }

  if (medium.length > 0) {
    console.log(chalk.blue.bold(`  ℹ MEDIUM — ${medium.length}건`))
    medium.forEach(f => {
      console.log(chalk.blue(`    ℹ ${f.patternName}`))
      console.log(chalk.dim(`      ${f.file}:${f.line} → ${f.match}`))
    })
    console.log('')
  }

  console.log(chalk.bold(`  ${ko.secure.summary}`))
  console.log(`  총 ${chalk.red(String(findings.length))}건 감지 | CRITICAL: ${critical.length} | HIGH: ${high.length} | MEDIUM: ${medium.length}`)
  console.log('')
  console.log(chalk.dim('  💡 조치 방법:'))
  console.log(chalk.dim('    1. 해당 파일에서 시크릿을 제거하고 환경변수로 이동'))
  console.log(chalk.dim('    2. git history에서도 제거: git filter-branch 또는 BFG Repo-Cleaner'))
  console.log(chalk.dim('    3. 유출된 키는 즉시 폐기하고 재발급\n'))

  if (critical.length > 0 || high.length > 0) {
    process.exitCode = 1
  }
}
