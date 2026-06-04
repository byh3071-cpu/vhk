import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import chalk from 'chalk'
import inquirer from 'inquirer'
import ora from 'ora'
import { safeExecFile, safeExecFileStream } from '../lib/exec.js'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { readJsonFile } from '../lib/read-json.js'

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

export interface GitReleaseResult {
  // git add 성공 여부
  added: boolean
  // git commit 성공 여부
  committed: boolean
  // git tag 생성 성공 여부
  tagged: boolean
  // git push + push --tags 모두 성공 여부
  pushed: boolean
  // 사용자에게 보여줄 경고 (실패 단계 안내). 정상이면 undefined.
  warning?: string
}

/**
 * npm publish 성공 후 git 후처리 (add → commit → tag → push).
 * 중요: commit 실패 시 tag 를 만들지 않는다 — 잘못된 HEAD 에 tag 가 박히는 것을 방지.
 * npm publish 는 이미 성공했으므로 어떤 실패에서도 package.json 롤백은 하지 않는다.
 */
export function gitPostRelease(newVersion: string): GitReleaseResult {
  const add = safeExecFile('git', ['add', 'package.json'])
  if (!add.ok) {
    return {
      added: false,
      committed: false,
      tagged: false,
      pushed: false,
      warning: `git add 실패 — 커밋/태그/푸시를 건너뜁니다. 수동으로 처리하세요.`,
    }
  }

  const commit = safeExecFile('git', ['commit', '-m', `chore: release v${newVersion}`])
  if (!commit.ok) {
    // commit hook 실패 / dirty state / nothing-to-commit 등 → tag 생성 금지 (HEAD 가 잘못된 곳을 가리킴).
    return {
      added: true,
      committed: false,
      tagged: false,
      pushed: false,
      warning:
        `git commit 실패 — git tag 를 건너뜁니다 (잘못된 HEAD 에 태그 방지).\n` +
        `    ${commit.err.slice(0, 300)}\n` +
        `    수동 처리: git commit && git tag v${newVersion} && git push --tags`,
    }
  }

  const tag = safeExecFile('git', ['tag', `v${newVersion}`])
  if (!tag.ok) {
    return {
      added: true,
      committed: true,
      tagged: false,
      pushed: false,
      warning: `git tag 생성 실패 (수동: git tag v${newVersion}). ${tag.err.slice(0, 200)}`,
    }
  }

  const push = safeExecFile('git', ['push'])
  const pushTags = safeExecFile('git', ['push', '--tags'])
  return {
    added: true,
    committed: true,
    tagged: true,
    pushed: push.ok && pushTags.ok,
  }
}

export type PublishPreflightCode = 'wrong-branch' | 'dirty'
export interface PublishPreflightResult {
  ok: boolean
  code?: PublishPreflightCode
}

/**
 * 발행 전 안전 점검(순수 판정) — feature 브랜치/미커밋 상태서 발행해 픽스 누락본이
 * npm latest 로 나가는 사고 방지(v2.3.1 오발행 사례). 브랜치 위반을 dirty 보다 우선 보고.
 */
export function evaluatePublishPreflight(
  branch: string,
  trackedStatus: string,
  defaultBranch: string
): PublishPreflightResult {
  if (branch !== defaultBranch) return { ok: false, code: 'wrong-branch' }
  if (trackedStatus.trim()) return { ok: false, code: 'dirty' }
  return { ok: true }
}

/**
 * git 상태를 수집해 발행 전 점검. defaultBranch 는 origin/HEAD 에서 감지(실패 시 'main').
 * untracked 파일(미커밋 plan 문서 등)은 발행 산출물에 영향 없어 검사 제외(tracked 변경만).
 */
export function publishPreflight(): PublishPreflightResult & { branch: string; defaultBranch: string } {
  const br = safeExecFile('git', ['branch', '--show-current'])
  const branch = br.ok ? br.out.trim() : ''
  const head = safeExecFile('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  const defaultBranch = head.ok ? head.out.trim().split('/').pop() || 'main' : 'main'
  const st = safeExecFile('git', ['status', '--porcelain', '--untracked-files=no'])
  const trackedStatus = st.ok ? st.out : ''
  return { ...evaluatePublishPreflight(branch, trackedStatus, defaultBranch), branch, defaultBranch }
}

export async function publish(): Promise<void> {
  console.log(chalk.bold('\n📦 ' + t('publish.title')))
  console.log(chalk.gray('─'.repeat(40)))

  // 발행 전 안전 점검 — feature 브랜치/미커밋서 발행해 픽스 누락본이 latest 로 나가는 사고 방지(v2.3.1 사례)
  const pre = publishPreflight()
  if (!pre.ok) {
    const msg =
      pre.code === 'wrong-branch'
        ? t('publish.preflightWrongBranch', pre.branch || '(detached)', pre.defaultBranch)
        : t('publish.preflightDirty')
    console.log(chalk.red(`\n❌ ${msg}`))
    return
  }

  if (!existsSync('package.json')) {
    console.log(chalk.red('❌ package.json을 찾을 수 없습니다.'))
    return
  }

  let pkg: Pkg
  try {
    pkg = readJsonFile<Pkg>('package.json')
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

  // npm publish — 2FA 인증(OTP 입력 또는 웹 기반 URL 클릭) 지원을 위해 stdio inherit 사용.
  // spinner는 stdin/stdout 점유 충돌 회피 위해 사용 안 함.
  console.log(chalk.cyan(`\n📤 ${t('publish.publishing')}`))
  console.log(chalk.gray('   2FA 활성화 시: OTP 6자리 입력 또는 브라우저 인증 URL 클릭 (Windows Hello / PIN 지원)'))
  const pubResult = safeExecFileStream('npm', ['publish', '--access', 'public'])
  if (!pubResult.ok) {
    console.log(chalk.red(`\n✖ ${t('publish.publishFailed')}`))
    console.log(chalk.red(pubResult.err.slice(0, 500)))
    // 버전 롤백 (publish 실패 시 package.json 원래대로)
    pkg.version = currentVersion
    writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
    console.log(chalk.gray(`📦 package.json 버전을 v${currentVersion}로 복구했습니다.`))
    return
  }
  console.log(chalk.green(`\n✔ ${t('publish.publishSuccess')}`))

  // git 후처리 (옵션 — 실패해도 npm publish 는 이미 성공, package.json 롤백 안 함)
  const git = gitPostRelease(newVersion)
  if (git.warning) {
    console.log(chalk.yellow(`\n⚠️  ${git.warning}`))
    console.log(chalk.dim(`    npm 배포는 이미 성공했습니다 (v${newVersion}).`))
  } else if (git.tagged && git.pushed) {
    console.log(chalk.green(`\n🏷️  git tag v${newVersion} 생성 + push 완료`))
  } else if (git.tagged) {
    console.log(chalk.yellow(`\n🏷️  git tag v${newVersion} 생성됨 (push는 수동으로)`))
  }

  console.log(chalk.green.bold(`\n🎉 v${newVersion} 배포 완료!`))
  printNextStep({
    message: 'npm 배포 완료!',
    command: 'vhk status',
    cursorHint: '상태 확인해줘',
  })
}
