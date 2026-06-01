import inquirer from 'inquirer'
import chalk from 'chalk'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureInteractive } from '../lib/interactive.js'

export type GateMode = 'full' | 'quick' | 'skip'
export type GateStatus = 'pass' | 'hold' | 'fail'
export type GateVerdict = 'GO' | 'REFINE' | 'DROP'

interface GateQuestion {
  id: number
  stage: string
  question: string
  failIf: string
  quick?: boolean
  hint?: string
}

export const GATE_QUESTIONS: GateQuestion[] = [
  { id: 1,  stage: '문제 정의', question: '이 아이디어가 해결하는 문제를 한 문장으로 말해보세요.', failIf: '한 문장 불가 → 미성숙', quick: true },
  { id: 2,  stage: '핵심 기능', question: '딱 1개 기능만 고르면?', failIf: '2개 이상 → 범위 초과', quick: true },
  { id: 3,  stage: '수요 검증', question: '타겟이 모이는 커뮤니티 3곳은?', failIf: '0곳 → 시장 접점 부재', quick: true, hint: '예: 인디해커스, 트위터 #buildinpublic, 디스코드' },
  { id: 4,  stage: '기획',     question: 'v1 기능 목록 5개 이내로 정리해보세요.', failIf: '5개 초과 → 오버엔지니어링' },
  { id: 5,  stage: '설계',     question: '데이터를 저장할 곳이 떠오르시나요?', failIf: '모르면 보류해도 됩니다', hint: '예: 사용자 목록은 DB, 로그인은 Supabase — 모르면 "보류"' },
  { id: 6,  stage: '개발',     question: '3일 안에 코어 완성 가능한가?', failIf: '불가능 → 범위 축소 필요', quick: true },
  { id: 7,  stage: '디자인',   question: '레퍼런스 UI 1개 지정할 수 있나?', failIf: '없으면 → 방향 미정' },
  { id: 8,  stage: '배포',     question: '배포 플랫폼 + 도메인 확정했나?', failIf: '미정 → 배포 지연 예고' },
  { id: 9,  stage: '기록',     question: '배운 것을 어디에 기록할 건가?', failIf: '기록 없으면 → 자산화 실패' },
  { id: 10, stage: '콘텐츠화', question: '트윗 1개로 설명해보세요.', failIf: '못 하면 → 포지셔닝 미흡', quick: true, hint: '예: "AI 코딩을 부리는 사람을 위한 풀사이클 CLI"' },
  { id: 11, stage: '마케팅',   question: '첫 주에 올릴 곳 3곳은?', failIf: '0곳 → 배포만 하고 끝' },
  { id: 12, stage: '판매',     question: '가격 + 결제 수단 확정했나?', failIf: '무료만 → 수익화 미실험' },
  { id: 13, stage: '피드백',   question: '사용자 피드백 수집 채널은?', failIf: '없으면 → 루프 끊김' },
]

export function judgeGate(failCount: number, holdCount: number): GateVerdict {
  if (failCount <= 2 && holdCount <= 3) return 'GO'
  if (failCount <= 4) return 'REFINE'
  return 'DROP'
}

export async function gate() {
  if (!ensureInteractive('아이디어 검증은 대화형 질문이 필요합니다. 터미널(PowerShell 등)에서 직접 실행하세요. Git Bash 면 VHK_FORCE_INTERACTIVE=1.')) return

  console.log(chalk.bold(`\n${ko.gate.title}\n`))

  const { mode } = await inquirer.prompt<{ mode: GateMode }>([{
    type: 'list',
    name: 'mode',
    message: ko.gate.modePrompt,
    choices: [
      { name: ko.gate.modeQuickLabel, value: 'quick' },
      { name: ko.gate.modeFullLabel,  value: 'full' },
      { name: ko.gate.modeSkipLabel,  value: 'skip' },
    ],
  }])

  if (mode === 'skip') {
    const { source } = await inquirer.prompt<{ source: string }>([{
      type: 'input',
      name: 'source',
      message: ko.gate.skipSourcePrompt,
    }])
    console.log(chalk.green.bold(`\n${ko.gate.skipGo}`))
    console.log(chalk.dim(ko.gate.skipSourceLabel(source)))
    return
  }

  const questions = mode === 'quick'
    ? GATE_QUESTIONS.filter(q => q.quick)
    : GATE_QUESTIONS
  const total = questions.length
  const header = mode === 'quick' ? ko.gate.quickHeader : ko.gate.fullHeader

  console.log(chalk.dim(`\n${header} ${ko.gate.modeCountSuffix(total)}\n`))

  console.log(chalk.dim(`\n${ko.gate.welcome}\n`))

  console.log(chalk.dim(`  ${ko.gate.ideaHint}`))
  const { idea } = await inquirer.prompt<{ idea: string }>([
    { type: 'input', name: 'idea', message: ko.gate.idea },
  ])

  console.log(chalk.dim(`  ${ko.gate.painPointHint}`))
  const { painPoint } = await inquirer.prompt<{ painPoint: string }>([
    { type: 'input', name: 'painPoint', message: ko.gate.painPoint },
  ])

  console.log(chalk.dim(`  ${ko.gate.edgeHint}`))
  const { edge } = await inquirer.prompt<{ edge: string }>([
    { type: 'input', name: 'edge', message: ko.gate.edge },
  ])

  console.log(chalk.dim(`\n${ko.gate.checklistStart}\n`))

  let failCount = 0
  let holdCount = 0
  const results: Array<{ id: number; stage: string; status: GateStatus; answer: string }> = []

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    if (q.hint) console.log(chalk.dim(`${ko.gate.hintPrefix} ${q.hint}`))

    const { answer } = await inquirer.prompt<{ answer: string }>([{
      type: 'input',
      name: 'answer',
      message: `[${i + 1}/${total}] ${q.stage}: ${q.question}`,
    }])

    const { status } = await inquirer.prompt<{ status: GateStatus }>([{
      type: 'list',
      name: 'status',
      message: ko.gate.verdictPrompt(q.failIf),
      choices: [
        { name: ko.gate.statusPassChoice, value: 'pass' },
        { name: ko.gate.statusHoldChoice, value: 'hold' },
        { name: ko.gate.statusFailChoice, value: 'fail' },
      ],
    }])

    if (status === 'fail') failCount++
    if (status === 'hold') holdCount++
    results.push({ id: q.id, stage: q.stage, status, answer })

    const icon = status === 'pass' ? chalk.green(ko.gate.statusPassLine)
      : status === 'hold' ? chalk.yellow(ko.gate.statusHoldLine)
      : chalk.red(ko.gate.statusFailLine)
    console.log(icon)
  }

  console.log(chalk.bold(`\n${ko.gate.verdictTitle}\n`))
  console.log(`${ko.gate.ideaLabel} ${chalk.cyan(idea)}`)
  console.log(`${ko.gate.painPointLabel} ${painPoint}`)
  console.log(`${ko.gate.edgeLabel} ${edge}`)
  console.log(`${ko.gate.countLine(failCount, holdCount, total)}\n`)

  const verdict = judgeGate(failCount, holdCount)

  if (verdict === 'GO') {
    console.log(chalk.green.bold(ko.gate.go))
    if (holdCount > 0) {
      console.log(chalk.yellow(ko.gate.holdRemainHint))
    }
    printNextStep({
      message: '아이디어 통과! 이제 프로젝트를 만들어보세요.',
      command: 'vhk 시작',
      cursorHint: '프로젝트 만들어줘',
    })
  } else if (verdict === 'REFINE') {
    console.log(chalk.yellow.bold(ko.gate.refine))
    printNextStep({
      message: '조금 더 다듬은 후 다시 검증해보세요.',
      command: 'vhk 검증',
      cursorHint: '아이디어 다시 검증해줘',
    })
  } else {
    console.log(chalk.red.bold(ko.gate.drop))
  }
}
