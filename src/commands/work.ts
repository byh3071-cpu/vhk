import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { safeExecFile } from '../lib/exec.js'
import { isHardStopActive, readHardStopReason } from '../lib/state-files.js'
import { listGoals } from '../lib/goal-frontmatter.js'
import { selectActiveId } from './goal.js'
import { context } from './context.js'
import { copyToClipboard } from '../lib/clipboard.js'
import { detectDocCandidates, formatDocCandidatesForPrompt, type DocCandidates } from '../lib/doc-suggest.js'
import { getSessionDiff, getRecentCommits } from '../lib/git.js'
import { localDate } from '../lib/date.js'

const VHK_DIR = '.vhk'

// vhk work / vhk work handoff — AI 작업 세션 시작/인수인계.
// 핵심 원칙: CLI 는 "상태 수집 + Claude 에게 줄 프롬프트 준비" 만 한다.
// 실제 판단·개발·커밋은 Claude 가 한다. 커밋/stash/reset/goal done/파일 삭제는 절대 안 한다.

// git status --short — safeExecFile 래퍼라 비-git/실패 시 throw 없이 '' 반환(읽기 전용).
function gitShort(): string {
  const r = safeExecFile('git', ['status', '--short'])
  return r.ok ? r.out.trim() : ''
}

// 현재 폴더가 VHK 프로젝트인지 — CLAUDE.md / .vhk / goals 중 하나라도 있으면 인정.
function ensureVhkProject(): boolean {
  if (existsSync('CLAUDE.md') || existsSync(VHK_DIR) || existsSync('goals')) return true
  console.log(chalk.yellow('  ⚠️ 여기는 VHK 프로젝트 폴더가 아닌 것 같아요.'))
  console.log(chalk.dim('  VHK 프로젝트 폴더에서 실행하거나, vhk start 로 새로 시작하세요.'))
  return false
}

// HARD_STOP 가드 — 활성이면 사유 출력 후 false(작업 중단). 자동 해제는 절대 안 함.
function passHardStop(): boolean {
  if (!isHardStopActive()) {
    console.log(chalk.green('  ✅ HARD_STOP 없음'))
    return true
  }
  console.log(chalk.red.bold('\n🛑 HARD STOP 활성 (.vhk/HARD_STOP) — 자동화를 중단합니다.'))
  const reason = readHardStopReason()
  if (reason) console.log(chalk.red(`   사유: ${reason.replace(/\s*\n\s*/g, ' ')}`))
  console.log(chalk.yellow('   해제는 사람이 직접: vhk resume --confirm'))
  return false
}

// active goal 한 줄 ("Goal N — 제목" / 또는 안내 문구).
function activeGoalLine(): string {
  const goals = listGoals('goals')
  if (goals.length === 0) return '정의된 goal 없음'
  const id = selectActiveId(goals)
  if (id === null) return '모든 goal 완료됨'
  const g = goals.find((x) => x.frontmatter.id === id)
  if (!g) return '정의된 goal 없음'
  return `Goal ${id} — ${g.frontmatter.title ?? '(untitled)'}`
}

// 변경 파일 목록을 화면에 들여쓰기 출력 (없으면 "변경 없음").
function printGit(git: string): void {
  if (!git) {
    console.log(chalk.dim('   (변경된 파일 없음 — 깨끗한 상태)'))
    return
  }
  for (const line of git.split(/\r?\n/)) console.log(`   ${line}`)
}

// 시작 프롬프트 — Claude CLI 에 붙여넣을 텍스트. (테스트 위해 export)
export function buildStartPrompt(git: string, goalLine: string): string {
  const gitBlock = git || '(변경 없음)'
  return [
    '당신은 VHK 프로젝트의 작업 파트너입니다. 나는 비개발자입니다.',
    '',
    '[규칙 우선순위]',
    '1. CLAUDE.md 를 1순위 규칙으로 읽고 그대로 따르세요. (충돌 시 CLAUDE.md 우선)',
    '2. AGENTS.md 는 Codex/보조 에이전트용 참고 규칙입니다. 당신은 참고만 하세요.',
    '3. docs/state/next-task.md 와 .vhk/context.md 를 읽고 그 기준으로 이어서 작업하세요.',
    '',
    '[작업 전 Source of Truth 체크]',
    '1. 새 타입·규칙·상수·명령어·프롬프트를 만들기 전에 기존 정의가 있는지 먼저 찾아보고, 있으면 재사용(import)하세요.',
    '2. 규칙은 RULES.md 한 곳에서만 고치세요. CLAUDE.md·AGENTS.md·.cursorrules 등은 vhk sync 로 만드는 파생본이라 직접 수정 금지.',
    '3. 원본 구분 — 규칙=RULES.md / 작업 상태=docs/state/next-task.md / 버전·릴리스=package.json·CHANGELOG.md.',
    '4. DTO·계층 분리처럼 일부러 타입을 나눌 땐 이유를 한 줄 설명하세요. (의미가 같은 걸 새로 또 정의하는 것만 금지)',
    '',
    '[지금 상태 — 자동 수집됨]',
    '- 변경된 파일 (git status --short):',
    gitBlock,
    '- 현재 목표 (active goal):',
    goalLine,
    '',
    '[해주세요]',
    '1. 먼저 현재 상태를 비개발자가 알아듣게 쉽게 요약해 주세요.',
    '2. 그다음 할 일을 3단계 이하로 말하고 진행하세요.',
    '3. 테스트가 통과하기 전에는 완료(done) 처리하지 마세요.',
    '4. 자동 커밋이나 vhk goal done 은 내가 승인하기 전에는 하지 마세요.',
    '모든 응답은 한국어로.',
  ].join('\n')
}

// 인수인계(중단 정리) 프롬프트 — Claude CLI 에 붙여넣을 텍스트. (테스트 위해 export)
// RFC 0051: 미기록 ADR/트러블슈팅 후보가 있으면 자동 감지 섹션을 끼운다(자문형, 강제 아님).
export function buildHandoffPrompt(
  git: string,
  docCandidates: DocCandidates = { adr: [], troubleshooting: [] },
): string {
  const gitBlock = git || '(변경 없음)'
  return [
    '당신은 VHK 프로젝트의 작업 파트너입니다. 오늘은 여기서 작업을 중단하고 컴퓨터를 꺼야 합니다.',
    '다음 세션이 이어받을 수 있게 정리해 주세요.',
    '',
    '[가장 먼저] CLAUDE.md 를 1순위 규칙으로 읽으세요. AGENTS.md 는 Codex/보조용 참고만.',
    '',
    '[지금 상태 — 자동 수집됨]',
    '- 변경된 파일 (git status --short):',
    gitBlock,
    ...formatDocCandidatesForPrompt(docCandidates),
    '',
    '[해주세요 — 정리만, 새 개발 시작 금지]',
    '1. 현재 변경사항을 확인하고, 완료된 일 / 미완료된 일로 나눠 한국어로 정리해 주세요.',
    "2. 테스트를 실행했는지/안 했는지, 결과가 어땠는지 명확히 기록해 주세요. (안 돌렸으면 '미실행')",
    '3. docs/state/next-task.md 를 지금 상태에 맞게 업데이트해 주세요. (다음 사람이 이어받을 지점 명확히)',
    '4. 지금 커밋 가능한 상태인지 판단해 주세요. (이유 설명)',
    '5. 완료(done) 처리하면 안 되는 상태라면 정리 맨 위에 굵게 표시해 주세요.',
    '',
    '[금지] 직접 git commit / git stash / git reset / vhk goal done 실행 금지. 파일 되돌리기·삭제 금지.',
    '모든 응답은 한국어로.',
  ].join('\n')
}

// 프롬프트를 클립보드에 복사 + 항상 .vhk/<fileName> 사본 저장.
// 클립보드 실패 시 화면에 프롬프트 전문 출력(사용자가 직접 복사).
function emitPrompt(prompt: string, fileName: string, label: string): void {
  let savedPath = ''
  try {
    mkdirSync(VHK_DIR, { recursive: true })
    savedPath = join(VHK_DIR, fileName)
    writeFileSync(savedPath, prompt, 'utf-8')
  } catch {
    savedPath = ''
  }

  const copied = copyToClipboard(prompt)
  if (copied) {
    console.log(chalk.green(`\n📋 Claude에게 줄 '${label}'을 클립보드에 복사했습니다! ✅`))
    if (savedPath) console.log(chalk.dim(`   (사본 저장: ${savedPath})`))
  } else {
    console.log(chalk.yellow(`\n⚠️ 클립보드 복사에 실패했어요 — 아래 프롬프트를 직접 복사하세요:`))
    if (savedPath) console.log(chalk.dim(`   (파일로도 저장됨: ${savedPath} — 열어서 복사 가능)`))
    console.log(chalk.gray('────────────────────────────────────────'))
    console.log(prompt)
    console.log(chalk.gray('────────────────────────────────────────'))
  }
}

// .vhk/context.md 를 조용히 갱신한다. context() 자체 콘솔 출력(헤더·printNextStep)이
// work 흐름 중간에 끼면 비개발자가 혼란하므로 console.log 를 잠시 억제하고 호출.
async function refreshContextQuietly(): Promise<boolean> {
  const origLog = console.log
  console.log = () => {}
  try {
    await context({ compact: true })
    return true
  } catch {
    return false
  } finally {
    console.log = origLog
  }
}

export async function work(): Promise<void> {
  console.log(chalk.bold(`\n${ko.work.workTitle}`))
  console.log(chalk.gray('─'.repeat(40)))
  if (!ensureVhkProject()) return
  if (!passHardStop()) return

  const git = gitShort()
  console.log('')
  console.log(chalk.cyan('📋 변경된 파일'))
  printGit(git)

  console.log('')
  console.log(chalk.cyan('📖 규칙'))
  console.log('   · CLAUDE.md 가 1순위 규칙입니다.')
  console.log(chalk.dim('   · AGENTS.md 는 Codex/보조 에이전트용 참고 규칙입니다.'))

  const goalLine = activeGoalLine()
  console.log('')
  console.log(chalk.cyan(`🎯 현재 목표: ${goalLine}`))

  const refreshed = await refreshContextQuietly()
  console.log(chalk.dim(refreshed ? '⚙️  .vhk/context.md 갱신됨' : '⚙️  .vhk/context.md 갱신 생략(건너뜀)'))

  // docs/state/next-task.md 핵심을 보여준다(있으면).
  const nextTaskPath = join('docs', 'state', 'next-task.md')
  if (existsSync(nextTaskPath)) {
    try {
      const lines = readFileSync(nextTaskPath, 'utf-8').split(/\r?\n/).slice(0, 12)
      console.log('')
      console.log(chalk.cyan('📝 다음 할 일 (next-task.md)'))
      for (const l of lines) console.log(chalk.dim(`   ${l}`))
    } catch {
      /* 읽기 실패 → 생략 */
    }
  }

  const prompt = buildStartPrompt(git, goalLine)
  emitPrompt(prompt, 'work-prompt.md', '시작 프롬프트')

  printNextStep({
    message: '터미널에서 claude 를 실행한 뒤, Ctrl+V 로 붙여넣고 Enter 하세요.',
    command: 'claude',
  })
}

export async function workHandoff(): Promise<void> {
  console.log(chalk.bold(`\n${ko.work.handoffTitle}`))
  console.log(chalk.gray('─'.repeat(40)))
  if (!ensureVhkProject()) return
  if (!passHardStop()) return

  const git = gitShort()
  console.log('')
  console.log(chalk.cyan('📋 바뀐 파일'))
  printGit(git)

  // RFC 0051: 미기록 ADR/트러블슈팅 후보 감지(자문형) → 정리 프롬프트에 주입.
  // git 호출 실패해도 핸드오프는 막지 않는다(graceful → 후보 0).
  let docCandidates: DocCandidates = { adr: [], troubleshooting: [] }
  try {
    const since = localDate()
    const [diff, commits] = await Promise.all([
      getSessionDiff(since),
      getRecentCommits(20, since),
    ])
    docCandidates = detectDocCandidates(diff, commits)
  } catch {
    /* 감지 실패는 무시 — 핸드오프 우선 */
  }
  const candidateCount = docCandidates.adr.length + docCandidates.troubleshooting.length
  if (candidateCount > 0) {
    console.log('')
    console.log(chalk.cyan(`🧾 미기록 문서 후보 ${candidateCount}건 감지 — 정리 프롬프트에 포함했어요`))
  }

  const prompt = buildHandoffPrompt(git, docCandidates)
  emitPrompt(prompt, 'handoff-prompt.md', '중단 정리 프롬프트')

  console.log('')
  console.log(chalk.dim('💡 이 명령은 커밋·삭제를 절대 하지 않습니다. 정리·판단은 Claude 가 합니다.'))

  printNextStep({
    message: '터미널에서 claude 를 실행한 뒤, Ctrl+V 로 붙여넣고 Enter 하세요.',
    command: 'claude',
  })
}
