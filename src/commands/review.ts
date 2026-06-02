import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { listGoals, type ParsedGoal } from '../lib/goal-frontmatter.js'
import { selectActiveId } from './goal.js'
import { readJsonFile } from '../lib/read-json.js'
import { localDate } from '../lib/date.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { printNextStep } from '../lib/next-step.js'
import {
  REPORT_PATH_REL,
  type GateResult,
  type ReportStatus,
  type VerifyReport,
} from './verify.js'

/**
 * Goal 15: vhk review — 적대적 자기검증 v0.
 * verify(Goal 13)가 모은 증거(latest.json)를 그대로 믿지 않고, goal 의 Completion Check 와
 * 교차검증해 "거짓완료(완료조건은 체크됐는데 증거가 없거나 모순)"를 적극적으로 찾는다.
 * 철학: ① 증거를 의심 ② 새 증거 안 만듦(latest.json + goal body 만 읽음) ③ 판정은 보장이 아니라
 *      신뢰도 — "보장 아님" 표기 필수 ④ latest.json 없으면 안내 후 종료(verify 자동 실행 안 함).
 */

const GOALS_DIR = 'goals'

export const REVIEW_DISCLAIMER =
  '⚠️  이 판정은 보장이 아니라 신뢰도 신호입니다 — 통과해도 거짓완료 가능성은 남습니다.'

export interface CompletionCheck {
  text: string
  checked: boolean
}

export interface ReviewAnalysis {
  confidence: 'low' | 'medium' | 'high'
  /** 거짓완료 의심(강) — 체크됐으나 증거가 없거나 모순. */
  suspicions: { check: string; reason: string }[]
  /** 증거 갭(약) — 체크됐으나 latest.json 으로 자동 확인 불가(수동 확인 필요). */
  gaps: { check: string; note: string }[]
  disclaimer: string
  /** 거짓완료 의심 시 AI 에게 다시 물을 프롬프트. */
  reprompt: string
}

export interface ReviewResult extends ReviewAnalysis {
  reviewedAt: string
  goalId: number
  goalStatus: string
  reportStatus: ReportStatus | 'NONE'
}

/** goal body 의 `## Completion Check` 섹션에서 `- [x]`/`- [ ]` 체크박스 파싱. */
export function parseCompletionChecks(body: string): CompletionCheck[] {
  const lines = body.split(/\r?\n/)
  const out: CompletionCheck[] = []
  let inSection = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) {
      // `## Completion Check` 진입, 다음 heading 에서 종료.
      inSection = /completion\s*check/i.test(heading[1])
      continue
    }
    if (!inSection) continue
    const box = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/)
    if (box) out.push({ text: box[2].trim(), checked: box[1].toLowerCase() === 'x' })
  }
  return out
}

/** 완료조건 텍스트 → 함의하는 게이트 id 목록. 매핑 없으면 빈 배열(→ 증거 갭). */
function impliedGates(text: string): GateResult['id'][] {
  if (/게이트|공통\s*게이트|goal\s*check/i.test(text)) {
    return ['typecheck', 'test', 'build', 'secure']
  }
  const gates: GateResult['id'][] = []
  if (/tsc|typecheck|타입\s*체크/i.test(text)) gates.push('typecheck')
  if (/테스트|test|회귀|vitest/i.test(text)) gates.push('test')
  if (/빌드|build/i.test(text)) gates.push('build')
  if (/시크릿|secret|secure|누출|보안\s*스캔/i.test(text)) gates.push('secure')
  return gates
}

/**
 * Completion Check ↔ verify 증거 교차검증. **순수 함수**(fs/날짜 부수효과 없음 → 테스트 용이).
 * report=null 이면 증거 없음 — 모든 체크 항목을 "미확인 갭"으로 본다.
 */
export function crossCheck(
  checks: CompletionCheck[],
  goalStatus: string,
  report: VerifyReport | null
): ReviewAnalysis {
  const suspicions: ReviewAnalysis['suspicions'] = []
  const gaps: ReviewAnalysis['gaps'] = []
  const gateById = new Map<string, GateResult>()
  if (report) for (const g of report.gates) gateById.set(g.id, g)

  // 전역 신호: status DONE 인데 verify 전체 FAIL → 강한 거짓완료 의심.
  if (goalStatus === 'DONE' && report && report.status === 'FAIL') {
    suspicions.push({
      check: `goal status = DONE`,
      reason: 'verify 전체 결과가 FAIL — 완료 선언과 증거가 모순(거짓완료 강한 의심).',
    })
  }

  for (const c of checks) {
    if (!c.checked) continue // 미체크는 의심 대상 아님(아직 완료 주장 안 함).
    const gates = impliedGates(c.text)
    if (gates.length === 0) {
      gaps.push({ check: c.text, note: '증거 매핑 불가 — latest.json 게이트로 자동 확인 불가(수동 확인 필요).' })
      continue
    }
    for (const gid of gates) {
      const g = gateById.get(gid)
      if (!report || !g) {
        suspicions.push({ check: c.text, reason: `${gid} 게이트 증거 없음(latest.json 부재/미실행) — 체크됨이나 뒷받침 못 함.` })
      } else if (g.status === 'fail') {
        suspicions.push({ check: c.text, reason: `${gid} 게이트 FAIL(종료코드 ${g.exitCode ?? '?'}) — 체크됨과 모순.` })
      } else if (g.status === 'skip') {
        suspicions.push({ check: c.text, reason: `${gid} 게이트 skip — 검증이 변경을 안 건드렸을 수 있음(거짓완료 의심).` })
      }
      // pass → 뒷받침됨(플래그 없음).
    }
  }

  const confidence: ReviewAnalysis['confidence'] =
    suspicions.length > 0 ? 'low' : gaps.length > 0 ? 'medium' : 'high'

  let reprompt: string
  if (suspicions.length > 0) {
    reprompt =
      '다음 완료조건이 증거와 모순되거나 증거가 없습니다:\n' +
      suspicions.map((s) => `  - ${s.check} → ${s.reason}`).join('\n') +
      '\n각 항목의 실제 증거(게이트 통과/추가된 테스트/변경 파일)를 제시하거나, 충족 못 하면 done 을 철회하세요.'
  } else if (gaps.length > 0) {
    reprompt =
      '다음 완료조건은 latest.json 증거로 자동 확인되지 않았습니다(수동 확인 필요):\n' +
      gaps.map((g) => `  - ${g.check}`).join('\n')
  } else {
    reprompt = '체크된 모든 완료조건이 게이트 증거로 뒷받침됩니다(단, 보장은 아님).'
  }

  return { confidence, suspicions, gaps, disclaimer: REVIEW_DISCLAIMER, reprompt }
}

/** --id 또는 active goal 선택. */
function resolveGoal(optId: string | undefined, goals: ParsedGoal[]): ParsedGoal | null {
  let id: number | null
  if (optId !== undefined) {
    const n = Number(optId)
    id = Number.isFinite(n) ? n : null
  } else {
    id = selectActiveId(goals)
  }
  if (id === null) return null
  return goals.find((g) => g.frontmatter.id === id) ?? null
}

const CONFIDENCE_LABEL: Record<ReviewAnalysis['confidence'], string> = {
  low: chalk.red.bold('낮음 (거짓완료 의심)'),
  medium: chalk.yellow.bold('중간 (증거 갭 있음)'),
  high: chalk.green.bold('높음 (의심 없음 — 단 보장 아님)'),
}

export async function review(opts: { id?: string } = {}): Promise<void> {
  if (!ensureNotHardStopped('review')) return

  const cwd = process.cwd()
  const goals = listGoals(GOALS_DIR)
  if (goals.length === 0) {
    console.error(chalk.yellow('  ⚠️  goals/ 에 goal 이 없습니다. vhk goal init 으로 시작하세요.'))
    process.exitCode = 1
    return
  }

  const goal = resolveGoal(opts.id, goals)
  if (!goal || typeof goal.frontmatter.id !== 'number') {
    console.error(chalk.red(`  ❌ 대상 goal 을 찾을 수 없습니다${opts.id ? ` (--id ${opts.id})` : ' (active goal 없음)'}.`))
    process.exitCode = 1
    return
  }
  const goalId = goal.frontmatter.id
  const goalStatus = goal.frontmatter.status ?? 'NOT_STARTED'
  const checks = parseCompletionChecks(goal.body)

  // latest.json — 없으면 안내 후 종료(새 증거 안 만듦; verify 자동 실행 안 함).
  const jsonPath = join(cwd, REPORT_PATH_REL)
  if (!existsSync(jsonPath)) {
    console.error(chalk.yellow(`  ⚠️  ${REPORT_PATH_REL} 없음 — 먼저 검증 증거를 만드세요.`))
    printNextStep({
      message: '증거(latest.json)가 있어야 review 가 교차검증합니다:',
      command: 'vhk verify',
      cursorHint: '먼저 검증 돌려줘',
    })
    process.exitCode = 1
    return
  }

  let report: VerifyReport
  try {
    report = readJsonFile<VerifyReport>(jsonPath)
  } catch {
    console.error(chalk.red(`  ❌ ${REPORT_PATH_REL} 를 읽을 수 없습니다(손상). vhk verify 로 재생성하세요.`))
    process.exitCode = 1
    return
  }

  const analysis = crossCheck(checks, goalStatus, report)
  const result: ReviewResult = {
    ...analysis,
    reviewedAt: new Date().toISOString(),
    goalId,
    goalStatus,
    reportStatus: report.status,
  }

  // ── 콘솔 출력 ──
  console.log(chalk.bold(`\n🔬 적대적 자기검증 (review) — Goal ${goalId}`))
  console.log(chalk.gray('─'.repeat(44)))
  console.log(chalk.dim(`  goal status: ${goalStatus}  ·  verify: ${report.status}  ·  완료조건 ${checks.length}개`))

  if (result.suspicions.length > 0) {
    console.log(chalk.red.bold(`\n  🚩 거짓완료 의심 ${result.suspicions.length}건`))
    for (const s of result.suspicions) console.log(chalk.red(`   ✗ ${s.check}\n     ↳ ${s.reason}`))
  }
  if (result.gaps.length > 0) {
    console.log(chalk.yellow.bold(`\n  ⚠️  증거 갭 ${result.gaps.length}건 (자동 확인 불가)`))
    for (const g of result.gaps) console.log(chalk.yellow(`   ? ${g.check}`))
  }
  if (result.suspicions.length === 0 && result.gaps.length === 0) {
    console.log(chalk.green('\n  ✓ 체크된 완료조건이 모두 게이트 증거로 뒷받침됨.'))
  }

  console.log(`\n  신뢰도: ${CONFIDENCE_LABEL[result.confidence]}`)
  console.log(chalk.yellow(`  ${result.disclaimer}`))

  // review 섹션 병합 — 새 증거 안 만들고 기존 latest.json 에 판정만 덧붙임(SoT 유지).
  try {
    const merged = { ...report, review: result }
    writeFileSync(jsonPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
    console.log(chalk.dim(`  📄 판정 병합: ${REPORT_PATH_REL} (review 섹션)`))
  } catch (e) {
    console.error(chalk.yellow(`  ⚠️  review 섹션 기록 실패(권한?): ${e instanceof Error ? e.message : String(e)}`))
  }

  // 강한 의심 ≥1 → exit 1 (CI/에이전트가 거짓완료를 차단할 수 있게).
  process.exitCode = result.suspicions.length > 0 ? 1 : 0

  if (result.suspicions.length > 0) {
    console.log(chalk.dim('\n  AI 재질문 프롬프트:'))
    console.log(chalk.cyan(result.reprompt.split('\n').map((l) => `    ${l}`).join('\n')))
    printNextStep({
      message: '거짓완료 의심 — 증거 보강 후 다시 검증하세요:',
      command: 'vhk verify',
      cursorHint: '의심 항목 증거 보강해줘',
      alternative: result.suspicions[0].reason,
    })
  } else {
    printNextStep({
      message: '심문 통과(보장 아님). 완료 처리하려면:',
      command: `vhk goal done --id ${goalId}`,
      cursorHint: 'goal 완료 처리해줘',
    })
  }
}
