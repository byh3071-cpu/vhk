import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import chalk from 'chalk'
import { prompt } from '../lib/prompt.js'
import ora from 'ora'
import { safeExecFile, safeExecFileStream } from '../lib/exec.js'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { readJsonFile } from '../lib/read-json.js'
import { localDate } from '../lib/date.js'
import { checkReleaseReadiness } from '../lib/release-readiness.js'

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

/**
 * CHANGELOG.md 에 신버전 스텁(`## [version] - date`)을 삽입한다 (자동화 D).
 * 버전 누락(2.3.1·2.3.2 미기록 사고) 방지용 안전망. 본문은 사람이 보강한다.
 * - 이미 해당 버전 항목이 있으면 원본 그대로 반환(멱등 — 사람이 미리 작성한 경우 no-op).
 * - 첫 릴리즈 항목(`## [x.y.z]`) 바로 앞에 삽입(= Unreleased 다음, 최신순 유지).
 * - 버전 항목이 하나도 없으면 끝에 덧붙임.
 */
export function insertChangelogStub(content: string, version: string, date: string): string {
  // CodeQL #6(js/incomplete-sanitization): `.`만 이스케이프하면 다른 정규식 메타문자
  // (|·*·+ 등)가 그대로 남아 다른 버전 항목과 오매칭될 수 있다 — 메타문자 전체를 이스케이프.
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`^## \\[${escaped}\\]`, 'm').test(content)) return content
  const stub = `## [${version}] - ${date}\n\n_변경 내역 작성 필요._\n\n`
  const firstEntry = content.match(/^## \[\d+\.\d+\.\d+\]/m)
  if (firstEntry && firstEntry.index !== undefined) {
    return content.slice(0, firstEntry.index) + stub + content.slice(firstEntry.index)
  }
  return content.trimEnd() + '\n\n' + stub
}

/**
 * CLAUDE.md 의 "**버전:** vX.Y.Z" 표기를 newVersion 으로 교체한다.
 * version-sync.test.ts 가드(package.json ↔ CLAUDE.md 버전줄 정합)를 publish 가 깨지 않도록,
 * package.json 범프와 반드시 짝으로 호출한다. 버전 번호만 바꾸고 뒤 설명 텍스트는 보존.
 * "**버전:**" 줄이 없으면 원본 그대로 반환(graceful no-op).
 */
export function bumpClaudeMdVersion(content: string, newVersion: string): string {
  return content.replace(/(\*\*버전:\*\*\s*v)\d+\.\d+\.\d+/, `$1${newVersion}`)
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
  // 릴리즈 커밋에 함께 들어가야 하는 파일:
  // - CHANGELOG.md: 자동화 D 스텁
  // - CLAUDE.md: publish 가 범프한 "**버전:**" 줄 — 빠지면 package.json↔CLAUDE.md 불일치가
  //   커밋에 박혀 CI version-sync 가 깨진다(v2.4.0 릴리즈서 실제 발생).
  const filesToAdd = ['package.json']
  if (existsSync('CHANGELOG.md')) filesToAdd.push('CHANGELOG.md')
  if (existsSync('CLAUDE.md')) filesToAdd.push('CLAUDE.md')
  const add = safeExecFile('git', ['add', ...filesToAdd])
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

export type PublishPreflightCode = 'wrong-branch' | 'dirty' | 'status-failed' | 'untracked-src'
export interface PublishPreflightResult {
  ok: boolean
  code?: PublishPreflightCode
  untrackedSrc?: string[]
}

/**
 * 발행 전 안전 점검(순수 판정) — feature 브랜치/미커밋 상태서 발행해 픽스 누락본이
 * npm latest 로 나가는 사고 방지(v2.3.1 오발행 사례). 브랜치 위반을 dirty 보다 우선 보고.
 * statusOk=false(git 상태 수집 실패)는 clean 으로 단정하지 않고 차단(fail-closed, 리뷰 A3-04).
 * untracked src 파일은 빌드(dist)에 포함돼 발행되므로 plan 문서류와 달리 차단(리뷰 A3-01).
 */
export function evaluatePublishPreflight(
  branch: string,
  trackedStatus: string,
  defaultBranch: string,
  opts: { statusOk?: boolean; untrackedSrc?: string[] } = {}
): PublishPreflightResult {
  if (branch !== defaultBranch) return { ok: false, code: 'wrong-branch' }
  if (opts.statusOk === false) return { ok: false, code: 'status-failed' }
  if (trackedStatus.trim()) return { ok: false, code: 'dirty' }
  if (opts.untrackedSrc && opts.untrackedSrc.length > 0) {
    return { ok: false, code: 'untracked-src', untrackedSrc: opts.untrackedSrc }
  }
  return { ok: true }
}

/**
 * git 상태를 수집해 발행 전 점검. defaultBranch 는 origin/HEAD 에서 감지(실패 시 'main').
 * untracked 중 plan 문서류는 산출물에 영향 없어 무시하되, src/ 의 untracked .ts 는
 * tsup 빌드에 포함돼 발행되므로 별도 검출해 차단.
 */
export function publishPreflight(): PublishPreflightResult & { branch: string; defaultBranch: string } {
  const br = safeExecFile('git', ['branch', '--show-current'])
  const branch = br.ok ? br.out.trim() : ''
  const head = safeExecFile('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  const defaultBranch = head.ok ? head.out.trim().split('/').pop() || 'main' : 'main'
  const st = safeExecFile('git', ['status', '--porcelain', '--untracked-files=no'])
  const trackedStatus = st.ok ? st.out : ''
  const untracked = safeExecFile('git', ['ls-files', '--others', '--exclude-standard', '--', 'src'])
  const untrackedSrc = untracked.ok
    ? untracked.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : []
  return {
    ...evaluatePublishPreflight(branch, trackedStatus, defaultBranch, {
      statusOk: st.ok && untracked.ok,
      untrackedSrc,
    }),
    branch,
    defaultBranch,
  }
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
        : pre.code === 'status-failed'
          ? t('publish.preflightStatusFailed')
          : pre.code === 'untracked-src'
            ? t('publish.preflightUntrackedSrc', (pre.untrackedSrc ?? []).join(', '))
            : t('publish.preflightDirty')
    console.log(chalk.red(`\n❌ ${msg}`))
    process.exitCode = 1
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

  // Goal 42: 릴리즈 준비 게이트 — 이전 릴리즈 섹션이 빈/플레이스홀더면 발행 차단.
  // (v2.4.0 사고: 본문 빈칸인 채 버전만 올라감. publish 스텁이 안 채워진 채 다음 릴리즈 방지.)
  if (existsSync('CHANGELOG.md')) {
    const readiness = checkReleaseReadiness(readFileSync('CHANGELOG.md', 'utf-8'))
    if (!readiness.ok) {
      console.log(chalk.red('\n❌ 릴리즈 준비 미완 — CHANGELOG 본문을 먼저 채운 뒤 발행하세요:'))
      for (const p of readiness.problems) console.log(chalk.yellow(`   - ${p}`))
      return
    }
  }

  const { bumpType } = await prompt<{ bumpType: BumpType }>([
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

  // version-sync 가드(package.json ↔ CLAUDE.md "**버전:**" 줄 정합)가 게이트에서 깨지지
  // 않도록 CLAUDE.md 버전줄도 같이 올린다. 원본을 보관해 실패/취소 시 그대로 복구(eol churn 0).
  const claudeMdOriginal = existsSync('CLAUDE.md') ? readFileSync('CLAUDE.md', 'utf-8') : null
  if (claudeMdOriginal !== null) {
    const bumped = bumpClaudeMdVersion(claudeMdOriginal, newVersion)
    if (bumped !== claudeMdOriginal) {
      writeFileSync('CLAUDE.md', bumped, 'utf-8')
      console.log(chalk.green('✅ CLAUDE.md 버전줄 동기화'))
    }
  }

  // 실패/취소 시 package.json + CLAUDE.md 를 원래 버전으로 되돌린다.
  const rollbackVersion = () => {
    pkg.version = currentVersion
    writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
    if (claudeMdOriginal !== null) writeFileSync('CLAUDE.md', claudeMdOriginal, 'utf-8')
  }

  // 빌드
  const buildSpinner = ora(t('publish.building')).start()
  const buildResult = safeExecFile('pnpm', ['build'])
  if (!buildResult.ok) {
    buildSpinner.fail(t('publish.buildFailed'))
    console.log(chalk.red(buildResult.err.slice(0, 500)))
    rollbackVersion()
    return
  }
  buildSpinner.succeed(t('publish.buildSuccess'))

  // 테스트
  const testSpinner = ora(t('publish.testing')).start()
  const testResult = safeExecFile('pnpm', ['test', '--run'])
  if (!testResult.ok) {
    testSpinner.fail(t('publish.testFailed'))
    console.log(chalk.red(testResult.err.slice(0, 500)))
    rollbackVersion()
    return
  }
  testSpinner.succeed(t('publish.testSuccess'))

  // 최종 확인
  const { confirm } = await prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: `v${newVersion}을 npm에 배포할까요?`,
      default: true,
    },
  ])

  if (!confirm) {
    rollbackVersion()
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
    // 버전 롤백 (publish 실패 시 package.json + CLAUDE.md 원래대로)
    rollbackVersion()
    console.log(chalk.gray(`📦 package.json 버전을 v${currentVersion}로 복구했습니다.`))
    return
  }
  console.log(chalk.green(`\n✔ ${t('publish.publishSuccess')}`))

  // CHANGELOG 스텁 (자동화 D) — 버전 누락 방지. 이미 항목 있으면 no-op. 본문은 사람이 보강.
  if (existsSync('CHANGELOG.md')) {
    const cl = readFileSync('CHANGELOG.md', 'utf-8')
    // VHK-019: toISOString().slice 는 UTC 기준 → KST 새벽 발행 시 하루 밀림. 로컬 날짜 사용.
    const date = localDate()
    const updated = insertChangelogStub(cl, newVersion, date)
    if (updated !== cl) {
      writeFileSync('CHANGELOG.md', updated, 'utf-8')
      console.log(chalk.green(`✅ CHANGELOG.md 에 [${newVersion}] 스텁 추가 — 본문 보강 필요`))
    }
  }

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
