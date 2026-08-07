import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const sourceRoot = join(process.cwd(), 'src')
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const violations = []

const CHILD_PROCESS_MODULE = String.raw`(?:node:)?child_process`

function usesExecSync(content) {
  const namedImport = new RegExp(
    String.raw`import\s*\{[^}]*\bexecSync\b[^}]*\}\s*from\s*['"]${CHILD_PROCESS_MODULE}['"]`,
    's',
  )
  const destructuredRequire = new RegExp(
    String.raw`\b(?:const|let|var)\s*\{[^}]*\bexecSync\b[^}]*\}\s*=\s*require\(\s*['"]${CHILD_PROCESS_MODULE}['"]\s*\)`,
    's',
  )
  const directRequire = new RegExp(
    String.raw`require\(\s*['"]${CHILD_PROCESS_MODULE}['"]\s*\)\.execSync\s*\(`,
  )
  if (namedImport.test(content) || destructuredRequire.test(content) || directRequire.test(content)) {
    return true
  }

  const namespaceNames = [
    ...content.matchAll(new RegExp(
      String.raw`import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*['"]${CHILD_PROCESS_MODULE}['"]`,
      'g',
    )),
    ...content.matchAll(new RegExp(
      String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]${CHILD_PROCESS_MODULE}['"]\s*\)`,
      'g',
    )),
  ].map((match) => match[1])

  return namespaceNames.some((name) => (
    new RegExp(String.raw`\b${name}\.execSync\b`).test(content)
  ))
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (!sourceExtensions.has(extname(entry.name))) continue

    const content = readFileSync(fullPath, 'utf-8')
    if (usesExecSync(content)) {
      violations.push(relative(process.cwd(), fullPath))
    }
  }
}

try {
  walk(sourceRoot)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`execSync 검사 실행 실패: ${message}\n`)
  process.exitCode = 1
}
if (violations.length > 0) {
  process.stderr.write(`execSync import 금지 위반:\n${violations.join('\n')}\n`)
  process.exitCode = 1
}
