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
import ts from 'typescript'

const ROOT = process.cwd()
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
// 헬퍼 자신은 unlink/rmdir 만 쓰지만 설명 주석에 rmSync 를 언급한다.
const ALLOWLIST = new Set([join('src', 'lib', 'fs-remove.ts')])
const BASELINE_PATH = join(ROOT, 'scripts', 'rmsync-baseline.json')

/**
 * 파일 안의 rmSync 실제 호출 수(AST 기준).
 *
 * 정규식으로 주석·문자열을 걷어내는 방식은 중첩 인용에서 무너진다 — 작은따옴표 문자열 안의 백틱을
 * 템플릿으로 오인하거나, 반대로 템플릿 치환식(`${fs.rmSync(x)}`)에 든 진짜 호출을 통째로 날린다.
 * 후자는 그대로 우회 통로가 된다. 잔존 건수가 baseline 정합성에 직결되므로 여기서는 파서를 쓴다.
 *
 * named import 만 있고 호출이 없어도 1 로 센다(간접 호출로 빠져나가는 것 방지).
 */
function countRmSync(content, fileName) {
  const source = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true)
  const names = new Set(['rmSync'])
  let importedOnly = false
  let calls = 0

  // 1차: import 절에서 로컬 이름(별칭 포함)을 모은다.
  const collectImports = (node) => {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
      const bindings = node.importClause.namedBindings
      if (ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const original = element.propertyName?.text ?? element.name.text
          if (original === 'rmSync') {
            names.add(element.name.text)
            importedOnly = true
          }
        }
      }
    }
    ts.forEachChild(node, collectImports)
  }
  collectImports(source)

  // 2차: 호출을 센다. fs.rmSync(...) 같은 프로퍼티 접근과 rmSync(...) 직접 호출 둘 다.
  const countCalls = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (ts.isIdentifier(callee) && names.has(callee.text)) calls += 1
      else if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'rmSync') calls += 1
      else if (
        ts.isElementAccessExpression(callee)
        && ts.isStringLiteralLike(callee.argumentExpression)
        && callee.argumentExpression.text === 'rmSync'
      ) calls += 1
    }
    ts.forEachChild(node, countCalls)
  }
  countCalls(source)

  if (calls > 0) return calls
  return importedOnly ? 1 : 0
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
      const n = countRmSync(readFileSync(fullPath, 'utf-8'), fullPath)
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
  // baseline 은 tests 잔존분만 다룬다. src 위반을 안고 성공으로 끝내면 갱신 명령이 위반을 덮는다.
  const sourceFiles = Object.keys(sourceCounts)
  if (sourceFiles.length > 0) {
    process.stderr.write(
      `src 의 rmSync 를 먼저 없애세요 (baseline 은 tests 전용):\n${sourceFiles.join('\n')}\n`,
    )
    process.exit(1)
  }
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
