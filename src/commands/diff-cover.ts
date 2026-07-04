import { join } from 'node:path'
import chalk from 'chalk'
import { safeExecFile } from '../lib/exec.js'
import { diffUnified0, untrackedFiles } from '../lib/git-session.js'
import { addedLinesByFile } from '../lib/diff-hunks.js'
import { fileCoverageByFile, COVERAGE_CORRUPT } from '../lib/coverage-parse.js'
import { diffCoverage, type DiffCoverageResult } from '../lib/diff-coverage.js'
import { isFeatureSource, toPosix } from '../lib/test-mapping.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { getCommitInfo } from '../lib/git-repo.js'
import { buildDiffCoverEntries, appendDiffCoverLog } from '../lib/diff-cover-log.js'

const COVERAGE_JSON_REL = 'coverage/coverage-final.json'

/**
 * #320: `git ls-files --others --exclude-standard` 출력 → untracked 기능소스(src/commands·src/lib)만(순수, 정렬).
 * diff HEAD 는 untracked 를 못 본다 → 신규 미검증 모듈을 '측정 대상 없음'으로 오도하지 않게 별도 안내용.
 */
export function untrackedFeatureSources(lsFilesOut: string): string[] {
  return lsFilesOut
    .split(/\r?\n/)
    .map((l) => toPosix(l.trim()))
    .filter((p) => p.length > 0 && isFeatureSource(p))
    .sort((a, b) => a.localeCompare(b))
}

/**
 * diff-coverage 결과 → 표시 라인(순수, chalk 없음 — 테스트 용이).
 * #375: statement 는 전부 covered(단일줄 if 같은 whole-line 오판정)라도 branch(uncoveredBranch)가
 * 미검증이면 "모두 커버" 축하 메시지로 은폐하지 않는다 — branch 신호는 별도 라인으로 항상 드러낸다.
 */
export function formatReport(r: DiffCoverageResult): string[] {
  const lines: string[] = []
  const anyBranchUncovered = r.files.some((f) => (f.uncoveredBranch?.length ?? 0) > 0)
  if (r.totalUncovered === 0 && !anyBranchUncovered) {
    lines.push('✅ 이번 변경의 모든 추가 라인이 테스트로 커버됨 (미검증 변경분 0).')
    return lines
  }
  if (r.totalUncovered > 0) {
    const pct = Math.round(r.ratio * 100)
    lines.push(`미검증 변경분 ${r.totalUncovered}라인 / 추가 ${r.totalAdded}라인 (커버 ${pct}%)`)
  } else {
    lines.push(`추가 ${r.totalAdded}라인 statement 커버 100% — 단, 분기(branch) 미검증이 있습니다.`)
  }
  for (const f of r.files) {
    const hasStmt = f.uncoveredNew.length > 0
    const hasBranch = (f.uncoveredBranch?.length ?? 0) > 0
    if (!hasStmt && !hasBranch) continue
    const hint = f.inCoverage ? '' : '  ← 테스트가 이 파일을 import 안 함(전부 미검증)'
    if (hasStmt) {
      lines.push(`  ${f.file}: 미커버 ${f.uncoveredNew.length}/${f.added} → 라인 ${f.uncoveredNew.join(', ')}${hint}`)
    }
    if (hasBranch) {
      lines.push(`  ${f.file}: 분기 미검증 → 라인 ${f.uncoveredBranch!.join(', ')}`)
    }
  }
  return lines
}

/**
 * vhk diff-cover — HEAD 대비 변경된 기능소스가 테스트로 실행됐나 측정(자문형·차단 0).
 * 측정 결과(미검증 변경분 존재)로는 exit 1 안 함. 운영 전제 실패(저장소 아님/리포트 없음)만 exit 1.
 */
export async function diffCover(): Promise<void> {
  if (!ensureNotHardStopped('diff-cover')) return
  const cwd = process.cwd()

  console.log(chalk.bold('\n🔬 diff-coverage — 이번 변경이 테스트로 닿았나'))
  console.log(chalk.gray('─'.repeat(44)))

  if (!safeExecFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd }).ok) {
    console.error(chalk.red('  ❌ git 저장소가 아닙니다.'))
    process.exitCode = 1
    return
  }

  const diffRes = diffUnified0(cwd)
  const added = addedLinesByFile(diffRes.ok ? diffRes.out : '')
  if (added.size === 0) {
    // #320: tracked 변경은 없어도 untracked 신규 기능소스(가장 미검증 위험)가 있으면
    // '측정 대상 없음' 단정 금지 — diff HEAD 범위 밖임을 정직히 알리고 git add 안내.
    const untracked = untrackedFeatureSources(untrackedFiles(cwd).out)
    if (untracked.length > 0) {
      console.log(
        chalk.yellow(
          `\n  ⚠️  추적 안 된(untracked) 신규 기능소스 ${untracked.length}개 — diff HEAD 범위 밖이라 미측정:`
        )
      )
      for (const f of untracked) console.log(chalk.yellow(`     ${f}`))
      console.log(chalk.cyan('\n     → git add 후 다시 실행하면 측정합니다 (신규 모듈일수록 미검증 위험 ↑).'))
      return
    }
    console.log(chalk.green('\n  ✅ HEAD 대비 변경된 기능소스(src/commands·src/lib) 없음 — 측정 대상 없음.'))
    return
  }

  const covPath = join(cwd, COVERAGE_JSON_REL)
  const covered = fileCoverageByFile(covPath, cwd)
  if (covered === COVERAGE_CORRUPT) {
    // #321: 파일은 실재하나 JSON.parse 실패 — '없음'으로 오인 보고하면 손상 은폐. 손상으로 정직 보고.
    console.error(chalk.red(`\n  ❌ 커버리지 리포트 손상(${COVERAGE_JSON_REL}) — 파싱 실패. 재생성하세요:`))
    console.error(chalk.cyan('     pnpm test:run --coverage'))
    process.exitCode = 1
    return
  }
  if (covered === null) {
    console.error(chalk.yellow(`\n  ⚠️  커버리지 리포트 없음(${COVERAGE_JSON_REL}). 먼저 생성하세요:`))
    console.error(chalk.cyan('     pnpm test:run --coverage'))
    process.exitCode = 1
    return
  }

  const result = diffCoverage(added, covered)
  const out = formatReport(result)
  const color = result.totalUncovered === 0 ? chalk.green : chalk.yellow
  console.log('\n' + out.map((l) => color(l)).join('\n'))
  console.log(
    chalk.dim('\n  ℹ️  자문형(advisory) — 차단하지 않습니다. 미검증 변경분은 테스트 보강을 권장하는 신호입니다.')
  )

  // #371: 측정 결과를 .vhk/events/diff-cover.jsonl 에 영속(추세 분석 토대). best-effort —
  // 기록 실패는 본 측정/출력/exit 0 을 절대 막지 않는다(advisory 도구). 자기 산출 추적파일이라
  // dirty 판정에서 제외(self-tracked.ts) → diff-cover 가 스스로 append 해도 freshness 봉인 안 깨짐.
  try {
    const entries = buildDiffCoverEntries(result, getCommitInfo(cwd), new Date().toISOString())
    appendDiffCoverLog(cwd, entries)
  } catch {
    /* best-effort — 영속 실패가 측정 본 기능을 막지 않음 */
  }
  // 측정 결과로는 exit 0 유지(advisory).
}
