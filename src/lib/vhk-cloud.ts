import fs from 'node:fs'
import path from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { readJsonFile } from './read-json.js'

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

/**
 * `.vhk/` 안의 하위 디렉터리 이름 목록 (#160). collectVhkFiles 는 평면 파일만 백업하므로
 * 하위 폴더(예: evolve/queue.json)는 제외된다 — cloudPush 가 이 목록으로 사용자에게 경고한다.
 */
export function collectVhkSubdirs(rootDir: string): string[] {
  const vhkDir = path.join(rootDir, VHK_DIR)
  try {
    return fs.readdirSync(vhkDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * gist 에 존재하는 파일명을 현재 제외 규칙(ig) 기준으로 분리한다.
 * - keep: 백업/복원 대상 (제외 규칙에 안 걸림)
 * - excluded: 제외 대상 (privacy purge / 복원 스킵 대상)
 *
 * push 갱신 시 `excluded` 를 gist 에서 제거(`gh gist edit -r`)해 과거에 올라간
 * `memory.json`·`refs.json` 등 개인 파일이 남는 privacy 누수를 막는다.
 * pull 시 `keep` 만 복원해 과거 누수가 있어도 로컬에 되살아나지 않게 한다.
 */
export function partitionGistFiles(
  gistFiles: string[],
  ig: Ignore
): { keep: string[]; excluded: string[] } {
  const keep: string[] = []
  const excluded: string[] = []
  for (const name of gistFiles) {
    // ignore 는 빈 문자열/디렉토리 경로에 예외를 던질 수 있으니 평면 파일명만 평가.
    if (name && ig.ignores(name)) excluded.push(name)
    else if (name) keep.push(name)
  }
  return { keep, excluded }
}

/** `.vhk/cloud.json` 읽기 — 없거나 깨졌으면 null */
export function readCloudConfig(rootDir: string): CloudConfig | null {
  const p = path.join(rootDir, VHK_DIR, CLOUD_CONFIG_FILE)
  if (!fs.existsSync(p)) return null
  try {
    // readJsonFile: UTF-8 BOM 제거(BOM-safe). 손상 JSON 은 throw → 아래 catch 에서 null.
    const parsed = readJsonFile<{ gistId?: unknown }>(p)
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
  // VHK-022: cloud.json 은 secret gist 포인터 → 추적 금지. init 안 거친 기존 프로젝트도
  // push 시점에 .vhk/.gitignore 에 cloud.json 항목을 보장(없으면 추가)해 노출을 막는다.
  ensureCloudConfigIgnored(vhkDir)
}

/** `.vhk/.gitignore` 가 cloud.json 을 무시하도록 보장 (idempotent). */
function ensureCloudConfigIgnored(vhkDir: string): void {
  const giPath = path.join(vhkDir, '.gitignore')
  let content = ''
  try {
    if (fs.existsSync(giPath)) content = fs.readFileSync(giPath, 'utf-8')
  } catch {
    return // 읽기 실패 시 조용히 포기 — cloud.json 쓰기 자체는 막지 않는다.
  }
  const already = content.split(/\r?\n/).some((l) => l.trim() === CLOUD_CONFIG_FILE)
  if (already) return
  const block = `# secret gist 포인터 — 추적 금지 (VHK-022)\n${CLOUD_CONFIG_FILE}\n`
  const base = content.length === 0 ? '' : content.endsWith('\n') ? content : content + '\n'
  try {
    fs.writeFileSync(giPath, base + block, 'utf-8')
  } catch {
    // 쓰기 실패해도 cloud.json 저장은 유효 — 무시.
  }
}
