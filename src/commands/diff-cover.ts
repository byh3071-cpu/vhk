import { join } from 'node:path'
import chalk from 'chalk'
import { safeExecFile } from '../lib/exec.js'
import { diffUnified0 } from '../lib/git-session.js'
import { addedLinesByFile } from '../lib/diff-hunks.js'
import { fileCoverageByFile } from '../lib/coverage-parse.js'
import { diffCoverage, type DiffCoverageResult } from '../lib/diff-coverage.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'

const COVERAGE_JSON_REL = 'coverage/coverage-final.json'

/** diff-coverage 결과 → 표시 라인(순수, chalk 없음 — 테스트 용이). */
export function formatReport(r: DiffCoverageResult): string[] {
  const lines: string[] = []
  if (r.totalUncovered === 0) {
    lines.push('✅ 이번 변경의 모든 추가 라인이 테스트로 커버됨 (미검증 변경분 0).')
    return lines
  }
  const pct = Math.round(r.ratio * 100)
  lines.push(`미검증 변경분 ${r.totalUncovered}라인 / 추가 ${r.totalAdded}라인 (커버 ${pct}%)`)
  for (const f of r.files) {
    if (f.uncoveredNew.length === 0) continue
    const hint = f.inCoverage ? '' : '  ← 테스트가 이 파일을 import 안 함(전부 미검증)'
    lines.push(`  ${f.file}: 미커버 ${f.uncoveredNew.length}/${f.added} → 라인 ${f.uncoveredNew.join(', ')}${hint}`)
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
    console.log(chalk.green('\n  ✅ HEAD 대비 변경된 기능소스(src/commands·src/lib) 없음 — 측정 대상 없음.'))
    return
  }

  const covPath = join(cwd, COVERAGE_JSON_REL)
  const covered = fileCoverageByFile(covPath, cwd)
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
  // 측정 결과로는 exit 0 유지(advisory).
}
