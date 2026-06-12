import fs from 'node:fs'
import path from 'node:path'
import { isPathIgnored, loadGitignore } from './check-secure.js'
import type { Ignore } from 'ignore'

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.nuxt',
  'build',
  'coverage',
  'out',
  '.turbo',
  '.vercel',
  '.cache',
  '.pnpm',
  '.idea',
  '.claude',
  // '.cursor' 는 제외하지 않음 (#170): tracked 에이전트 설정(mcp.json 등)에 자격증명이
  // 들어갈 수 있어 스캔 대상. 캐시·생성물은 .gitignore(isPathIgnored)가 거른다.
])

const SKIP_FILE_NAMES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
])

const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py',
  '.json', '.yaml', '.yml', '.toml',
])

export const MAX_SCAN_FILE_BYTES = 512 * 1024

export function isScannableFileName(fileName: string): boolean {
  if (SKIP_FILE_NAMES.has(fileName)) return false
  if (fileName.startsWith('.env')) return true
  return SCAN_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}

export function walkProjectFiles(
  rootDir: string,
  onFile: (absolutePath: string, relativePath: string) => void,
  ig: Ignore = loadGitignore(rootDir),
  // Goal 59: 512KB 초과로 스킵된 파일을 호출부에 신호(불완전 스캔 가시화). optional — 기존 호출부 무영향.
  onSkippedLargeFile?: (relativePath: string) => void
) {
  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/')

      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue
        if (isPathIgnored(ig, `${rel}/`)) continue
        walk(fullPath)
        continue
      }

      if (!isScannableFileName(entry.name)) continue
      if (isPathIgnored(ig, rel)) continue

      let size = 0
      try {
        size = fs.statSync(fullPath).size
      } catch {
        continue
      }
      if (size > MAX_SCAN_FILE_BYTES) {
        onSkippedLargeFile?.(rel) // Goal 59: 조용히 스킵하던 대용량 파일을 불완전 신호로 노출.
        continue
      }

      onFile(fullPath, rel)
    }
  }

  walk(rootDir)
}
