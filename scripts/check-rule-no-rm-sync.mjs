/*
 * TS-005 회귀 가드 — src 에 fs.rmSync 신규 사용 금지.
 *
 * Windows + Node v24 에서 rmSync 는 경로에 비ASCII 문자가 있으면 프로세스를 exit 0xC0000409 로 죽이거나
 * (상위 경로에 비ASCII) 조용히 삭제를 건너뛴다(이름에 비ASCII). 한글 사용자명 홈 경로가 전부 해당된다.
 * 대체: src/lib/fs-remove.ts 의 removeFileSync / removeDirSync.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const sourceRoot = join(process.cwd(), 'src')
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
// 헬퍼 자신은 unlink/rmdir 만 쓰므로 검사 대상이지만, 설명 주석에 rmSync 를 언급한다.
const ALLOWLIST = new Set([join('src', 'lib', 'fs-remove.ts')])
const violations = []

/** 주석·문자열 안의 언급은 위반이 아니다 — 실제 호출만 잡는다. */
function stripCommentsAndStrings(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

function usesRmSync(content) {
  const code = stripCommentsAndStrings(content)
  // fs.rmSync(...) / rmSync(...) 호출 + node:fs 에서의 named import 둘 다.
  return /\brmSync\s*\(/.test(code) || /import\s*\{[^}]*\brmSync\b[^}]*\}\s*from\s*['"](?:node:)?fs['"]/s.test(content)
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (!sourceExtensions.has(extname(entry.name))) continue

    const rel = relative(process.cwd(), fullPath)
    if (ALLOWLIST.has(rel)) continue

    if (usesRmSync(readFileSync(fullPath, 'utf-8'))) {
      violations.push(rel)
    }
  }
}

try {
  walk(sourceRoot)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`rmSync 검사 실행 실패: ${message}\n`)
  process.exitCode = 1
}
if (violations.length > 0) {
  process.stderr.write(
    `rmSync 사용 금지 위반 (TS-005 — removeFileSync/removeDirSync 로 교체):\n${violations.join('\n')}\n`,
  )
  process.exitCode = 1
}
