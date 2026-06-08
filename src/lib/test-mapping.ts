import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

// Goal 28: test-first 매핑.
// "신규 기능 파일(src/commands·src/lib 의 .ts)에 대응 테스트가 있는가" 를 검사한다.
// v0 철학(과안정화 경계): 기본은 **경고만**. VHK_TEST_FIRST=1 일 때만 HARD(exit 1).
// 커밋 타임스탬프로 "정말 먼저 썼는지" 는 증명 안 함(위양성·우회 쉬움 — 카드 OUT 범위).

/** 테스트가 요구되는 기능 소스 디렉터리(POSIX 표기, 경로 매칭용). */
export const FEATURE_DIRS = ['src/commands', 'src/lib'] as const

/** 경로 구분자 정규화(Windows \ → /). */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/** 기능 소스인가 — FEATURE_DIRS 하위 .ts (단, *.test.ts / *.d.ts / types 전용 제외). */
export function isFeatureSource(rel: string): boolean {
  const p = toPosix(rel)
  if (!p.endsWith('.ts')) return false
  if (p.endsWith('.test.ts') || p.endsWith('.d.ts')) return false
  return FEATURE_DIRS.some((d) => p.startsWith(d + '/'))
}

/** 기능 소스에 대응하는 테스트 파일 basename (예: src/commands/foo.ts → foo.test.ts). */
export function expectedTestBasename(rel: string): string {
  const base = basename(toPosix(rel)).replace(/\.ts$/, '')
  return `${base}.test.ts`
}

/**
 * srcRels 중 대응 테스트가 없는 기능 소스를 반환(순수).
 * @param testBasenames tests/ 아래 모든 *.test.ts 의 basename 집합.
 */
export function findUntested(srcRels: string[], testBasenames: Set<string>): string[] {
  const out: string[] = []
  for (const rel of srcRels) {
    if (!isFeatureSource(rel)) continue
    if (!testBasenames.has(expectedTestBasename(rel))) out.push(toPosix(rel))
  }
  return out
}

/** tests/ 디렉터리를 재귀 스캔해 모든 *.test.ts basename 집합을 만든다(IO). */
export function collectTestBasenames(testsDir: string): Set<string> {
  const out = new Set<string>()
  if (!existsSync(testsDir)) return out
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const fp = join(dir, name)
      let isDir = false
      try {
        isDir = statSync(fp).isDirectory()
      } catch {
        continue
      }
      if (isDir) walk(fp)
      else if (name.endsWith('.test.ts')) out.add(name)
    }
  }
  walk(testsDir)
  return out
}
