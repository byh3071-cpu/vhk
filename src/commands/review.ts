import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { listGoals, type ParsedGoal } from '../lib/goal-frontmatter.js'
import { selectActiveId } from './goal.js'
import { readJsonFile } from '../lib/read-json.js'
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
 *
 * 자기모순 방지(핵심): 적대 검증기가 stale·미매핑 증거로 "거짓 안심"을 주면 안 된다 →
 *   ① 신선도(generatedAt) 미확인/오래됨이면 confidence high 금지
 *   ② 게이트 키워드에 매핑 안 된 완료조건은 "미검증(unmapped)"으로 정직하게 분류
 *   ③ coverage(매핑된 체크 비율) 낮으면 confidence 캡(증거 없음 ≠ 통과)
 *   ④ 판정은 보장이 아니라 신뢰도 — disclaimer 에 한계 명시 필수.
 * 새 증거 안 만듦(latest.json + goal body 만 읽음). latest.json 없으면 안내 후 종료.
 */

const GOALS_DIR = 'goals'
/** 매핑 커버리지가 이 값 미만이면 confidence 를 high 로 올리지 않는다(medium 캡). */
export const COVERAGE_MIN = 0.5
/** 증거가 이 시간보다 오래되면 stale 로 보고 confidence 캡 + 재검증 권장. */
export const STALE_AGE_MS = 6 * 60 * 60 * 1000 // 6시간

export const REVIEW_DISCLAIMER = [
  '⚠️  이 판정은 보장이 아니라 신뢰도 신호입니다 — 통과해도 거짓완료 가능성은 남습니다.',
  '   · 기능 고유 완료조건은 게이트 키워드(tsc/test/build/secure)에 매핑되지 않으면 "미검증"으로 남습니다.',
  '   · 증거(latest.json)는 commit/goal 바인딩이 없어 신선도는 생성시각으로만 추정합니다 — 코드 변경 후엔 vhk verify 재실행 필요.',
  '   · git diff 미사용(v0) — 기존 테스트가 green 이어도 이번 변경을 커버하지 못했을 수 있습니다.',
].join('\n')

export interface CompletionCheck {
  text: string
  checked: boolean
}

export interface EvidenceFreshness {
  generatedAt: string | null
  ageMs: number | null
  /** 오래됨(>STALE_AGE_MS) 또는 생성시각 파싱 불가. */
  stale: boolean
  /** 신선도 판정 자체가 가능했는지(generatedAt 유효). */
  confirmed: boolean
  note: string
}

export interface ReviewAnalysis {
  confidence: 'low' | 'medium' | 'high'
  /** 매핑된 체크 / 체크된 완료조건 수 (0~1). */
  coverage: number
  checkedCount: number
  mappedCount: number
  unmappedCount: number
  freshness: EvidenceFreshness
  /** 거짓완료 의심(강) — 체크됐으나 증거가 없거나 모순. */
  suspicions: { check: string; reason: string }[]
  /** 미검증(unmapped) — 체크됐으나 게이트 키워드 매핑 불가(수동 확인 필요). */
  gaps: { check: string; note: string }[]
  disclaimer: string
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
      inSection = /completion\s*check/i.test(heading[1])
      continue
    }
    if (!inSection) continue
    const box = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/)
    if (box) out.push({ text: box[2].trim(), checked: box[1].toLowerCase() === 'x' })
  }
  return out
}

/** 완료조건 텍스트 → 함의하는 게이트 id 목록. 빈 배열 = 미검증(unmapped). */
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

/** report.generatedAt 으로 증거 신선도 판정 (now 는 주입 — 순수성 유지). */
function assessFreshness(report: VerifyReport | null, nowMs: number): EvidenceFreshness {
  const generatedAt = report?.generatedAt ?? null
  const parsed = generatedAt ? Date.parse(generatedAt) : NaN
  if (!Number.isFinite(parsed)) {
    return { generatedAt, ageMs: null, stale: true, confirmed: false, note: '생성시각 불명 — 신선도 미확인' }
  }
  const ageMs = nowMs - parsed
  const stale = ageMs > STALE_AGE_MS || ageMs < 0
  const mins = Math.round(ageMs / 60000)
  const human = mins >= 120 ? `${Math.round(mins / 60)}시간` : `${mins}분`
  return {
    generatedAt,
    ageMs,
    stale,
    confirmed: true,
    note: stale
      ? `증거가 ${human} 전 생성(또는 미래시각) — 코드 변경 시 무효, vhk verify 재실행 권장`
      : `증거 ${human} 전 생성`,
  }
}

/**
 * Completion Check ↔ verify 증거 교차검증. **순수 함수**(fs/실시간 부수효과 없음 → nowMs 주입).
 * report=null 이면 증거 없음 — 매핑된 체크를 모두 의심으로 본다.
 */
export function crossCheck(
  checks: CompletionCheck[],
  goalStatus: string,
  report: VerifyReport | null,
  nowMs: number
): ReviewAnalysis {
  const suspicions: ReviewAnalysis['suspicions'] = []
  const gaps: ReviewAnalysis['gaps'] = []
  const gateById = new Map<string, GateResult>()
  if (report) for (const g of report.gates) gateById.set(g.id, g)
  const freshness = assessFreshness(report, nowMs)

  if (goalStatus === 'DONE' && report && report.status === 'FAIL') {
    suspicions.push({
      check: 'goal status = DONE',
      reason: 'verify 전체 결과가 FAIL — 완료 선언과 증거가 모순(거짓완료 강한 의심).',
    })
  }

  const checked = checks.filter((c) => c.checked)
  let mappedCount = 0
  for (const c of checked) {
    const gates = impliedGates(c.text)
    if (gates.length === 0) {
      gaps.push({ check: c.text, note: '미검증 — 게이트 키워드 매핑 불가(기능 완료조건, 수동 확인 필요).' })
      continue
    }
    mappedCount++
    for (const gid of gates) {
      const g = gateById.get(gid)
      if (!report || !g) {
        suspicions.push({ check: c.text, reason: `${gid} 게이트 증거 없음(latest.json 부재/미실행) — 체크됨이나 뒷받침 못 함.` })
      } else if (g.status === 'fail') {
        suspicions.push({ check: c.text, reason: `${gid} 게이트 FAIL(종료코드 ${g.exitCode ?? '?'}) — 체크됨과 모순.` })
      } else if (g.status === 'skip') {
        suspicions.push({ check: c.text, reason: `${gid} 게이트 skip — 검증이 변경을 안 건드렸을 수 있음(거짓완료 의심).` })
      }
    }
  }

  const coverage = checked.length === 0 ? 0 : mappedCount / checked.length

  // confidence: 증거 없음 ≠ 통과. high 는 (의심 0 AND coverage 충분 AND 신선도 확인·신선) 일 때만.
  let confidence: ReviewAnalysis['confidence']
  if (checked.length === 0 || suspicions.length > 0) {
    confidence = 'low'
  } else if (coverage < COVERAGE_MIN || !freshness.confirmed || freshness.stale) {
    confidence = 'medium'
  } else {
    confidence = 'high'
  }

  let reprompt: string
  if (checked.length === 0) {
    reprompt = '체크된 완료조건이 없습니다 — 완료 주장이 없어 심문할 대상이 없습니다(vacuous).'
  } else if (suspicions.length > 0) {
    reprompt =
      '다음 완료조건이 증거와 모순되거나 증거가 없습니다:\n' +
      suspicions.map((s) => `  - ${s.check} → ${s.reason}`).join('\n') +
      '\n각 항목의 실제 증거(게이트 통과/추가된 테스트/변경 파일)를 제시하거나, 충족 못 하면 done 을 철회하세요.'
  } else if (gaps.length > 0) {
    reprompt =
      '다음 완료조건은 게이트 증거로 자동 확인되지 않았습니다(미검증 — 수동 확인 필요):\n' +
      gaps.map((g) => `  - ${g.check}`).join('\n')
  } else {
    reprompt = '체크된 모든 완료조건이 게이트 증거로 뒷받침됩니다(단, 보장은 아님).'
  }

  return {
    confidence,
    coverage,
    checkedCount: checked.length,
    mappedCount,
    unmappedCount: gaps.length,
    freshness,
    suspicions,
    gaps,
    disclaimer: REVIEW_DISCLAIMER,
    reprompt,
  }
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
  low: chalk.red.bold('낮음 (거짓완료 의심 또는 완료 주장 없음)'),
  medium: chalk.yellow.bold('중간 (커버리지/신선도 부족 — 증거 없음 ≠ 통과)'),
  high: chalk.green.bold('높음 (의심 0 + 커버리지·신선도 충분 — 단 보장 아님)'),
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

  // active(--id 없음) 가 NOT_STARTED 면 완료 주장이 없어 review 가 거의 무의미 — 경고.
  if (opts.id === undefined && goalStatus === 'NOT_STARTED') {
    console.error(chalk.yellow(`  ⚠️  active goal ${goalId} 가 NOT_STARTED — 완료 주장이 없습니다. 검증 대상은 --id 로 지정하세요.`))
  }

  // latest.json — 없으면 안내 후 종료(새 증거 안 만듦; verify 자동 실행 안 함).
  const jsonPath = join(cwd, REPORT_PATH_REL)
  if (!existsSync(jsonPath)) {
    console.error(chalk.yellow(`  ⚠️  증거 부재 — ${REPORT_PATH_REL} 없음. review 를 중단합니다(새 증거 안 만듦).`))
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

  const analysis = crossCheck(checks, goalStatus, report, Date.now())
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
  console.log(
    chalk.dim(
      `  goal status: ${goalStatus}  ·  verify: ${report.status}  ·  체크된 완료조건 ${result.checkedCount}개` +
        ` (매핑 ${result.mappedCount} / 미검증 ${result.unmappedCount}, coverage ${(result.coverage * 100) | 0}%)`
    )
  )
  console.log(chalk.dim(`  증거 신선도: ${result.freshness.note}`))

  if (result.checkedCount === 0) {
    console.log(chalk.yellow('\n  ⚪ 완료 주장 없음(체크된 완료조건 0개) — 심문할 대상이 없습니다(vacuous).'))
  }
  if (result.suspicions.length > 0) {
    console.log(chalk.red.bold(`\n  🚩 거짓완료 의심 ${result.suspicions.length}건`))
    for (const s of result.suspicions) console.log(chalk.red(`   ✗ ${s.check}\n     ↳ ${s.reason}`))
  }
  if (result.gaps.length > 0) {
    console.log(chalk.yellow.bold(`\n  ⚠️  미검증(unmapped) ${result.gaps.length}건 — 게이트로 자동 확인 불가`))
    for (const g of result.gaps) console.log(chalk.yellow(`   ? ${g.check}`))
  }
  if (result.checkedCount > 0 && result.suspicions.length === 0 && result.gaps.length === 0) {
    console.log(chalk.green('\n  ✓ 체크된 완료조건이 모두 게이트 증거로 뒷받침됨.'))
  }

  console.log(`\n  신뢰도: ${CONFIDENCE_LABEL[result.confidence]}`)
  console.log(chalk.yellow(`\n${result.disclaimer}`))

  // review 섹션 병합 — 새 증거 안 만들고 기존 latest.json 에 판정만 덧붙임(judgment 네임스페이스 'review').
  // 다음 vhk verify 는 리포트를 새로 빌드해 덮어쓰므로 stale 한 review 가 남지 않는다(크래시 없음).
  try {
    const merged = { ...report, review: result }
    writeFileSync(jsonPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
    console.log(chalk.dim(`  📄 판정 병합: ${REPORT_PATH_REL} (review 섹션)`))
  } catch (e) {
    console.error(chalk.yellow(`  ⚠️  review 섹션 기록 실패(권한?): ${e instanceof Error ? e.message : String(e)}`))
  }

  // exit code 정책 (테스트로 고정):
  //  - exit 0 = 통과로 봐도 되는 경우만 → ① vacuous(완료 주장 없음) ② confidence high(의심 0 + 커버리지·신선도 충분)
  //  - exit 1 = 그 외 전부 → 강한 거짓완료 의심 / 증거 불충분(medium·low: stale·미검증·커버리지 부족)
  //  stale·unmapped·coverage 부족은 절대 "통과"로 취급하지 않는다(거짓 안심 금지).
  const vacuous = result.checkedCount === 0
  const cleanHigh = result.suspicions.length === 0 && result.confidence === 'high'
  process.exitCode = vacuous || cleanHigh ? 0 : 1

  if (vacuous) {
    // 완료 주장 자체가 없음 → 실패 아님(0), 단 goal done 안내도 안 함.
    printNextStep({
      message: '완료 주장이 없습니다 — 완료조건을 채운 뒤 검증하세요:',
      command: 'vhk verify',
      cursorHint: '완료조건 채워줘',
    })
  } else if (result.suspicions.length > 0) {
    console.log(chalk.dim('\n  AI 재질문 프롬프트:'))
    console.log(chalk.cyan(result.reprompt.split('\n').map((l) => `    ${l}`).join('\n')))
    printNextStep({
      message: '거짓완료 의심으로 실패(exit 1) — 증거 보강 후 다시 검증하세요:',
      command: 'vhk verify',
      cursorHint: '의심 항목 증거 보강해줘',
      alternative: result.suspicions[0].reason,
    })
  } else if (cleanHigh) {
    printNextStep({
      message: '심문 통과(신뢰도 높음, 보장 아님). 완료 처리하려면:',
      command: `vhk goal done --id ${goalId}`,
      cursorHint: 'goal 완료 처리해줘',
    })
  } else {
    // medium/low (의심은 없지만 stale·미검증·커버리지 부족) → "통과" 아님(exit 1). goal done 안내 금지.
    console.log(chalk.dim('\n  AI 재질문 프롬프트:'))
    console.log(chalk.cyan(result.reprompt.split('\n').map((l) => `    ${l}`).join('\n')))
    printNextStep({
      message: `증거 불충분(신뢰도 ${result.confidence}) — goal done 금지. 커버리지/신선도 보강 후 재검증:`,
      command: 'vhk verify',
      cursorHint: '증거 보강 후 다시 검증해줘',
    })
  }
}
