import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { ensureVhkIgnored } from '../lib/backup.js'
import { printNextStep } from '../lib/next-step.js'
import { atomicWriteFile } from '../lib/atomic-write.js'
import { localDate } from '../lib/date.js'
import { stripBom } from '../lib/read-json.js'
import { ko } from '../i18n/ko.js'
import { getCommitInfo } from '../lib/git-repo.js'
import { verifyEvidence } from './verify.js'
import { diffUnified0 } from '../lib/git-session.js'
import { addedLinesByFile } from '../lib/diff-hunks.js'
import { fileCoverageByFile, COVERAGE_CORRUPT } from '../lib/coverage-parse.js'
import { diffCoverage } from '../lib/diff-coverage.js'
import {
  buildReceipt,
  renderReceiptMarkdown,
  type Receipt,
  type ReceiptDecision,
  type ReceiptDiffCover,
} from '../lib/receipt.js'

/**
 * Goal 86 (RFC 0056 T1): vhk receipt — 에이전트 "완료" 시점에 4대 기계증거를 영수증 1장으로.
 *
 * 이 파일은 **경계(IO)** — git/verify/diff-cover 에서 증거를 수집하고 .json/.md 를 쓴다.
 * 판정·렌더의 순수 로직은 src/lib/receipt.ts(불변식 테스트가 거기 고정). 신규 발명 최소 —
 * 기존 디스크 작동 자산(verifyEvidence·getCommitInfo·diff-coverage)을 조립하는 글루코드.
 *
 * ② dirty 는 getCommitInfo 가 Goal 85 filterSelfTrackedLines 를 이미 적용한다(자기 ledger 제외).
 * ③ stale 은 작업시작 기준선 SHA(.vhk/receipts/.base-sha, 로컬 전용)와 현재 HEAD 비교 —
 *    기준선이 없으면 stale 미상(거짓 block 안 함, 단 caution).
 */

export const RECEIPT_DIR_REL = join('.vhk', 'receipts')
/** 작업시작 기준선 SHA — stale(③) 비교 기준. 로컬 전용(추적 안 함). */
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
    // diff-cover 수집 실패는 advisory 부재로 — 영수증 본체(실차단 3종)는 계속 만든다.
    return empty
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
  const hasSoftWarning = report.gates.some((g) => g.status === 'skip' || g.status === 'warn')

  // ② git dirty — Goal 85 자기파일 제외가 getCommitInfo 안에 이미 적용됨.
  const commit = getCommitInfo(cwd)
  const headSha = commit?.sha ?? null
  const dirty = commit?.dirty ?? false

  // ③ stale — 작업시작 기준선 SHA ≠ 현재 HEAD. 기준선/HEAD 미상이면 stale 미상(거짓 block 금지).
  const baseSha = baseShaOverride !== undefined ? baseShaOverride : readBaseSha(cwd)
  const staleKnown = baseSha !== null && headSha !== null
  const stale = staleKnown ? baseSha !== headSha : false

  // ④ diff-cover — advisory(약신호).
  const diffCover = collectDiffCover(cwd)

  return buildReceipt(
    {
      gates: { red: failedGateIds.length > 0, status: report.status, failedGateIds, hasSoftWarning },
      dirty,
      stale,
      staleKnown,
      diffCover,
    },
    {
      generatedAt: new Date().toISOString(),
      date: localDate(),
      // slug = 날짜(파일명 base 는 writeReceipt 가 실제 decision 으로 확정). 정보용.
      slug: localDate(),
      headSha,
      baseSha,
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
  /** 현재 HEAD 를 작업시작 기준선으로 기록(이후 stale 비교 기준). */
  markStart?: boolean
  /** stale 비교 기준 SHA 를 명시(.base-sha 무시). */
  since?: string
}

export async function receipt(opts: ReceiptOptions = {}): Promise<void> {
  // HARD_STOP 활성 → 거부 + exit 1.
  if (!ensureNotHardStopped('receipt')) return
  const cwd = process.cwd()

  // --mark-start: 현재 HEAD 를 작업시작 기준선으로 박는다(증거 안 만듦).
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
      `  HEAD: ${r.head.shortSha ?? '미상'}  ·  작업시작: ${r.base.shortSha ?? '미기록'}  ·  게이트: ${r.evidence.gates.status}`
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
      alternative: r.reasons[0],
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
