import chalk from 'chalk'
import { join } from 'node:path'
import { gitOut } from '../lib/git-repo.js'
import { parsePorcelainLines } from '../lib/git-porcelain.js'
import {
  collectTestBasenames,
  findUntested,
  isFeatureSource,
  expectedTestBasename,
  toPosix,
} from '../lib/test-mapping.js'
import { printNextStep } from '../lib/next-step.js'

// Goal 28: test-first 매핑 점검 명령(read-only).
// git 변경(staged/unstaged/untracked) 중 기능 소스에 대응 테스트가 없으면 경고.
// 기본 경고만(exit 0), VHK_TEST_FIRST=1 일 때만 HARD 차단(exit 1) — 과안정화 경계.

/** git status --porcelain 에서 변경/신규 기능 소스 경로 추출. */
export function changedFeatureSources(cwd: string): string[] {
  let porcelain: string
  try {
    // --untracked-files=all: 새 디렉터리 통째를 "?? dir/" 로 collapse 하지 않고 개별 파일까지 나열.
    porcelain = gitOut(['status', '--porcelain', '--untracked-files=all'], cwd)
  } catch {
    return [] // git 레포 아님 → 검사 대상 없음
  }
  const out: string[] = []
  for (const line of parsePorcelainLines(porcelain)) {
    // 형식: "XY path" (상태 2글자 + 공백 + 경로). rename 은 "old -> new".
    let p = line.slice(3).trim()
    if (p.includes(' -> ')) p = p.split(' -> ')[1] // rename 은 새 경로 기준
    p = toPosix(p.replace(/^"(.*)"$/, '$1')) // 공백 포함 경로의 따옴표 해제
    if (isFeatureSource(p)) out.push(p)
  }
  return out
}

export async function testmap(): Promise<void> {
  console.log(chalk.bold('\n🧭 test-first 매핑 점검 (testmap)'))
  const cwd = process.cwd()
  const hard = process.env.VHK_TEST_FIRST === '1'
  const changed = changedFeatureSources(cwd)
  if (changed.length === 0) {
    console.log(chalk.dim('  변경된 기능 소스 없음 — 검사할 것 없음.'))
    return
  }
  const testBasenames = collectTestBasenames(join(cwd, 'tests'))
  const untested = findUntested(changed, testBasenames)
  if (untested.length === 0) {
    console.log(chalk.green(`  ✅ 변경 기능 ${changed.length}개 전부 대응 테스트 있음.`))
    return
  }
  console.log(`  ${hard ? chalk.red('❌') : chalk.yellow('⚠️')} 테스트 없는 기능 변경 ${untested.length}건:`)
  for (const f of untested) {
    console.log(chalk.dim(`     - ${f}  →  tests/**/${expectedTestBasename(f)} 필요`))
  }
  if (hard) {
    console.log(chalk.red('\n  VHK_TEST_FIRST=1 — test-first 미충족으로 차단(exit 1).'))
    process.exitCode = 1
  } else {
    console.log(chalk.dim('\n  (경고만 — HARD 차단하려면 VHK_TEST_FIRST=1)'))
    printNextStep({
      message: '먼저 실패 테스트를 작성하세요(red→green):',
      command: 'vhk testmap',
      cursorHint: '테스트 매핑 점검해줘',
    })
  }
}
