/*
 * TS-005 회귀 가드 — fs.rmSync 신규 사용 금지.
 *
 * Windows + Node v24 에서 rmSync 는 경로에 비ASCII 문자가 있으면 프로세스를 exit 0xC0000409 로 죽이거나
 * (상위 경로에 비ASCII) 조용히 삭제를 건너뛴다(이름에 비ASCII). 한글 사용자명 홈 경로가 전부 해당된다.
 * 대체: src/lib/fs-remove.ts 의 removeFileSync / removeDirSync.
 *
 * src 는 0 건, tests 는 baseline(파일별 잔존 건수) 이하만 허용한다.
 * tests 를 한 번에 치환하지 않는 이유: 125 파일 500+ 곳을 기계 치환하면 diff 가 리뷰 불가능해지고
 * 회귀 위험이 이득을 넘는다. 임시 경로는 vitest.config.ts 에서 ASCII 로 고정해 실피해를 이미 막았으므로,
 * 여기서는 "더 늘지 않게" 만 강제하고 점진적으로 줄인다.
 *
 * baseline 갱신: node scripts/check-rule-no-rm-sync.mjs --update-baseline
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
// 헬퍼 자신은 unlink/rmdir 만 쓰지만 설명 주석에 rmSync 를 언급한다.
const ALLOWLIST = new Set([join('src', 'lib', 'fs-remove.ts')])
const BASELINE_PATH = join(ROOT, 'scripts', 'rmsync-baseline.json')

/** 주석·문자열 안의 언급은 위반이 아니다 — 실제 호출만 잡는다. */
function stripCommentsAndStrings(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

/**
 * 파일 안의 rmSync 실제 호출 수. named import 만 있고 호출이 없어도 1 로 센다(우회 방지).
 * import 검사도 주석·문자열을 걷어낸 코드에서 한다 — 이 가드를 검사하는 테스트처럼 문자열 리터럴 안에
 * import 문을 담은 파일을 위반으로 오인하기 때문. strip 후 모듈 경로 자리에는 빈 따옴표만 남는다.
 */
function countRmSync(content) {
  const code = stripCommentsAndStrings(content)
  const calls = code.match(/\brmSync\s*\(/g)?.length ?? 0
  if (calls > 0) return calls
  const imported = /import\s*\{[^}]*\brmSync\b[^}]*\}\s*from\s*(?:''|"")/s.test(code)
  return imported ? 1 : 0
}

/** 디렉터리를 걸어 파일별 rmSync 건수를 센다(0 건은 담지 않는다). */
function scan(dir) {
  const counts = {}
  if (!existsSync(dir)) return counts
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue
      const rel = relative(ROOT, fullPath).split('\\').join('/')
      if (ALLOWLIST.has(relative(ROOT, fullPath))) continue
      const n = countRmSync(readFileSync(fullPath, 'utf-8'))
      if (n > 0) counts[rel] = n
    }
  }
  walk(dir)
  return counts
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return {}
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`rmSync baseline 을 읽지 못했습니다: ${message}\n`)
    process.exit(1)
  }
}

let sourceCounts
let testCounts
try {
  sourceCounts = scan(join(ROOT, 'src'))
  testCounts = scan(join(ROOT, 'tests'))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`rmSync 검사 실행 실패: ${message}\n`)
  process.exit(1)
}

if (process.argv.includes('--update-baseline')) {
  const sorted = Object.fromEntries(Object.entries(testCounts).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8')
  const total = Object.values(sorted).reduce((a, b) => a + b, 0)
  process.stdout.write(`rmSync baseline 갱신: ${Object.keys(sorted).length}개 파일 · ${total}건\n`)
  process.exit(0)
}

const baseline = readBaseline()
const violations = []

for (const file of Object.keys(sourceCounts)) {
  violations.push(`${file} — src 는 rmSync 를 쓸 수 없습니다`)
}
for (const [file, count] of Object.entries(testCounts)) {
  const allowed = baseline[file] ?? 0
  if (count > allowed) {
    violations.push(
      allowed === 0
        ? `${file} — 새 파일에 rmSync ${count}건 (removeDirSync/removeFileSync 를 쓰세요)`
        : `${file} — rmSync 가 ${allowed}건에서 ${count}건으로 늘었습니다`,
    )
  }
}

if (violations.length > 0) {
  process.stderr.write(`rmSync 사용 금지 위반 (TS-005):\n${violations.join('\n')}\n`)
  process.exit(1)
}

// 줄어든 건 차단하지 않는다 — 정리를 벌주면 아무도 안 줄인다. baseline 만 갱신하면 된다.
const shrunk = Object.entries(baseline).filter(([f, n]) => (testCounts[f] ?? 0) < n)
if (shrunk.length > 0) {
  process.stdout.write(
    `rmSync 잔존이 ${shrunk.length}개 파일에서 줄었습니다 — `
      + 'node scripts/check-rule-no-rm-sync.mjs --update-baseline 으로 baseline 을 낮추세요.\n',
  )
}
