import fs from 'node:fs'
import path from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { readJsonFile } from './read-json.js'
import { ensureVhkIgnored } from './backup.js'
import { atomicWriteFile } from './atomic-write.js'

/**
 * 클라우드 동기화 순수 로직 — 네트워크(gh) 호출과 분리해 단위 테스트 가능하게 둔다.
 * 규격: docs/spec.md (.vhk/ 트래킹 정책).
 */

/** 클라우드 백업에서 항상 제외하는 로컬 전용/메타 파일 (프라이버시·무의미) */
export const DEFAULT_CLOUD_EXCLUDES = [
  'memory.json',   // 개인 의사결정 메모
  'refs.json',     // 개인 참고링크
  'policy.json',   // 로컬 자율 실행 정책
  'policy-baseline.json', // 로컬 정책 신뢰 기준
  '.*.tmp-*', // 원자 쓰기 중간본 — 완성 전 파일과 비공개 상태의 동시 업로드 차단
  '.policy-baseline.json.tmp-*', // 중단된 원자 쓰기의 비공개 임시본
  'run-state.json', // 짧게 유지되는 런별 계측·정책 상태
  'run-state.lock', // 병렬 런 상태 갱신 잠금(일시 파일)
  'run-state-recovery.lock', // stale 잠금 회수 직렬화(일시 파일)
  '.run-state.json.tmp-*', // 중단된 원자 쓰기의 비공개 임시본
  'HARD_STOP',     // 로컬 안전 신호
  'cloud.json',    // gist 포인터 (백업 대상 아님)
  'vhk-cloud-empty.md', // 제외 파일만 남은 gist의 비민감 전송 마커
  '.gitignore',    // .vhk/ 내부 gitignore
  '*.bak',         // #248: 백업본(memory.json.bak·.v1.bak 등) — 원본과 동일 개인정보, 누출 차단
]

export const VHK_DIR = '.vhk'
export const CLOUD_CONFIG_FILE = 'cloud.json'
/** Gist가 마지막 파일 삭제를 허용하지 않을 때 남기는 비민감 전송 마커. pull 대상이 아니다. */
export const CLOUD_EMPTY_PLACEHOLDER = 'vhk-cloud-empty.md'
export const CLOUD_EMPTY_PLACEHOLDER_CONTENT =
  '# VHK cloud\n\n공유할 로컬 상태가 없어 비민감 마커만 남겼습니다.\n'

// Win32 also aliases superscript 1/2/3 in COM/LPT device names.
const WINDOWS_DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i
const WINDOWS_INVALID_FILENAME = /[<>:"/\\|?*\u0000-\u001F\u007F]/

/** Gist 파일명은 외부 입력이다. `.vhk/` 바로 아래 한 컴포넌트로 안전한 이름만 허용한다. */
export function isSafeFlatGistFilename(name: string): boolean {
  if (name.length === 0 || name !== name.trim() || name === '.' || name === '..') return false
  if (Buffer.byteLength(name, 'utf-8') > 255) return false
  if (path.posix.isAbsolute(name) || path.win32.isAbsolute(name)) return false
  if (path.posix.basename(name) !== name || path.win32.basename(name) !== name) return false
  if (WINDOWS_INVALID_FILENAME.test(name) || /[. ]$/.test(name)) return false
  if (WINDOWS_DEVICE_NAME.test(name)) return false
  return true
}

/** Windows/macOS에서도 같은 파일로 보이는 case-fold/NFC 이름 쌍이 있는가. */
export function hasPortableFilenameCollisions(names: string[]): boolean {
  const seen = new Map<string, string>()
  for (const name of names) {
    const key = name.normalize('NFC').toLowerCase()
    const prior = seen.get(key)
    if (prior !== undefined && prior !== name) return true
    seen.set(key, name)
  }
  return false
}

export class UnsafeVhkLocalBoundaryError extends Error {
  constructor() {
    super('.vhk local boundary is unsafe')
    this.name = 'UnsafeVhkLocalBoundaryError'
  }
}

function normalizedPathForComparison(p: string): string {
  const normalized = path.normalize(p)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/**
 * 클라우드가 읽고 쓸 `.vhk/`는 실제 로컬 디렉터리여야 한다. 링크·junction을 따라가면
 * push는 워크스페이스 밖 내용을 업로드하고 pull은 밖의 파일을 덮을 수 있으므로 전부 fail-closed한다.
 */
export function assertSafeVhkLocalBoundary(rootDir: string, fileNames: string[] = []): void {
  const root = path.resolve(rootDir)
  const vhkDir = path.join(root, VHK_DIR)
  const stat = fs.lstatSync(vhkDir, { throwIfNoEntry: false })
  if (stat === undefined) return
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new UnsafeVhkLocalBoundaryError()

  let realRoot: string
  let realVhk: string
  try {
    realRoot = fs.realpathSync.native(root)
    realVhk = fs.realpathSync.native(vhkDir)
  } catch {
    throw new UnsafeVhkLocalBoundaryError()
  }
  const expected = path.join(realRoot, VHK_DIR)
  if (normalizedPathForComparison(realVhk) !== normalizedPathForComparison(expected)) {
    throw new UnsafeVhkLocalBoundaryError()
  }

  for (const name of fileNames) {
    if (!isSafeFlatGistFilename(name)) throw new UnsafeVhkLocalBoundaryError()
    const target = path.join(vhkDir, name)
    const targetStat = fs.lstatSync(target, { throwIfNoEntry: false })
    if (targetStat && (!targetStat.isFile() || targetStat.isSymbolicLink())) {
      throw new UnsafeVhkLocalBoundaryError()
    }
  }
}

export interface CloudConfig {
  gistId: string
}

/**
 * 루트 `.vhkignore` + 기본 제외 목록을 합쳐 ignore 인스턴스 생성.
 * 패턴은 `.vhk/` 내부 파일명 기준.
 */
export function loadVhkignore(rootDir: string): Ignore {
  const ig = ignore()
  const ignorePath = path.join(rootDir, '.vhkignore')
  if (fs.existsSync(ignorePath)) {
    ig.add(fs.readFileSync(ignorePath, 'utf-8'))
  }
  // 사용자 규칙의 negation(`!policy.json`)이 로컬 전용 파일을 다시 포함하지 못하게
  // 하드 제외를 항상 마지막에 적용한다. 이 순서는 privacy 경계의 일부다.
  ig.add(DEFAULT_CLOUD_EXCLUDES)
  return ig
}

/**
 * `.vhk/` 안에서 클라우드로 보낼 파일명 목록 (제외 규칙 적용 후).
 * 평면 파일만 대상 (spec 1.1 하위 폴더는 전부 로컬 전용 — 백업 대상 아님).
 */
export function collectVhkFiles(
  rootDir: string,
  ig: Ignore = loadVhkignore(rootDir)
): string[] {
  const vhkDir = path.join(rootDir, VHK_DIR)
  assertSafeVhkLocalBoundary(rootDir)
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(vhkDir, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
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
  assertSafeVhkLocalBoundary(rootDir)
  try {
    return fs.readdirSync(vhkDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/**
 * gist 에 존재하는 파일명을 현재 제외 규칙(ig) 기준으로 분리한다.
 * - keep: 백업/복원 대상 (제외 규칙에 안 걸림)
 * - excluded: 제외 대상 (현재 revision 정리 / 복원 스킵 대상)
 *
 * push 갱신 시 `excluded` 를 현재 revision에서 제거하고, pull 시 `keep` 만 복원한다.
 * Gist 과거 revision의 완전 삭제는 gist 재생성이 필요한 별도 사람 승인 작업이다.
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

/** pull 충돌 검사에 쓰는 `.vhk/` 바로 아래 모든 엔트리 이름(파일·링크·디렉터리 포함). */
export function collectVhkFlatEntryNames(rootDir: string): string[] {
  const vhkDir = path.join(rootDir, VHK_DIR)
  assertSafeVhkLocalBoundary(rootDir)
  try {
    return fs.readdirSync(vhkDir, { withFileTypes: true })
      .map(entry => entry.name)
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export type GistFileUpdate = null | { filename: string; content: string }

export interface GistHeadCleanupPlan {
  updates: Record<string, GistFileUpdate>
  excluded: string[]
  markerConflict: boolean
}

/**
 * 현재 Gist revision의 제외 파일 정리 계획.
 * Update Gist API는 key가 기존 파일명이어야 하므로, 마지막 제외 파일은 새 key 추가가 아니라
 * 기존 carrier를 비민감 마커로 rename한다. 검증된 마커는 동시 편집된 사용자 파일 삭제를
 * 피하기 위해 공유 파일과 함께 있어도 그대로 둔다.
 */
export function planGistHeadCleanup(
  names: string[],
  ig: Ignore,
  markerTrusted = false,
): GistHeadCleanupPlan {
  const { keep, excluded } = partitionGistFiles(names, ig)
  const updates = Object.create(null) as Record<string, GistFileUpdate>
  if (names.includes(CLOUD_EMPTY_PLACEHOLDER) && !markerTrusted) {
    return { updates, excluded, markerConflict: true }
  }
  if (keep.length > 0) {
    // 검증 뒤 PATCH 사이 다른 클라이언트가 동명 마커를 사용자 파일로 바꿀 수 있다. 마커는
    // 공유 파일과 함께 남아도 pull에서 제외되므로 삭제하지 않고, 나머지 제외 파일만 정리한다.
    for (const name of excluded) {
      if (name !== CLOUD_EMPTY_PLACEHOLDER) updates[name] = null
    }
    return { updates, excluded, markerConflict: false }
  }
  if (excluded.length === 0) return { updates, excluded, markerConflict: false }

  const ordered = [...excluded].sort()
  const carrier = ordered.includes(CLOUD_EMPTY_PLACEHOLDER)
    ? CLOUD_EMPTY_PLACEHOLDER
    : ordered[0]
  for (const name of ordered) {
    if (name === carrier && name === CLOUD_EMPTY_PLACEHOLDER) continue
    updates[name] = name === carrier
      ? { filename: CLOUD_EMPTY_PLACEHOLDER, content: CLOUD_EMPTY_PLACEHOLDER_CONTENT }
      : null
  }
  return { updates, excluded, markerConflict: false }
}

/** 현재 revision에 공유 파일만 있거나, 공유 파일 0개라 비민감 마커 하나만 있으면 정리 완료. */
export function gistHeadCleanupSatisfied(
  names: string[],
  ig: Ignore,
  markerTrusted = false,
): boolean {
  if (names.length === 0) return false
  if (names.includes(CLOUD_EMPTY_PLACEHOLDER) && !markerTrusted) return false
  const { keep, excluded } = partitionGistFiles(names, ig)
  if (keep.length > 0) {
    return excluded.every(name => name === CLOUD_EMPTY_PLACEHOLDER)
  }
  return names.length === 1 && names[0] === CLOUD_EMPTY_PLACEHOLDER
}

/** `.vhk/cloud.json` 읽기 — 없거나 JSON이 깨졌으면 null, 파일 접근 실패는 호출부로 전파. */
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
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

/** `.vhk/cloud.json` 쓰기 (gistId 포인터 저장) */
export function writeCloudConfig(rootDir: string, config: CloudConfig): void {
  const vhkDir = path.join(rootDir, VHK_DIR)
  assertSafeVhkLocalBoundary(rootDir, [CLOUD_CONFIG_FILE, '.gitignore'])
  fs.mkdirSync(vhkDir, { recursive: true })
  assertSafeVhkLocalBoundary(rootDir, [CLOUD_CONFIG_FILE, '.gitignore'])
  // 기존 프로젝트의 뒤쪽 negation까지 이기는 양성 규칙을 먼저 고정한 뒤 포인터를 쓴다.
  ensureVhkIgnored(rootDir, CLOUD_CONFIG_FILE, '.cloud.json.tmp-*')
  const p = path.join(vhkDir, CLOUD_CONFIG_FILE)
  assertSafeVhkLocalBoundary(rootDir, [CLOUD_CONFIG_FILE, '.gitignore'])
  atomicWriteFile(p, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
}
