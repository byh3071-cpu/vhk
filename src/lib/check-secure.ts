import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import ignore, { type Ignore } from 'ignore'

/** 실수로 커밋되면 위험한 파일 패턴 */
export const SENSITIVE_GLOBS = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  'credentials.json',
  'secrets.json',
  'id_rsa',
  'id_rsa.pub',
]

export type SecureCheckResult = {
  ok: boolean
  missingGitignore: boolean
  exposedPaths: string[]
  warnings: string[]
}

/**
 * .gitignore 기반 ignore 인스턴스 생성
 */
export function loadGitignore(rootDir: string): Ignore {
  const ig = ignore()
  const gitignorePath = path.join(rootDir, '.gitignore')

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8')
    ig.add(content)
  }

  return ig
}

/**
 * 경로가 ignore 대상인지 확인 (프로젝트 루트 기준 상대경로)
 */
export function isPathIgnored(ig: Ignore, relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/')
  return ig.ignores(normalized)
}

/**
 * ignore되지 않은 민감 파일 후보 스캔 (최대 depth 3)
 */
export function findExposedSensitiveFiles(
  rootDir: string,
  ig: Ignore = loadGitignore(rootDir),
  maxDepth = 8
): string[] {
  const exposed: string[] = []

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue

      const fullPath = path.join(dir, entry.name)
      const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/')

      if (entry.isDirectory()) {
        if (!isPathIgnored(ig, rel + '/')) walk(fullPath, depth + 1)
        continue
      }

      if (isSensitiveName(entry.name) && !isPathIgnored(ig, rel)) {
        exposed.push(rel)
      }
    }
  }

  walk(rootDir, 0)
  return exposed
}

function isSensitiveName(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower === '.env' || lower.startsWith('.env.')) return true
  if (lower.endsWith('.pem') || lower.endsWith('.key')) return true
  if (lower === 'credentials.json' || lower === 'secrets.json') return true
  if (lower.startsWith('id_rsa')) return true
  return false
}

/**
 * recap/init 전 보안 점검 — .gitignore 없음·노출 파일 경고
 */
export function checkProjectSecurity(rootDir: string = process.cwd()): SecureCheckResult {
  const gitignorePath = path.join(rootDir, '.gitignore')
  const missingGitignore = !fs.existsSync(gitignorePath)
  const ig = loadGitignore(rootDir)
  const exposedPaths = findExposedSensitiveFiles(rootDir, ig)
  const warnings: string[] = []

  if (missingGitignore) {
    warnings.push('.gitignore 파일이 없습니다. 민감한 파일이 실수로 올라갈 수 있어요.')
  }

  if (exposedPaths.length > 0) {
    warnings.push(
      `ignore되지 않은 민감 파일 ${exposedPaths.length}개: ${exposedPaths.join(', ')}`
    )
  }

  return {
    ok: !missingGitignore && exposedPaths.length === 0,
    missingGitignore,
    exposedPaths,
    warnings,
  }
}

/** save/init/recap 전 — 경고만 출력 (진행은 막지 않음) */
export function printSecurityWarnings(rootDir: string = process.cwd()): boolean {
  const result = checkProjectSecurity(rootDir)
  if (result.ok) return true
  for (const w of result.warnings) {
    console.log(chalk.yellow(`   ⚠️  ${w}`))
  }
  return false
}

/**
 * 파일 목록에서 gitignore 대상 제거
 */
export function filterTrackedPaths(
  paths: string[],
  rootDir: string = process.cwd()
): string[] {
  const ig = loadGitignore(rootDir)
  return paths.filter(p => !isPathIgnored(ig, p.replace(/\\/g, '/')))
}
