import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import chalk from 'chalk'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { ensureVhkIgnored } from '../lib/backup.js'
import { printNextStep } from '../lib/next-step.js'
import { atomicWriteFile } from '../lib/atomic-write.js'
import { localDate } from '../lib/date.js'
import { stripBom } from '../lib/read-json.js'
import { ko } from '../i18n/ko.js'
import { getCommitInfo, gitOut, type CommitInfo } from '../lib/git-repo.js'
import { checkEvidenceFreshness, isGateWarning, verifyEvidence, type VerifyReport } from './verify.js'
import { diffUnified0 } from '../lib/git-session.js'
import { addedLinesByFile } from '../lib/diff-hunks.js'
import { fileCoverageByFile, COVERAGE_CORRUPT } from '../lib/coverage-parse.js'
import { diffCoverage } from '../lib/diff-coverage.js'
import { parsePorcelainLines } from '../lib/git-porcelain.js'
import { porcelainPath, isSelfTrackedPath } from '../lib/self-tracked.js'
import { readMission, checkMission, MISSION_PATH_REL, MISSION_SCAFFOLD_OBJECTIVE } from './mission.js'
import { tokenize } from './pattern.js'
import { listGoals } from '../lib/goal-frontmatter.js'
import { selectActiveId } from './goal.js'
import { detectAgent } from '../lib/detect-agent.js'
import {
  buildReceipt,
  renderReceiptMarkdown,
  type Receipt,
  type ReceiptDecision,
  type ReceiptDiffCover,
  type ReceiptIntentEvidence,
} from '../lib/receipt.js'
import { appendReceiptLog, buildReceiptLogEntry } from '../lib/receipt-log.js'

/**
 * Goal 86 (RFC 0056 T1): vhk receipt — 에이전트 "완료" 시점에 4대 기계증거를 영수증 1장으로.
 *
 * 이 파일은 **경계(IO)** — git/verify/diff-cover 에서 증거를 수집하고 .json/.md 를 쓴다.
 * 판정·렌더의 순수 로직은 src/lib/receipt.ts(불변식 테스트가 거기 고정). 신규 발명 최소 —
 * 기존 디스크 작동 자산(verifyEvidence·getCommitInfo·diff-coverage)을 조립하는 글루코드.
 *
 * ② dirty 는 getCommitInfo 가 Goal 85 filterSelfTrackedLines 를 이미 적용한다(자기 ledger 제외).
 * ③ stale 은 verify 리포트의 커밋 SHA·dirty와 현재 HEAD·dirty 비교 — 작업 기준선과 독립이다.
 */

export const RECEIPT_DIR_REL = join('.vhk', 'receipts')
/** 작업시작 기준선 SHA — intent 변경 범위 비교 기준. 로컬 전용(추적 안 함). */
export const RECEIPT_BASE_REL = join(RECEIPT_DIR_REL, '.base-sha')
const COVERAGE_JSON_REL = join('coverage', 'coverage-final.json')

/** 작업시작 기준선 SHA 읽기(로컬 전용 파일). 없거나 손상 → null. */
export function readBaseSha(cwd: string): string | null {
  const p = join(cwd, RECEIPT_BASE_REL)
  if (!existsSync(p)) return null
  try {
    const v = stripBom(readFileSync(p, 'utf-8')).trim()
    return v.length > 0 ? v : null
  } catch {
    // 읽기 실패는 "미기록"으로 정직 처리(거짓 stale 금지).
    return null
  }
}

/**
 * 방향 3-④: baseSha 무결성 검증 — 그 SHA 가 실제 레포의 커밋 객체인지 git 에 묻는다.
 *
 * 왜: baseSha(.base-sha 파일 또는 --since 인자)는 사람·외부 입력이라 위조·오타·다른 레포 SHA·
 *   비커밋 객체(blob/tree)일 수 있다. 검증 없이 그대로 쓰면 intent 의 `git diff <baseSha>`가
 *   엉뚱한 변경 범위를 검사한다. stale은 verify 증거와 현재 HEAD를 별도로 대조한다.
 *   `git rev-parse --verify <sha>^{commit}` 는 해당 객체를 커밋으로 역참조 가능할 때만 0 으로 끝나고
 *   아니면 throw → 무효로 판정한다(존재하지 않거나 커밋이 아니면 false).
 *
 * @returns 유효한 커밋이면 true. 무효(미존재·비커밋·git 실패)면 false → 호출부가 baseSha 를 null 처리.
 */
export function verifyBaseSha(cwd: string, sha: string): boolean {
  try {
    // ^{commit}: blob/tree/태그가 아니라 커밋으로 역참조 가능한지까지 본다(SHA 존재만으로 통과 금지).
    gitOut(['rev-parse', '--verify', `${sha}^{commit}`], cwd)
    return true
  } catch {
    // throw = 미존재/비커밋/레포 아님 → 무효. 잘못된 intent 기준을 막도록 호출부가 baseSha 를 버린다.
    return false
  }
}

/** 작업시작 기준선 SHA 기록(로컬 전용). receipts/ 디렉터리 + gitignore 보장. */
export function writeBaseSha(cwd: string, sha: string): void {
  const dir = join(cwd, RECEIPT_DIR_REL)
  mkdirSync(dir, { recursive: true })
  atomicWriteFile(join(cwd, RECEIPT_BASE_REL), sha + '\n')
  ensureReceiptsIgnored(cwd)
}

/**
 * `.vhk/receipts/` 를 .vhk/.gitignore 에 등록.
 * 왜 추적 제외: 영수증 자신이 작업트리를 dirty 만들면 다음 receipt 의 증거 ②(dirty)를 오염시켜
 * 자기모순(늘 block)이 된다. ledger/events(추적 영속 증거)와 달리 receipt 는 로컬 산출물이므로 제외.
 */
function ensureReceiptsIgnored(cwd: string): void {
  try {
    ensureVhkIgnored(cwd, 'receipts/')
  } catch {
    /* gitignore 갱신 실패는 치명적 아님 — 영수증은 이미 기록됨 */
  }
}

/** ④ diff-cover 수집(advisory). 측정 불가(저장소 아님/리포트 없음/변경 없음)면 measured=false. */
export function collectDiffCover(cwd: string): ReceiptDiffCover {
  const empty: ReceiptDiffCover = { measured: false, totalAdded: 0, totalUncovered: 0, ratio: 1 }
  try {
    const diffRes = diffUnified0(cwd)
    const added = addedLinesByFile(diffRes.ok ? diffRes.out : '')
    if (added.size === 0) return empty // 변경된 기능소스 없음 — 측정 대상 없음(advisory 부재).
    const covered = fileCoverageByFile(join(cwd, COVERAGE_JSON_REL), cwd)
    // #321: 부재(null)·손상(COVERAGE_CORRUPT) 모두 측정 불가 — 영수증은 advisory 부재로 둔다(차단 사유 아님).
    if (covered === null || covered === COVERAGE_CORRUPT) return empty
    const r = diffCoverage(added, covered)
    return {
      measured: true,
      totalAdded: r.totalAdded,
      totalUncovered: r.totalUncovered,
      ratio: r.ratio,
    }
  } catch {
    // diff-cover 수집 실패는 advisory 부재로 — 영수증 본체(실차단 red·dirty·stale·forbidden)는 계속 만든다.
    return empty
  }
}

/**
 * ⑤ intent(의도 대조, Goal 87) 수집 — .vhk/mission.json 있으면 변경 파일을 scope/forbidden 과 대조.
 *
 * 변경 파일 범위:
 *  - baseSha(작업시작 기준선)가 있으면 `git diff --name-only <baseSha>` (baseSha..working tree) +
 *    untracked 신규 — **커밋된 변경까지 포함**한다. 그래야 금지 파일을 고친 뒤 곧장 커밋해 status 에서
 *    숨겨도(forbiddenHits=0 위장) 의도 위반을 놓치지 않는다(CodeRabbit #394 지적 — 거짓완료 우회 차단).
 *  - 기준선 미기록이면 미커밋 변경(status -uall)만 본다. 이미 커밋된 intent 위반까지 보려면
 *    작업 전에 vhk receipt --mark-start 로 기준선을 고정해야 한다.
 *
 * dirty(②)와 **동일 기준**으로 vhk 자기 산출 추적파일(isSelfTrackedPath)을 제외한다 — receipt 자신이
 * 남기는 .vhk/events·ledger 가 scope 경고를 만드는 자기참조 노이즈 방지(Goal 85). (수동 `vhk mission
 * check` 는 self-tracked 를 제외 안 하므로 결과가 미세하게 다를 수 있다 — 의도된 차이.)
 * mission.json 없으면 undefined → decision·출력 영향 0(하위호환).
 */
/**
 * 방향 3-③: mission.json 내용의 sha256 스냅샷(앞 16자). 사후 위조 탐지용 — decision 영향 0.
 *
 * 왜 raw 파일을 해시하나: readMission 의 파싱 결과가 아니라 디스크의 실제 바이트를 본다 →
 * objective/scope/forbidden 어느 한 글자라도 바뀌면 checksum 이 달라진다. BOM·양끝 공백은 stripBom+trim
 * 으로 정규화(무의미한 차이로 checksum 이 흔들리지 않게) — 의미 있는 내용 변화만 반영. 16자 절단:
 * 사후 대조엔 충돌확률 무시 가능하고 영수증 가독성↑. 읽기 실패 → undefined(거짓 checksum 금지, 정직).
 */
function missionChecksum(cwd: string): string | undefined {
  try {
    const raw = stripBom(readFileSync(join(cwd, MISSION_PATH_REL), 'utf-8')).trim()
    if (!raw) return undefined
    return createHash('sha256').update(raw, 'utf-8').digest('hex').slice(0, 16)
  } catch {
    // 읽기 실패는 checksum 부재로 정직 처리 — intent 본체(forbidden/scope)는 readMission 으로 이미 수집됨.
    return undefined
  }
}

// ── ⓑ(N4): objective 토큰 교집합 — 결정론(LLM 0)·advisory ────────────────────

/** placeholder/빈 objective 는 검증 대상 아님(스캐폴드 미설정 = 암묵 opt-out). */
export function isRealObjective(objective: string): boolean {
  const o = objective.trim()
  return o.length > 0 && o !== MISSION_SCAFFOLD_OBJECTIVE
}

/** objective ↔ ref 결정론 토큰 교집합 수(공통 distinct 토큰). pattern.tokenize 재사용, LLM 0. */
export function computeObjectiveOverlap(objective: string, ref: string): number | undefined {
  const objTokens = new Set(tokenize(objective))
  // 토큰화 불가(전부 <2자/불용어) = 미계산(undefined) — '겹침 0'과 구분, ref-empty 가드와 대칭(적대리뷰 반영).
  if (objTokens.size === 0) return undefined
  const refTokens = new Set(tokenize(ref))
  let overlap = 0
  for (const tok of objTokens) if (refTokens.has(tok)) overlap++
  return overlap
}

/** overlap 참조 텍스트 = active goal.title + 최근 commit subject(읽기 전용, git/goal 실패 무해). */
function collectObjectiveRef(cwd: string): string {
  const parts: string[] = []
  try {
    const goals = listGoals(join(cwd, 'goals'))
    const id = selectActiveId(goals)
    const g = id !== null ? goals.find((x) => x.frontmatter.id === id) : undefined
    if (g?.frontmatter.title) parts.push(g.frontmatter.title)
  } catch {
    /* goal 미상 — ref 에서 생략(정직, 거짓 0 방지) */
  }
  try {
    const subject = gitOut(['log', '-1', '--format=%s'], cwd).trim()
    if (subject) parts.push(subject)
  } catch {
    /* commit 없음/git 실패 — 생략 */
  }
  return parts.join(' ')
}

export function collectIntent(cwd: string, baseSha?: string | null): ReceiptIntentEvidence | undefined {
  const mission = readMission(cwd)
  if (!mission) return undefined
  const files = new Set<string>()
  let scanKnown = true
  try {
    if (baseSha) {
      // baseSha..working tree — 커밋된 변경까지 포함. diff 는 tracked 만이므로 untracked 는 ls-files 로 보충.
      const diffNames = gitOut(['diff', '--name-only', baseSha], cwd)
      const untracked = gitOut(['ls-files', '--others', '--exclude-standard'], cwd)
      for (const f of `${diffNames}\n${untracked}`.split('\n')) {
        const t = f.trim()
        if (t) files.add(t)
      }
    } else {
      // -uall: 미추적 파일을 개별 경로로 펴서 glob 매칭 정확도 확보(getCommitInfo 와 동일 이유).
      for (const line of parsePorcelainLines(gitOut(['status', '--porcelain', '--untracked-files=all'], cwd))) {
        files.add(porcelainPath(line))
      }
    }
  } catch {
    // git 실패 → 변경 목록 미상. 부분 결과의 위반은 보존하되 0건을 성공으로 위장하지 않는다.
    scanKnown = false
  }
  const changed = [...files].filter((f) => !isSelfTrackedPath(f))
  const result = checkMission(changed, mission)
  // ⓑ(N4): objective 가 실제 설정됐을 때만 토큰 교집합 계산(암묵 opt-in). placeholder/빈값 → undefined(영향 0).
  let objectiveTokenOverlap: number | undefined
  if (isRealObjective(mission.objective)) {
    const ref = collectObjectiveRef(cwd)
    if (ref.trim()) objectiveTokenOverlap = computeObjectiveOverlap(mission.objective, ref)
  }
  return {
    missionKnown: true,
    baselineKnown: baseSha != null,
    scanKnown,
    forbiddenHits: result.violations.length,
    scopeWarnings: result.warnings.length,
    unsupportedForbiddenCount: result.unsupportedForbiddenPatterns.length,
    missionChecksum: missionChecksum(cwd),
    objectiveTokenOverlap,
  }
}

export interface ReceiptFreshness {
  /** verify 리포트와 현재 커밋을 모두 식별할 수 있었는가. */
  staleKnown: boolean
  /** 식별 가능한 두 증거가 SHA·dirty 기준으로 어긋나는가. */
  stale: boolean
}

/**
 * 작업 범위 기준선과 독립된 receipt 신선도 판정.
 * 증거 또는 현재 커밋을 모르면 거짓 BLOCK 대신 미상(caution)으로 남긴다.
 */
export function receiptFreshness(report: VerifyReport, current: CommitInfo | null): ReceiptFreshness {
  const staleKnown = report.commit != null && current !== null
  return {
    staleKnown,
    stale: staleKnown ? checkEvidenceFreshness(report, current).stale : false,
  }
}

/**
 * 4대 기계증거를 수집해 영수증 객체를 만든다(경계). LLM 0.
 * @param baseShaOverride --since <sha> 로 명시 기준선 지정 시. 없으면 .base-sha 파일.
 */
export function collectReceipt(cwd: string, baseShaOverride?: string | null): Receipt {
  // ① 게이트(tsc/test/build/secure) 실종료코드 — 자기보고 거부, 실제 프로세스만(verify.ts 가 보장).
  const { report } = verifyEvidence(cwd)
  const failedGateIds = report.gates.filter((g) => g.status === 'fail').map((g) => g.id)
  const hasSoftWarning = report.gates.some(isGateWarning)

  // ② git dirty — Goal 85 자기파일 제외가 getCommitInfo 안에 이미 적용됨.
  const commit = getCommitInfo(cwd)
  const headSha = commit?.sha ?? null
  const dirty = commit?.dirty ?? false

  // 작업 기준선은 ⑤ intent 범위에만 사용한다. 위조·오타·다른 레포 SHA·비커밋 객체면 무효화해
  // 엉뚱한 diff 기준을 막는다. ③ stale은 이 값과 독립적으로 verify 증거와 현재 HEAD를 대조한다.
  const rawBaseSha = baseShaOverride !== undefined ? baseShaOverride : readBaseSha(cwd)
  const baseSha = rawBaseSha !== null && !verifyBaseSha(cwd, rawBaseSha) ? null : rawBaseSha
  if (rawBaseSha !== null && baseSha === null) {
    console.error(chalk.yellow(`  ⚠️  ${ko.receipt.invalidBaseSha(rawBaseSha)}`))
  }
  const { staleKnown, stale } = receiptFreshness(report, commit)

  // ④ diff-cover — advisory(약신호).
  const diffCover = collectDiffCover(cwd)

  // ⑤ intent — mission.json 있으면 scope/forbidden 대조(Goal 87). baseSha 전달 → 커밋된 변경도 포함.
  const intent = collectIntent(cwd, baseSha)

  return buildReceipt(
    {
      gates: { red: failedGateIds.length > 0, status: report.status, failedGateIds, hasSoftWarning },
      dirty,
      stale,
      staleKnown,
      diffCover,
      intent,
    },
    {
      generatedAt: new Date().toISOString(),
      date: localDate(),
      // slug = 날짜(파일명 base 는 writeReceipt 가 실제 decision 으로 확정). 정보용.
      slug: localDate(),
      headSha,
      baseSha,
      // RFC 0057 트랙②: 로컬 환경변수로 감지한 에이전트(순수 사후 attribution — decision 무관).
      agent: detectAgent(),
    }
  )
}

/** 영수증을 .json + .md 로 디스크에 기록. receipts/ gitignore 보장. @returns 두 파일의 상대경로. */
export function writeReceipt(cwd: string, receipt: Receipt): { jsonPath: string; mdPath: string } {
  const dir = join(cwd, RECEIPT_DIR_REL)
  mkdirSync(dir, { recursive: true })
  // 같은 날 여러 장 충돌 방지: <날짜>-<decision>-<HHMMSS>.
  const stamp = receipt.generatedAt.slice(11, 19).replace(/:/g, '')
  const base = `${receipt.date}-${receipt.decision}-${stamp}`
  const jsonRel = join(RECEIPT_DIR_REL, `${base}.json`)
  const mdRel = join(RECEIPT_DIR_REL, `${base}.md`)
  atomicWriteFile(join(cwd, jsonRel), JSON.stringify(receipt, null, 2) + '\n')
  atomicWriteFile(join(cwd, mdRel), renderReceiptMarkdown(receipt))
  ensureReceiptsIgnored(cwd)
  return { jsonPath: jsonRel, mdPath: mdRel }
}

const DECISION_BADGE: Record<ReceiptDecision, string> = {
  block: chalk.red.bold('🔴 BLOCK'),
  caution: chalk.yellow.bold('🟡 CAUTION'),
  pass: chalk.green.bold('🟢 PASS'),
}

export interface ReceiptOptions {
  json?: boolean
  /** 현재 HEAD 를 작업시작 기준선으로 기록(이후 intent 변경 범위 기준). */
  markStart?: boolean
  /** intent 변경 범위 기준 SHA 를 명시(.base-sha 무시). */
  since?: string
}

export async function receipt(opts: ReceiptOptions = {}): Promise<void> {
  // HARD_STOP 활성 → 거부 + exit 1.
  if (!ensureNotHardStopped('receipt')) return
  const cwd = process.cwd()

  // --mark-start: 현재 HEAD 를 intent 변경 범위 기준선으로 박는다(검증 증거는 만들지 않음).
  if (opts.markStart) {
    const commit = getCommitInfo(cwd)
    if (!commit) {
      console.error(chalk.red(`  ❌ ${ko.receipt.noCommit}`))
      process.exitCode = 1
      return
    }
    writeBaseSha(cwd, commit.sha)
    console.log(chalk.green(`  ✅ ${ko.receipt.markStartDone} ${chalk.dim(commit.shortSha)}`))
    process.exitCode = 0
    return
  }

  const r = collectReceipt(cwd, opts.since ?? undefined)
  const { jsonPath, mdPath } = writeReceipt(cwd, r)

  // N7: 측정 엔트리 1줄을 .vhk/events/receipt-log.jsonl 에 append(decision 분포 추세 토대).
  // best-effort — 원장 append 실패가 본 판정/출력을 절대 막지 않는다(advisory 영속).
  try {
    appendReceiptLog(cwd, buildReceiptLogEntry(r))
  } catch {
    /* 원장 append 실패 비치명 — receipt 본 판정은 이미 .json/.md 로 기록됨 */
  }

  // --json: 기계 소비용 — 영수증 JSON 만 stdout 으로.
  if (opts.json) {
    console.log(JSON.stringify(r, null, 2))
    process.exitCode = r.decision === 'block' ? 1 : 0
    return
  }

  console.log(chalk.bold(`\n🧾 ${ko.receipt.title} (receipt)`))
  console.log(chalk.gray('─'.repeat(44)))
  console.log(`  판정: ${DECISION_BADGE[r.decision]}`)
  console.log(
    chalk.dim(
      `  HEAD: ${r.head.shortSha ?? '미상'}  ·  작업기준: ${r.base.shortSha ?? '미기록'}  ·  게이트: ${r.evidence.gates.status}`
    )
  )
  console.log('')
  for (const reason of r.reasons) {
    const mark = r.decision === 'pass' ? chalk.green('✓') : chalk.yellow('•')
    console.log(`   ${mark} ${reason}`)
  }
  console.log(chalk.dim(`\n  📄 영수증: ${jsonPath}`))
  console.log(chalk.dim(`  📋 붙여넣기용: ${mdPath}`))
  console.log(chalk.yellow(`\n  ⚠️  ${r.honesty}`))

  // exit code: block 이면 1(거짓완료 의심 — done 위장 차단), caution/pass 는 0.
  process.exitCode = r.decision === 'block' ? 1 : 0

  if (r.decision === 'block') {
    printNextStep({
      message: ko.receipt.nextBlockMessage,
      command: 'vhk verify',
      cursorHint: '막힌 증거부터 고쳐줘',
      alternative: `vhk learn "${ko.receipt.learnBlockHint}"`,
    })
  } else if (r.decision === 'caution') {
    printNextStep({
      message: ko.receipt.nextCautionMessage,
      command: `vhk receipt`,
      cursorHint: '영수증 다시 떼줘',
    })
  } else {
    printNextStep({
      message: ko.receipt.nextPassMessage,
      command: 'vhk goal done',
      cursorHint: 'goal 완료 처리해줘',
    })
  }
}
