import { existsSync } from 'node:fs'
import { atomicWriteFile } from '../lib/atomic-write.js'
import { join } from 'node:path'
import chalk from 'chalk'
import { listGoals, type ParsedGoal } from '../lib/goal-frontmatter.js'
import { selectActiveId } from './goal.js'
import { readJsonFile } from '../lib/read-json.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { printNextStep } from '../lib/next-step.js'
import {
  REPORT_PATH_REL,
  checkEvidenceFreshness,
  type GateResult,
  type ReportStatus,
  type VerifyReport,
} from './verify.js'
import { getCommitInfo, type CommitInfo } from '../lib/git-repo.js'

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
  '   · 증거 신선도는 커밋 SHA로 판정합니다(SHA≠HEAD/dirty면 "낡음" 강등) — 구버전 리포트(SHA 없음)는 생성시각 폴백. 코드 변경 후엔 vhk verify 재실행 필요.',
  '   · 미커밋 변경(working tree dirty)이 있으면 신뢰도 상한은 medium 입니다 — 증거가 그 변경을 아직 반영 못 하기 때문(커밋 후 vhk verify 재실행 시 high 가능).',
  '   · git diff 미사용(v0) — 기존 테스트가 green 이어도 이번 변경을 커버하지 못했을 수 있습니다.',
].join('\n')

export interface CompletionCheck {
  text: string
  checked: boolean
}

export interface EvidenceFreshness {
  generatedAt: string | null
  ageMs: number | null
  /** 낡음 — SHA≠HEAD/dirty(basis=sha) 또는 생성시각 오래됨·파싱불가(basis=time). */
  stale: boolean
  /** 신선도 판정 자체가 가능했는지(SHA 비교 가능 또는 generatedAt 유효). */
  confirmed: boolean
  /** 판정 근거 — 'sha'(증거에 커밋 SHA 있음, Goal 44/80) 또는 'time'(구버전 폴백). */
  basis: 'sha' | 'time'
  /** 낡음 사유들(없으면 신선). */
  reasons: string[]
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

/**
 * 증거 신선도 판정 (now·current 는 주입 — 순수성 유지).
 * Goal 80: 증거에 커밋 SHA(Goal 44 기록)가 있으면 **SHA 기반**으로 판정한다 — 현재 HEAD 와 비교해
 *   SHA≠HEAD 또는 dirty 면 "낡음"으로 강등(생성시각 추정보다 강한 신호). SHA 기록이 없는 구(舊)증거는
 *   생성시각 폴백(하위호환). 강등은 confidence 캡까지만 — review 는 권고 신호라 fail 격상은 안 한다.
 */
function assessFreshness(
  report: VerifyReport | null,
  current: CommitInfo | null,
  nowMs: number
): EvidenceFreshness {
  const generatedAt = report?.generatedAt ?? null
  const parsed = generatedAt ? Date.parse(generatedAt) : NaN
  const ageMs = Number.isFinite(parsed) ? nowMs - parsed : null

  // SHA 기반 (증거에 커밋 바인딩 있음) — Goal 44 의 소비 측 완결.
  if (report?.commit) {
    const { reasons } = checkEvidenceFreshness(report, current)
    const stale = reasons.length > 0
    return {
      generatedAt,
      ageMs,
      stale,
      confirmed: true, // SHA 비교가 가능 = 신선도 판정 자체는 확정
      basis: 'sha',
      reasons,
      note: stale ? `SHA 기반 신선도: ${reasons[0]}` : `SHA 일치(${report.commit.shortSha}) — 신선`,
    }
  }

  // 폴백: 구(舊)증거(commit 필드 없음, v1) → 생성시각으로만 추정.
  if (ageMs === null) {
    return {
      generatedAt,
      ageMs: null,
      stale: true,
      confirmed: false,
      basis: 'time',
      reasons: ['생성시각 불명 — 신선도 미확인'],
      note: '생성시각 불명 — 신선도 미확인',
    }
  }
  const stale = ageMs > STALE_AGE_MS || ageMs < 0
  const mins = Math.round(ageMs / 60000)
  const human = mins >= 120 ? `${Math.round(mins / 60)}시간` : `${mins}분`
  return {
    generatedAt,
    ageMs,
    stale,
    confirmed: true,
    basis: 'time',
    reasons: stale ? [`증거가 ${human} 전 생성(또는 미래시각)`] : [],
    note: stale
      ? `증거가 ${human} 전 생성(또는 미래시각) — 커밋 SHA 없음(구버전), vhk verify 재실행 권장`
      : `증거 ${human} 전 생성(커밋 SHA 없음 — 생성시각 추정)`,
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
  nowMs: number,
  current: CommitInfo | null = null
): ReviewAnalysis {
  const suspicions: ReviewAnalysis['suspicions'] = []
  const gaps: ReviewAnalysis['gaps'] = []
  const gateById = new Map<string, GateResult>()
  if (report) for (const g of report.gates) gateById.set(g.id, g)
  const freshness = assessFreshness(report, current, nowMs)

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
        // #157: skip 은 '강한 모순'이 아니라 '미검증 신호'(soft) — 게이트가 이번 변경을 안 건드렸을 수 있음.
        //        suspicions(거짓완료 강한 의심)가 아니라 gaps(수동 확인)로 분류 → verify 통과 후
        //        skip 만으로 review 가 거짓 실패(exit 1) 내던 혼란(#157) 제거.
        gaps.push({ check: c.text, note: `${gid} 게이트 skip — 검증이 이번 변경을 안 건드렸을 수 있음(수동 확인 권장).` })
      } else if (g.status === 'warn') {
        // Goal 59: warn(스캔 불완전)도 soft 신호 — 거짓완료 강한 의심(suspicion)이 아니라 gap(수동 확인).
        gaps.push({ check: c.text, note: `${gid} 게이트 불완전(warn) — ${g.detail ?? '한도로 일부 미검증'}(수동 확인 권장).` })
      }
    }
  }

  const coverage = checked.length === 0 ? 0 : mappedCount / checked.length

  // confidence: 증거 없음 ≠ 통과. high 는 (의심 0 AND 미검증 0 AND coverage 충분 AND 신선도 확인·신선)
  // 일 때만 — 단 하나라도 unmapped(gaps>0) 이면 완료조건이 증거로 안 닿았으므로 high 금지.
  let confidence: ReviewAnalysis['confidence']
  if (checked.length === 0 || suspicions.length > 0) {
    confidence = 'low'
  } else if (gaps.length > 0 || coverage < COVERAGE_MIN || !freshness.confirmed || freshness.stale) {
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

export async function review(opts: { id?: string; strict?: boolean } = {}): Promise<void> {
  if (!ensureNotHardStopped('review')) return
  const strict = opts.strict === true

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

  // Goal 80: 현재 HEAD SHA·dirty 를 읽어 증거 SHA(Goal 44 기록)와 비교 — 낡은 증거 신선도 강등.
  const current = getCommitInfo(cwd)
  const analysis = crossCheck(checks, goalStatus, report, Date.now(), current)
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
  // #157: 게이트 증거 키 매핑 — 어떤 게이트가 pass/skip/fail/부재인지 한눈에(미검증 위치 명확화).
  const gateLine = report.gates.length
    ? report.gates.map((g) => `${g.id}:${g.status}`).join(' · ')
    : '(게이트 없음)'
  console.log(chalk.dim(`  게이트 증거: ${gateLine}  ·  모드: ${strict ? 'strict(엄격)' : 'advisory(권고·기본)'}`))

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
  let mergeOk = false
  try {
    const merged = { ...report, review: result }
    atomicWriteFile(jsonPath, JSON.stringify(merged, null, 2) + '\n')
    mergeOk = true
    console.log(chalk.dim(`  📄 판정 병합: ${REPORT_PATH_REL} (review 섹션)`))
  } catch (e) {
    console.error(chalk.red(`  ❌ review 판정 기록 실패: ${e instanceof Error ? e.message : String(e)}`))
  }

  // 판정을 기록 못 하면 review 결과를 신뢰할 수 없음 → exit 1 + goal done 안내 금지(부분 성공 위장 차단).
  if (!mergeOk) {
    process.exitCode = 1
    printNextStep({
      message: 'review 판정 기록 실패(exit 1) — .vhk/reports 쓰기 권한 확인 후 재실행:',
      command: 'vhk review',
      cursorHint: '권한 확인 후 다시 검토해줘',
    })
    return
  }

  // exit code 정책 (#157, 테스트로 고정):
  //  - 기본(advisory): exit 0 = vacuous(완료 주장 없음) 또는 강한 모순(suspicions) 0. → verify 통과 후
  //    skip/미검증/커버리지 부족만으로는 거짓 실패(exit 1) 내지 않는다(혼란 제거). 미검증은 경고로만.
  //  - --strict: exit 0 = vacuous 또는 cleanHigh(의심 0 + 미검증 0 + high)만. 그 외 exit 1(엄격 게이트).
  //  어느 모드든 강한 모순(suspicions: FAIL·증거부재·DONE↔FAIL)은 exit 1.
  const vacuous = result.checkedCount === 0
  const cleanHigh =
    result.suspicions.length === 0 && result.gaps.length === 0 && result.confidence === 'high'
  const softOnlyPass = result.suspicions.length === 0 // 강한 모순 없음(gaps 는 있을 수 있음)
  process.exitCode = strict ? (vacuous || cleanHigh ? 0 : 1) : (vacuous || softOnlyPass ? 0 : 1)

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
  } else if (!strict) {
    // advisory: 강한 모순 없음 + (skip/미검증/커버리지 부족) → 통과(exit 0)지만 수동 확인 권장.
    if (result.gaps.length > 0) {
      console.log(chalk.dim('\n  ℹ️  강한 모순 없음 — advisory 통과(exit 0). 아래 미검증은 수동 확인 권장:'))
      console.log(chalk.cyan(result.reprompt.split('\n').map((l) => `    ${l}`).join('\n')))
    }
    printNextStep({
      message: `심문 통과(advisory·신뢰도 ${result.confidence}, 보장 아님). 엄격 검증은 vhk review --strict. 완료 처리:`,
      command: `vhk goal done --id ${goalId}`,
      cursorHint: 'goal 완료 처리해줘',
    })
  } else {
    // --strict: medium/low (의심은 없지만 stale·미검증·커버리지 부족) → "통과" 아님(exit 1). goal done 금지.
    console.log(chalk.dim('\n  AI 재질문 프롬프트:'))
    console.log(chalk.cyan(result.reprompt.split('\n').map((l) => `    ${l}`).join('\n')))
    printNextStep({
      message: `증거 불충분(strict·신뢰도 ${result.confidence}) — goal done 금지. 커버리지/신선도 보강 후 재검증:`,
      command: 'vhk verify',
      cursorHint: '증거 보강 후 다시 검증해줘',
    })
  }
}
