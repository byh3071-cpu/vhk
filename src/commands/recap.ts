import { prompt } from '../lib/prompt.js'
import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import { getSessionDiff, getRecentCommits, isGitRepo, hasAnyCommits } from '../lib/git.js'
import { detectAdrCandidates, createAdrFile } from '../lib/adr.js'
import { detectTroubleshootingCommits } from '../lib/doc-suggest.js'
import { createTroubleshootingFile } from '../lib/troubleshooting.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { printSecurityWarnings } from '../lib/check-secure.js'
import { isInteractive } from '../lib/interactive.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { localDate } from '../lib/date.js'
import { getWorkingTreeChanges } from '../lib/git-repo.js'

export type RecapOptions = {
  since?: string
  // #288: 비-TTY(헤드리스 AI·파이프)·--yes 비대화형 회고 입력. 미지정 항목은 기본값/미입력 표식.
  summary?: string
  decisions?: string
  next?: string
  blockers?: string
  yes?: boolean
}

export async function recap(options: RecapOptions = {}) {
  if (!ensureNotHardStopped('recap')) return // VHK-020
  console.log(chalk.bold(`\n${ko.recap.title}\n`))

  if (!(await isGitRepo())) {
    console.log(chalk.red(ko.recap.noRepo))
    return
  }

  if (!(await hasAnyCommits())) {
    console.log(chalk.yellow('⚠️  아직 커밋이 없어요.'))
    console.log(chalk.gray('   파일을 추가하고 `vhk save` 또는 `git commit`으로 첫 커밋을 만들어 보세요.'))
    return
  }

  printSecurityWarnings()

  console.log(chalk.dim(`${ko.recap.analyzing}\n`))
  const since = options.since || localDate()
  const diff = await getSessionDiff(since)
  const commits = await getRecentCommits(10, since)
  const workingTree = getWorkingTreeChanges()

  if (diff.filesChanged === 0 && commits.length === 0 && workingTree.length === 0) {
    console.log(chalk.yellow(ko.recap.noChanges))
    return
  }

  console.log(chalk.bold('📊 변경 요약:'))
  console.log(`  파일: ${chalk.cyan(String(diff.filesChanged))}개 변경`)
  console.log(`  추가: ${chalk.green('+' + diff.insertions)} / 삭제: ${chalk.red('-' + diff.deletions)}`)

  if (diff.files.length > 0) {
    console.log(chalk.dim('\n  변경 파일:'))
    diff.files.slice(0, 15).forEach(f => {
      const icon = f.status === 'new' ? chalk.green('🆕')
        : f.status === 'deleted' ? chalk.red('🗑️')
        : chalk.yellow('✏️')
      console.log(`  ${icon} ${f.file}`)
    })
    if (diff.files.length > 15) {
      console.log(chalk.dim(`  ... 외 ${diff.files.length - 15}개`))
    }
  }

  if (commits.length > 0) {
    console.log(chalk.dim('\n  최근 커밋:'))
    commits.slice(0, 5).forEach(c => {
      console.log(chalk.dim(`  • ${c.message}`))
    })
  }

  if (workingTree.length > 0) {
    console.log(chalk.bold(`\n${ko.recap.workingTreeTitle}`))
    workingTree.slice(0, 15).forEach((w) => {
      console.log(chalk.yellow(`  • ${w.path}`))
    })
    if (workingTree.length > 15) {
      console.log(chalk.dim(`  ... 외 ${workingTree.length - 15}개`))
    }
  }

  console.log('')
  // #288: 비-TTY(헤드리스 AI·파이프) 또는 --yes 면 프롬프트 대신 플래그값(없으면 미입력 표식)으로
  // 회고를 구성한다. 과거엔 여기서 ensureInteractive 가 TTY_REQUIRED(exit 2)로 중단해 AI 워크플로가
  // 끊겼다(COMMANDS.md "오늘 한 일 정리해" 안내와 모순). 대화형 경로는 그대로 — 프롬프트 호출 금지
  // 규칙은 아래 비-TTY 분기(프롬프트 미호출)에서 지킨다.
  const interactive = isInteractive({ yes: options.yes })

  const autoSummary =
    !interactive && !options.summary?.trim() && workingTree.length > 0
      ? ko.recap.autoDirtySummary(
          workingTree.length,
          workingTree
            .slice(0, 5)
            .map((w) => w.path)
            .join(', ')
        )
      : undefined

  const answers = interactive
    ? await prompt<{ summary: string; decisions: string; nextTodo: string; blockers: string }>([
        {
          type: 'input',
          name: 'summary',
          message: ko.recap.summary,
        },
        {
          type: 'input',
          name: 'decisions',
          message: ko.recap.decisions,
          default: '없음',
        },
        {
          type: 'input',
          name: 'nextTodo',
          message: ko.recap.nextTodo,
        },
        {
          type: 'input',
          name: 'blockers',
          message: ko.recap.blockers,
          default: '없음',
        },
      ])
    : {
        summary: options.summary?.trim() || autoSummary || ko.recap.notProvided,
        decisions: options.decisions?.trim() || '없음',
        nextTodo: options.next?.trim() || ko.recap.notProvided,
        blockers: options.blockers?.trim() || '없음',
      }

  if (!interactive) console.log(chalk.dim(`  ${ko.recap.nonInteractiveNote}`))

  const today = localDate()
  const logDir = path.join(process.cwd(), 'docs', 'log')
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

  const existing = fs.readdirSync(logDir).filter(f => f.startsWith(today))
  const sessionNum = existing.length + 1
  const fileName = `${today}-session-${sessionNum}.md`
  const filePath = path.join(logDir, fileName)

  const fileList = diff.files
    .map(f => `| ${f.file} | ${f.status} |`)
    .join('\n')

  const commitList = commits
    .slice(0, 10)
    .map(c => `- \`${c.hash.slice(0, 7)}\` ${c.message}`)
    .join('\n')

  const content = [
    `# 세션 로그 — ${today} #${sessionNum}`,
    '',
    '## 작업 요약',
    answers.summary,
    '',
    '## 결정 사항',
    answers.decisions,
    '',
    '## 다음 할 일',
    answers.nextTodo,
    '',
    '## 블로커',
    answers.blockers,
    '',
    '## 변경 파일',
    `총 ${diff.filesChanged}개 파일 (+${diff.insertions} -${diff.deletions})`,
    '',
    '| 파일 | 상태 |',
    '|------|------|',
    fileList,
    '',
    '## 커밋 로그',
    commitList || '(커밋 없음)',
    '',
    '---',
    `*Generated by \`vhk recap\` at ${new Date().toISOString()}*`,
  ].join('\n')

  fs.writeFileSync(filePath, content, 'utf-8')

  const gitSaveCmd = process.platform === 'win32'
    ? 'git add .; git commit -m "recap: 세션 기록"'
    : 'git add . && git commit -m "recap: 세션 기록"'

  // #288: 비대화형(비-TTY/--yes)은 여기서 마무리한다 — ADR/트러블슈팅 후보는 읽기전용으로
  // 보고하되, 문서 자동 생성·CLAUDE.md 갱신처럼 프롬프트가 필관리자 경로는 건너뛴다(헤드리스 inquirer 금지).
  if (!interactive) {
    const adrCandidates = detectAdrCandidates(diff)
    if (adrCandidates.length > 0) {
      console.log(chalk.cyan.bold(`\n${ko.recap.adrDetected} (${adrCandidates.length}건)`))
      for (const candidate of adrCandidates) {
        console.log(chalk.cyan(`  • ${candidate.title}: ${candidate.context}`))
        candidate.files.forEach(f => console.log(chalk.dim(`    ${f}`)))
      }
    }
    const troubleCommits = detectTroubleshootingCommits(commits)
    if (troubleCommits.length > 0) {
      console.log(chalk.yellow.bold(`\n${ko.recap.troubleDetected} (${troubleCommits.length}건)`))
      troubleCommits.forEach(c => console.log(chalk.dim(`  • ${c.message}`)))
    }
    if (adrCandidates.length > 0 || troubleCommits.length > 0) {
      console.log(chalk.dim(`  ${ko.recap.detectSkipNonInteractive}`))
    }
    console.log(chalk.green.bold(`\n${ko.recap.done}`))
    console.log(chalk.dim(`  📄 ${path.relative(process.cwd(), filePath)}`))
    printNextStep({
      message: '오늘 기록 완료! 저장하고 싶으면:',
      command: gitSaveCmd,
      cursorHint: '저장해줘',
    })
    return
  }

  const adrCandidates = detectAdrCandidates(diff)
  if (adrCandidates.length > 0) {
    console.log(chalk.cyan.bold(`\n${ko.recap.adrDetected} (${adrCandidates.length}건)`))

    for (const candidate of adrCandidates) {
      console.log(chalk.cyan(`  • ${candidate.title}: ${candidate.context}`))
      candidate.files.forEach(f => console.log(chalk.dim(`    ${f}`)))
    }

    const { createAdr } = await prompt([{
      type: 'confirm',
      name: 'createAdr',
      message: ko.recap.createAdr,
      default: true,
    }])

    if (createAdr) {
      for (const candidate of adrCandidates) {
        const adrAnswers = await prompt([
          {
            type: 'input',
            name: 'decision',
            message: `🧭 [${candidate.title}] 어떤 결정을 내렸나요?`,
          },
          {
            type: 'input',
            name: 'consequences',
            message: '📝 이 결정의 결과/영향은?',
            default: '추후 확인',
          },
        ])

        const adrPath = createAdrFile(
          process.cwd(),
          candidate.title,
          candidate.context,
          adrAnswers.decision,
          adrAnswers.consequences,
        )
        console.log(chalk.green(`  ✅ ADR 생성: ${path.relative(process.cwd(), adrPath)}`))
      }
    }
  }

  // RFC 0051: 트러블슈팅 키워드 감지는 doc-suggest 단일 SoT 위임(work handoff 와 공유).
  const troubleCommits = detectTroubleshootingCommits(commits)

  if (troubleCommits.length > 0) {
    console.log(chalk.yellow.bold(`\n${ko.recap.troubleDetected} (${troubleCommits.length}건)`))
    troubleCommits.forEach(c => {
      console.log(chalk.dim(`  • ${c.message}`))
    })

    const { createTroubleshoot } = await prompt([{
      type: 'confirm',
      name: 'createTroubleshoot',
      message: ko.recap.createTroubleshoot,
      default: true,
    }])

    if (createTroubleshoot) {
      const tsAnswers = await prompt([
        {
          type: 'input',
          name: 'problem',
          message: '🐛 무슨 문제였나요? (증상)',
        },
        {
          type: 'input',
          name: 'cause',
          message: '🔍 원인은?',
        },
        {
          type: 'input',
          name: 'solution',
          message: '✅ 어떻게 해결했나요?',
        },
      ])

      // RFC 0051: 날짜형 파일명 → TS-NNN 채번(수동 TS 와 형식 통일).
      const tsFilePath = createTroubleshootingFile(
        process.cwd(),
        tsAnswers.problem,
        tsAnswers.cause,
        tsAnswers.solution,
        troubleCommits,
      )
      console.log(chalk.green(`  ✅ 트러블슈팅 문서 생성: ${path.relative(process.cwd(), tsFilePath)}`))
    }
  }

  console.log(chalk.green.bold(`\n${ko.recap.done}`))
  console.log(chalk.dim(`  📄 ${path.relative(process.cwd(), filePath)}`))

  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md')
  if (fs.existsSync(claudeMdPath)) {
    const { updateClaude } = await prompt([{
      type: 'confirm',
      name: 'updateClaude',
      message: ko.recap.updateClaude,
      default: true,
    }])

    if (updateClaude) {
      const original = fs.readFileSync(claudeMdPath, 'utf-8')
      // vhk init 템플릿(`- **마지막 업데이트:**`)과 수동 운영 형식(`**마지막 갱신:**`) 둘 다 지원.
      // nextTodo 는 사용자 입력 — replacement 문자열의 `$&`/`$1` 특수 토큰 해석을 막기 위해 콜백 사용.
      const claudeContent = original
        .replace(/- \*\*마지막 업데이트:\*\*.*/, `- **마지막 업데이트:** ${today}`)
        .replace(/\*\*마지막 갱신:\*\*.*/, `**마지막 갱신:** ${today}`)
        .replace(/- \*\*다음 액션:\*\*.*/, () => `- **다음 액션:** ${answers.nextTodo}`)
      if (claudeContent !== original) {
        fs.writeFileSync(claudeMdPath, claudeContent, 'utf-8')
        console.log(chalk.green('  ✅ CLAUDE.md 업데이트 완료'))
      } else {
        // 무매치(또는 이미 최신)인데 "완료"라고 말하던 거짓 성공 제거.
        console.log(
          chalk.yellow('  ⚠ CLAUDE.md에서 갱신 대상 줄을 찾지 못했거나 이미 최신입니다 — 변경 없음.')
        )
        console.log(chalk.gray('     (인식 형식: "- **마지막 업데이트:**" / "**마지막 갱신:**" / "- **다음 액션:**")'))
      }
    }
  }

  printNextStep({
    message: '오늘 기록 완료! 저장하고 싶으면:',
    command: gitSaveCmd,
    cursorHint: '저장해줘',
  })
}
