import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import { SECRET_PATTERNS, maskSecret, type SecretFinding } from '../lib/secret-patterns.js'
import { walkProjectFiles, MAX_SCAN_FILE_BYTES } from '../lib/scan-files.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'

const MAX_FINDINGS = 200
const MAX_LINE_CHARS = 4_000

export async function secure() {
  console.log(chalk.bold(`\n${ko.secure.title}\n`))

  const cwd = process.cwd()
  const findings: SecretFinding[] = []
  let scannedFiles = 0
  let truncated = false

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

  walkProjectFiles(cwd, (filePath, relPath) => {
    scannedFiles++
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    for (const pattern of SECRET_PATTERNS) {
      if (truncated) break

      lines.forEach((line, idx) => {
        if (truncated) return
        if (line.length > MAX_LINE_CHARS) return

        const trimmed = line.trim()
        if (trimmed.startsWith('//') && trimmed.includes('example')) return
        if (trimmed.startsWith('#') && trimmed.includes('example')) return

        const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags)
        let match: RegExpExecArray | null
        while ((match = regex.exec(line)) !== null) {
          findings.push({
            patternId: pattern.id,
            patternName: pattern.name,
            severity: pattern.severity,
            file: relPath,
            line: idx + 1,
            match: maskSecret(match[0]),
          })
          if (findings.length >= MAX_FINDINGS) {
            truncated = true
            return
          }
        }
      })
    }
  })

  console.log(chalk.dim(`  📂 ${scannedFiles}개 파일 스캔 완료 (lock·node_modules·>${MAX_SCAN_FILE_BYTES / 1024}KB 제외)`))
  if (truncated) {
    console.log(chalk.yellow(`  ⚠️  결과 ${MAX_FINDINGS}건에서 출력을 제한했습니다. lock 파일 등은 자동 제외됩니다.`))
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
