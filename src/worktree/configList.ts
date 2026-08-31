import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonFile } from '../lib/read-json.js'
import type { CopyItem } from './types.js'

// 커밋되는 env 템플릿(.example/.sample/.template)은 이미 git 으로 따라오므로 복사 제외.
const ENV_TEMPLATE_SUFFIXES = ['.example', '.sample', '.template']

// `.env*` 이면서 템플릿이 아닌 것 = 복사 대상(gitignore 된 시크릿 env).
export function isCopyableEnvFile(name: string): boolean {
  if (!name.startsWith('.env')) return false
  return !ENV_TEMPLATE_SUFFIXES.some((s) => name.endsWith(s))
}

// 디렉터리 파일명 목록 → 복사 대상 env 파일만.
export function listEnvFiles(names: string[]): string[] {
  return names.filter(isCopyableEnvFile)
}

// 순수: env 파일 + 추가 설정 → CopyItem[]. (호출자가 fs 에서 목록을 채워 넣음)
export function buildCopyList(input: {
  sourceDir: string
  targetDir: string
  envFiles: string[]
  extraConfigs: string[]
}): CopyItem[] {
  const items: CopyItem[] = []
  for (const f of input.envFiles) {
    items.push({ source: join(input.sourceDir, f), target: join(input.targetDir, f), kind: 'env' })
  }
  for (const f of input.extraConfigs) {
    items.push({ source: join(input.sourceDir, f), target: join(input.targetDir, f), kind: 'config' })
  }
  return items
}

// VHK 설정(.vhk/config.json 의 worktreeCopy[])에 등록된 추가 복사 대상. 없으면 [].
// 손상/형식 오류여도 worktree 생성을 막지 않는다(빈 목록으로 graceful).
export function readExtraConfigs(sourceDir: string): string[] {
  const p = join(sourceDir, '.vhk', 'config.json')
  if (!existsSync(p)) return []
  try {
    const cfg = readJsonFile<{ worktreeCopy?: unknown }>(p)
    if (Array.isArray(cfg.worktreeCopy)) {
      return cfg.worktreeCopy.filter((x): x is string => typeof x === 'string')
    }
  } catch {
    // 무시 — 빈 목록
  }
  return []
}

export function readWorktreeRoot(sourceDir: string): string | null {
  const p = join(sourceDir, '.vhk', 'config.json')
  if (!existsSync(p)) return null
  try {
    const cfg = readJsonFile<{ worktreeRoot?: unknown }>(p)
    return typeof cfg.worktreeRoot === 'string' && cfg.worktreeRoot.trim() !== ''
      ? cfg.worktreeRoot.trim()
      : null
  } catch {
    return null
  }
}

// IO 수집: sourceDir 스캔(.env*) + .vhk/config.json 추가 설정 → CopyItem[].
export function collectCopyItems(sourceDir: string, targetDir: string): CopyItem[] {
  let names: string[] = []
  try {
    names = readdirSync(sourceDir)
  } catch {
    names = []
  }
  const envFiles = listEnvFiles(names)
  const extraConfigs = readExtraConfigs(sourceDir)
  return buildCopyList({ sourceDir, targetDir, envFiles, extraConfigs })
}
