import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import chalk from 'chalk'
import inquirer from 'inquirer'
import ora from 'ora'
import { safeExecFile } from '../lib/exec.js'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'

export type BumpType = 'patch' | 'minor' | 'major'

export function bumpVersion(current: string, type: BumpType): string {
  const [major, minor, patch] = current.split('.').map((n) => parseInt(n, 10) || 0)
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

interface Pkg {
  version?: string
  [key: string]: unknown
}

export async function publish(): Promise<void> {
  console.log(chalk.bold('\n📦 ' + t('publish.title')))
  console.log(chalk.gray('─'.repeat(40)))

  if (!existsSync('package.json')) {
    console.log(chalk.red('❌ package.json을 찾을 수 없습니다.'))
    return
  }

  let pkg: Pkg
  try {
    pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
  } catch {
    console.log(chalk.red('❌ package.json 파싱 실패'))
    return
  }

  const currentVersion = pkg.version || '0.0.0'
  console.log(chalk.cyan(`\n📌 현재 버전: v${currentVersion}`))

  const { bumpType } = await inquirer.prompt<{ bumpType: BumpType }>([
    {
      type: 'list',
      name: 'bumpType',
      message: t('publish.selectBump'),
      choices: [
        { name: `🔧 patch (${bumpVersion(currentVersion, 'patch')}) — 버그 수정`, value: 'patch' },
        { name: `✨ minor (${bumpVersion(currentVersion, 'minor')}) — 새 기능`, value: 'minor' },
        { name: `💥 major (${bumpVersion(currentVersion, 'major')}) — 호환성 변경`, value: 'major' },
      ],
    },
  ])

  const newVersion = bumpVersion(currentVersion, bumpType)
  console.log(chalk.cyan(`\n🆕 새 버전: v${newVersion}`))

  pkg.version = newVersion
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  console.log(chalk.green('✅ package.json 버전 업데이트'))

  // 빌드
  const buildSpinner = ora(t('publish.building')).start()
  const buildResult = safeExecFile('pnpm', ['build'])
  if (!buildResult.ok) {
    buildSpinner.fail(t('publish.buildFailed'))
    console.log(chalk.red(buildResult.err.slice(0, 500)))
    pkg.version = currentVersion
    writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
    return
  }
  buildSpinner.succeed(t('publish.buildSuccess'))

  // 테스트
  const testSpinner = ora(t('publish.testing')).start()
  const testResult = safeExecFile('pnpm', ['test', '--run'])
  if (!testResult.ok) {
    testSpinner.fail(t('publish.testFailed'))
    console.log(chalk.red(testResult.err.slice(0, 500)))
    pkg.version = currentVersion
    writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
    return
  }
  testSpinner.succeed(t('publish.testSuccess'))

  // 최종 확인
  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: `v${newVersion}을 npm에 배포할까요?`,
      default: true,
    },
  ])

  if (!confirm) {
    pkg.version = currentVersion
    writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
    console.log(chalk.gray('취소됨. 버전이 원래대로 복구됩니다.'))
    return
  }

  // npm publish
  const pubSpinner = ora(t('publish.publishing')).start()
  const pubResult = safeExecFile('npm', ['publish', '--access', 'public'])
  if (!pubResult.ok) {
    pubSpinner.fail(t('publish.publishFailed'))
    console.log(chalk.red(pubResult.err.slice(0, 500)))
    return
  }
  pubSpinner.succeed(t('publish.publishSuccess'))

  // git tag (옵션 — 실패해도 publish는 성공)
  const addResult = safeExecFile('git', ['add', 'package.json'])
  if (addResult.ok) {
    safeExecFile('git', ['commit', '-m', `chore: release v${newVersion}`])
    const tagResult = safeExecFile('git', ['tag', `v${newVersion}`])
    if (tagResult.ok) {
      const pushResult = safeExecFile('git', ['push'])
      const pushTagsResult = safeExecFile('git', ['push', '--tags'])
      if (pushResult.ok && pushTagsResult.ok) {
        console.log(chalk.green(`\n🏷️  git tag v${newVersion} 생성 + push 완료`))
      } else {
        console.log(chalk.yellow(`\n🏷️  git tag v${newVersion} 생성됨 (push는 수동으로)`))
      }
    }
  }

  console.log(chalk.green.bold(`\n🎉 v${newVersion} 배포 완료!`))
  printNextStep({
    message: 'npm 배포 완료!',
    command: 'vhk status',
    cursorHint: '상태 확인해줘',
  })
}
