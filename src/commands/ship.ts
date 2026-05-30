import chalk from 'chalk'
import inquirer from 'inquirer'
import fs from 'node:fs'
import path from 'node:path'
import { ko } from '../i18n/ko.js'
import { log } from '../utils/logger.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'

const CHECKLIST = [
  { id: 'build', questionKey: 'checkBuild' as const, hintKey: 'hintBuild' as const },
  { id: 'test', questionKey: 'checkTest' as const, hintKey: 'hintTest' as const },
  { id: 'version', questionKey: 'checkVersion' as const, hintKey: 'hintVersion' as const },
  { id: 'changelog', questionKey: 'checkChangelog' as const, hintKey: 'hintChangelog' as const },
  { id: 'security', questionKey: 'checkSecurity' as const, hintKey: 'hintSecurity' as const },
  { id: 'commit', questionKey: 'checkCommit' as const, hintKey: 'hintCommit' as const },
]

function sanitizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '').replace(/[^a-zA-Z0-9._-]/g, '-') || '0.0.0'
}

export type ChangelogUpdateResult =
  | { status: 'missing' }
  | { status: 'no-unreleased' }
  | { status: 'updated'; version: string }

/**
 * CHANGELOG.md의 `## [Unreleased]` 섹션을 `## [VERSION] — DATE`로 이동하고
 * 빈 `## [Unreleased]` 섹션을 그 위에 새로 만든다. 멱등성 보장 안 됨 (같은 버전 두 번 호출 시 중복).
 */
export function updateChangelogUnreleased(
  cwd: string,
  version: string,
  date: string
): ChangelogUpdateResult {
  const changelogPath = path.join(cwd, 'CHANGELOG.md')
  if (!fs.existsSync(changelogPath)) return { status: 'missing' }

  const content = fs.readFileSync(changelogPath, 'utf-8')
  const unreleasedHeading = /^## \[Unreleased\][^\n]*$/m

  if (!unreleasedHeading.test(content)) return { status: 'no-unreleased' }

  const blankUnreleased = [
    '## [Unreleased]',
    '',
    '### Added',
    '- ',
    '',
    '### Fixed',
    '- ',
    '',
    '---',
    '',
    `## [${version}] — ${date}`,
  ].join('\n')

  const updated = content.replace(unreleasedHeading, blankUnreleased)
  fs.writeFileSync(changelogPath, updated, 'utf-8')
  return { status: 'updated', version }
}

export async function ship() {
  if (!ensureNotHardStopped('ship')) return // VHK-020
  console.log(chalk.bold(`\n${ko.ship.title}\n`))

  const cwd = process.cwd()

  console.log(chalk.cyan.bold(`  ${ko.ship.checklist}\n`))

  const { passed } = await inquirer.prompt<{ passed: string[] }>([{
    type: 'checkbox',
    name: 'passed',
    message: ko.ship.checkboxPrompt,
    choices: CHECKLIST.map(c => ({
      name: `${ko.ship[c.questionKey]} ${chalk.dim(`(${ko.ship[c.hintKey]})`)}`,
      value: c.id,
    })),
  }])

  const allPassed = passed.length === CHECKLIST.length
  const skipped = CHECKLIST.filter(c => !passed.includes(c.id))

  if (!allPassed) {
    console.log(chalk.yellow(`\n  ${ko.ship.incompleteHeader}`))
    skipped.forEach(s => {
      console.log(chalk.yellow(`    • ${ko.ship[s.questionKey]}`))
      console.log(chalk.dim(`      → ${ko.ship[s.hintKey]}`))
    })

    const { proceed } = await inquirer.prompt<{ proceed: boolean }>([{
      type: 'confirm',
      name: 'proceed',
      message: ko.ship.proceedConfirm,
      default: false,
    }])

    if (!proceed) {
      printNextStep({
        message: ko.ship.retryMessage,
        command: 'vhk 배포',
        cursorHint: ko.ship.retryCursorHint,
      })
      return
    }
  } else {
    console.log(chalk.green(`\n  ${ko.ship.allPassed}\n`))
  }

  console.log(chalk.cyan.bold(`  ${ko.ship.retro}\n`))

  console.log(chalk.dim(`  ${ko.ship.versionHint}`))
  const retro = await inquirer.prompt<{
    version: string
    whatWentWell: string
    whatWentWrong: string
    learned: string
    nextVersion: string
  }>([
    { type: 'input', name: 'version', message: ko.ship.versionPrompt },
    { type: 'input', name: 'whatWentWell', message: ko.ship.questionWell },
    { type: 'input', name: 'whatWentWrong', message: ko.ship.questionWrong },
    { type: 'input', name: 'learned', message: ko.ship.questionLearned },
    { type: 'input', name: 'nextVersion', message: ko.ship.questionNext },
  ])

  const buildLogDir = path.join(cwd, 'docs', 'build-log')
  if (!fs.existsSync(buildLogDir)) fs.mkdirSync(buildLogDir, { recursive: true })

  const today = new Date().toISOString().split('T')[0]
  const versionSlug = sanitizeVersion(retro.version)
  const fileName = `${today}-v${versionSlug}.md`
  const filePath = path.join(buildLogDir, fileName)

  const content = [
    `# 빌드 로그: v${versionSlug}`,
    '',
    `**배포일:** ${today}`,
    `**버전:** ${versionSlug}`,
    '',
    '## 체크리스트',
    ...CHECKLIST.map(c =>
      `- [${passed.includes(c.id) ? 'x' : ' '}] ${ko.ship[c.questionKey]}`
    ),
    '',
    '## 회고',
    '',
    '### ✅ 잘된 점',
    retro.whatWentWell || ko.ship.emptySection,
    '',
    '### ❌ 어려웠던 점',
    retro.whatWentWrong || ko.ship.emptySection,
    '',
    '### 💡 배운 점',
    retro.learned || ko.ship.emptySection,
    '',
    '### 🔮 다음 버전',
    retro.nextVersion || ko.ship.emptyNext,
    '',
    '---',
    `*Generated by \`vhk ship\` at ${new Date().toISOString()}*`,
  ].join('\n')

  fs.writeFileSync(filePath, content, 'utf-8')

  console.log(chalk.green(`\n  ${ko.ship.buildLogDone(path.relative(cwd, filePath))}`))

  const changelogResult = updateChangelogUnreleased(cwd, versionSlug, today)
  if (changelogResult.status === 'updated') {
    log.success(ko.ship.changelogUpdated(changelogResult.version))
  } else if (changelogResult.status === 'no-unreleased') {
    log.warn(ko.ship.changelogNoUnreleased)
  } else {
    log.info(ko.ship.changelogMissing)
  }

  printNextStep({
    message: ko.ship.deployMessage,
    command: 'npm publish --access=public',
    cursorHint: ko.ship.deployCursorHint,
    alternative: `GitHub 태그도 만들면 좋아요: git tag v${versionSlug}`,
  })
}
