import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonFile } from './read-json.js'

/**
 * #171: harness/audit 가 루트 package.json 만 보고 중첩 패키지(예: dashboard/)를 놓치던 문제.
 * 점검 대상 프로젝트(루트 + 중첩)를 한 곳에서 발견해 harness·audit 가 공유한다.
 */

export interface DiscoveredProject {
  /** 루트 기준 상대 경로 (루트는 '.'). 슬래시 구분. */
  path: string
  /** package.json name (없으면 path) */
  name: string
  /** package.json scripts (없으면 {}) */
  scripts: Record<string, string>
}

interface PkgJson {
  name?: string
  scripts?: Record<string, string>
  vhk?: { projects?: unknown }
}

// 스캔에서 제외할 디렉터리 (산출물·의존성·VCS·툴 캐시).
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.vercel', '.vhk', '.turbo',
])

function readPkg(dir: string): PkgJson | null {
  // existsSync 로 선-게이트하지 않는다 — 부재 시 readJsonFile 이 throw → catch 에서 null.
  // (선-게이트하면 fs 를 통째 mock 한 환경에서 readdirSync/existsSync 불일치로 오작동.)
  try {
    return readJsonFile<PkgJson>(join(dir, 'package.json'))
  } catch {
    return null
  }
}

/**
 * 점검 대상 프로젝트 목록 — 루트 + 중첩 패키지.
 *  1) 루트 package.json 의 `vhk.projects` 배열(명시 오버라이드)이 있으면 → 루트 + 그 경로들만.
 *  2) 없으면 자동: 루트 + 하위 디렉터리 스캔으로 nested package.json (깊이 ≤ maxDepth, SKIP_DIRS·dotdir 제외).
 * 루트에 package.json 이 없으면 빈 배열(점검 대상 없음).
 */
export function discoverProjects(root = '.', maxDepth = 2): DiscoveredProject[] {
  const out: DiscoveredProject[] = []
  const seen = new Set<string>()

  const add = (rel: string): void => {
    const norm = rel === '' ? '.' : rel.replace(/\\/g, '/')
    if (seen.has(norm)) return
    const pkg = readPkg(join(root, norm))
    if (!pkg) return
    seen.add(norm)
    out.push({ path: norm, name: pkg.name ?? norm, scripts: pkg.scripts ?? {} })
  }

  const rootPkg = readPkg(root)
  if (!rootPkg) return out // 루트가 패키지가 아니면 대상 없음
  add('.')

  // 1) 명시 오버라이드 — 자동 스캔 건너뜀.
  const explicit = rootPkg.vhk?.projects
  if (Array.isArray(explicit) && explicit.length > 0) {
    for (const rel of explicit) if (typeof rel === 'string' && rel.trim()) add(rel.trim())
    return out
  }

  // 2) 자동 중첩 스캔.
  const walk = (relDir: string, depth: number): void => {
    if (depth > maxDepth) return
    let entries
    try {
      entries = readdirSync(join(root, relDir || '.'), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
      const childRel = relDir ? `${relDir}/${e.name}` : e.name
      if (existsSync(join(root, childRel, 'package.json'))) add(childRel)
      walk(childRel, depth + 1)
    }
  }
  walk('', 1)
  return out
}
