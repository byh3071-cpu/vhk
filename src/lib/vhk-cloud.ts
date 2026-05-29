import fs from 'node:fs'
import path from 'node:path'
import ignore, { type Ignore } from 'ignore'

/**
 * 클라우드 동기화 순수 로직 — 네트워크(gh) 호출과 분리해 단위 테스트 가능하게 둔다.
 * 규격: docs/spec.md (.vhk/ 트래킹 정책).
 */

/** 클라우드 백업에서 항상 제외하는 로컬 전용/메타 파일 (프라이버시·무의미) */
export const DEFAULT_CLOUD_EXCLUDES = [
  'memory.json',   // 개인 의사결정 메모
  'refs.json',     // 개인 참고링크
  'HARD_STOP',     // 로컬 안전 신호
  'cloud.json',    // gist 포인터 (백업 대상 아님)
  '.gitignore',    // .vhk/ 내부 gitignore
]

export const VHK_DIR = '.vhk'
export const CLOUD_CONFIG_FILE = 'cloud.json'

export interface CloudConfig {
  gistId: string
}

/**
 * 루트 `.vhkignore` + 기본 제외 목록을 합쳐 ignore 인스턴스 생성.
 * 패턴은 `.vhk/` 내부 파일명 기준.
 */
export function loadVhkignore(rootDir: string): Ignore {
  const ig = ignore()
  ig.add(DEFAULT_CLOUD_EXCLUDES)

  const ignorePath = path.join(rootDir, '.vhkignore')
  if (fs.existsSync(ignorePath)) {
    ig.add(fs.readFileSync(ignorePath, 'utf-8'))
  }
  return ig
}

/**
 * `.vhk/` 안에서 클라우드로 보낼 파일명 목록 (제외 규칙 적용 후).
 * 평면 구조만 대상 (하위 폴더 무시 — spec_version 1.0).
 */
export function collectVhkFiles(
  rootDir: string,
  ig: Ignore = loadVhkignore(rootDir)
): string[] {
  const vhkDir = path.join(rootDir, VHK_DIR)
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(vhkDir, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(name => !ig.ignores(name))
    .sort()
}

/** `.vhk/cloud.json` 읽기 — 없거나 깨졌으면 null */
export function readCloudConfig(rootDir: string): CloudConfig | null {
  const p = path.join(rootDir, VHK_DIR, CLOUD_CONFIG_FILE)
  if (!fs.existsSync(p)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'))
    if (parsed && typeof parsed.gistId === 'string' && parsed.gistId) {
      return { gistId: parsed.gistId }
    }
    return null
  } catch {
    return null
  }
}

/** `.vhk/cloud.json` 쓰기 (gistId 포인터 저장) */
export function writeCloudConfig(rootDir: string, config: CloudConfig): void {
  const vhkDir = path.join(rootDir, VHK_DIR)
  fs.mkdirSync(vhkDir, { recursive: true })
  const p = path.join(vhkDir, CLOUD_CONFIG_FILE)
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
