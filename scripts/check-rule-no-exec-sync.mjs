import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const sourceRoot = join(process.cwd(), 'src')
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const violations = []

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (!sourceExtensions.has(extname(entry.name))) continue

    const content = readFileSync(fullPath, 'utf-8')
    const importsExecSync = /import\s*\{[^}]*\bexecSync\b[^}]*\}\s*from\s*['"]node:child_process['"]/s.test(content)
    const namespaceImports = [
      ...content.matchAll(/import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*['"]node:child_process['"]/g),
    ]
    const usesNamespaceExecSync = namespaceImports.some((match) => (
      new RegExp(`\\b${match[1]}\\.execSync\\s*\\(`).test(content)
    ))
    if (importsExecSync || usesNamespaceExecSync) {
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
