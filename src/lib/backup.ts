import fs from 'node:fs'
import path from 'node:path'
import { removeDirSync, removeFileSync } from './fs-remove.js'
import { atomicWriteFile } from './atomic-write.js'
import { workspaceTempLockPath } from './workspace-temp-lock.js'
import { readJsonFile } from './read-json.js'

/**
 * vhk 자체 백업 — git 비의존 복구. 덮어쓰기 직전 원본을 `.vhk/backups/<id>/` 로 복사한다.
 * undo(git 커밋만 되돌림)의 구멍(언커밋 sync 덮어쓰기 복구 불가)을 메운다.
 * 보존 정책(pruneBackups)으로 무한 증식 방지, `.vhk/.gitignore`·cloud 제외로 추적/유출 방지.
 */

const BACKUPS_REL = path.join('.vhk', 'backups')
const VHK_GITIGNORE_REL = path.join('.vhk', '.gitignore')
const IGNORE_LOCK_TIMEOUT_MS = 5_000
const ignoreLockWait = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))
let ignoreLockCounter = 0

function withVhkIgnoreLock<T>(rootDir: string, update: () => T): T {
  const lockPath = workspaceTempLockPath(rootDir, 'vhk-ignore')
  const token = `${process.pid}-${Date.now()}-${ignoreLockCounter++}`
  const startedAt = Date.now()
  let fd: number | undefined
  for (;;) {
    try {
      fd = fs.openSync(lockPath, 'wx', 0o600)
      try {
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token }))
      } catch (error) {
        fs.closeSync(fd)
        fd = undefined
        removeFileSync(lockPath)
        throw error
      }
      break
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      // Windows는 다른 프로세스가 lock을 닫고 지우는 짧은 구간에도 EPERM을 줄 수 있다.
      // namespace 자체는 소유권·권한을 먼저 검증했으므로 이 경로의 EPERM만 제한 재시도한다.
      if (code !== 'EEXIST' && code !== 'EPERM') throw error
      if (Date.now() - startedAt >= IGNORE_LOCK_TIMEOUT_MS) {
        const timeout = new Error(
          `.vhk/.gitignore 잠금 시간이 초과되었습니다. 실행 중인 VHK 프로세스를 확인한 뒤 ${lockPath}를 사람이 직접 정리하세요.`,
        ) as NodeJS.ErrnoException
        timeout.code = 'VHK_IGNORE_LOCK_TIMEOUT'
        throw timeout
      }
      Atomics.wait(ignoreLockWait, 0, 0, 10)
    }
  }

  try {
    return update()
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
    try {
      const owner = readJsonFile<{ token?: unknown }>(lockPath)
      if (owner.token !== token) {
        const lost = new Error('.vhk/.gitignore lock ownership changed') as NodeJS.ErrnoException
        lost.code = 'VHK_IGNORE_LOCK_OWNERSHIP_LOST'
        throw lost
      }
      removeFileSync(lockPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

export interface BackupInfo {
  /** 백업 디렉터리명 = 파일시스템 안전 타임스탬프 (정렬하면 시간순) */
  id: string
  /** 백업 디렉터리 절대/상대 경로 */
  dir: string
  /** 백업된 파일들의 rootDir 기준 상대경로 */
  files: string[]
}

/**
 * 파일시스템 안전 타임스탬프 — ISO 의 ':' '.' 를 '-' 로 치환.
 * ⚠️ Windows 는 파일명에 ':' 를 허용하지 않으므로 raw ISO 를 디렉터리명으로 쓰면 실패한다.
 * 예: 2026-05-30T09:19:17.358Z → 2026-05-30T09-19-17-358Z
 */
export function fsSafeStamp(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-')
}

/**
 * `.vhk/.gitignore` 에 주어진 항목들이 없으면 추가 (없으면 파일 생성). 기존 내용 보존.
 * 로컬 전용 산출물(backups/·.synced 등)이 추적/클라우드로 새지 않게 자기방어.
 * `backups/` 는 `backups` 와 동치로 간주(중복 추가 방지).
 */
export function ensureVhkIgnored(rootDir: string, ...entries: string[]): void {
  withVhkIgnoreLock(rootDir, () => {
    const giPath = path.join(rootDir, VHK_GITIGNORE_REL)
    const vhkDir = path.dirname(giPath)
    const existingDir = fs.lstatSync(vhkDir, { throwIfNoEntry: false })
    if (existingDir && (!existingDir.isDirectory() || existingDir.isSymbolicLink())) {
      throw new Error('.vhk must be a real directory')
    }
    fs.mkdirSync(vhkDir, { recursive: true })
    const existingIgnore = fs.lstatSync(giPath, { throwIfNoEntry: false })
    if (existingIgnore && (!existingIgnore.isFile() || existingIgnore.isSymbolicLink())) {
      throw new Error('.vhk/.gitignore must be a regular file')
    }
    let content = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf-8') : ''
    const lines = content.split(/\r?\n/).map((line) => line.trim())
    // gitignore 는 뒤 규칙이 이긴다. 양성 규칙 문자열이 앞에 있어도 이후 `!…`가 있으면
    // 추적 가능해질 수 있으므로, 요청 규칙을 마지막 negation 뒤에 다시 고정한다.
    const lastNegation = lines.reduce(
      (last, line, index) => line.startsWith('!') ? index : last,
      -1,
    )
    const missing = entries.filter((entry) => {
      const normalized = entry.trim().replace(/\/$/, '')
      const lastPositive = lines.reduce(
        (last, line, index) => line.replace(/\/$/, '') === normalized ? index : last,
        -1,
      )
      return lastPositive < lastNegation || lastPositive === -1
    })
    if (missing.length === 0) return
    if (content.length > 0 && !content.endsWith('\n')) content += '\n'
    content += missing.join('\n') + '\n'
    atomicWriteFile(giPath, content)
  })
}

/** 백업 디렉터리 안의 모든 파일을 rootDir(여기선 backupDir) 기준 상대경로(posix)로 수집. */
function walkRelFiles(baseDir: string, cur = baseDir): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(cur)) {
    const full = path.join(cur, entry)
    if (fs.statSync(full).isDirectory()) {
      out.push(...walkRelFiles(baseDir, full))
    } else {
      out.push(path.relative(baseDir, full).split(path.sep).join('/'))
    }
  }
  return out
}

/**
 * 주어진 파일들 중 **실제로 존재하는 것만** `.vhk/backups/<stamp>/<상대경로>` 로 복사.
 * 중첩 경로(.github/·.agents/rules/)는 구조 보존. `stamp` 미지정 시 현재시각.
 * 첫 호출에서 `.vhk/.gitignore` 에 backups/ 보장.
 */
export function saveBackup(files: string[], rootDir: string, stamp?: string): BackupInfo {
  // 충돌 방지: 같은 ms(또는 같은 명시 stamp)로 재호출 시 기존 백업을 덮어쓰면 직전 원본이
  // 영구 유실된다. 디렉터리가 이미 있으면 suffix 를 붙여 유니크화(시간순 정렬도 보존).
  const baseId = stamp ?? fsSafeStamp(new Date())
  let id = baseId
  let n = 1
  // suffix 는 가독성용 zero-pad. 정렬 정확성은 listBackups 의 숫자 비교(backupOrderKey)가
  // 보장하므로 자릿수를 넘겨도(예: 1000+) 시간순이 안 깨진다.
  while (fs.existsSync(path.join(rootDir, BACKUPS_REL, id))) {
    id = `${baseId}-${String(n++).padStart(3, '0')}`
  }
  const backupDir = path.join(rootDir, BACKUPS_REL, id)
  const saved: string[] = []

  for (const rel of files) {
    const src = path.join(rootDir, rel)
    if (!fs.existsSync(src)) continue
    const dest = path.join(backupDir, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    saved.push(rel)
  }

  ensureVhkIgnored(rootDir, 'backups/')
  return { id, dir: backupDir, files: saved }
}

/** 백업 목록 — 최신순(id 역정렬). 백업 폴더 없으면 빈 배열. */
/**
 * 백업 id 정렬 키 — baseId(시간순 ISO 문자열, 'Z' 종료) + 숫자 suffix.
 * 단순 문자열 정렬은 충돌 suffix 에서 base-1000 < base-999 처럼 렉시컬 뒤틀림이 생긴다
 * (zero-pad 도 자릿수 넘으면 재발). 숫자로 비교해 어떤 suffix 폭에서도 시간순을 보장.
 */
function backupOrderKey(id: string): [string, number] {
  const m = /^(.*Z)(?:-(\d+))?$/.exec(id)
  return m ? [m[1], m[2] ? parseInt(m[2], 10) : 0] : [id, 0]
}

/** 백업 목록 — 최신순. 백업 폴더 없으면 빈 배열. */
export function listBackups(rootDir: string): BackupInfo[] {
  const root = path.join(rootDir, BACKUPS_REL)
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root)
    .filter((e) => fs.statSync(path.join(root, e)).isDirectory())
    .sort((a, b) => {
      const [ba, na] = backupOrderKey(a)
      const [bb, nb] = backupOrderKey(b)
      if (ba !== bb) return ba < bb ? 1 : -1 // base 시간 역순(최신 먼저)
      return nb - na // 같은 base 면 suffix 큰(나중) 것 먼저
    })
    .map((id) => {
      const dir = path.join(root, id)
      return { id, dir, files: walkRelFiles(dir) }
    })
}

/**
 * 백업 id 의 파일들을 원래 상대경로로 복원(현재 파일 덮어씀). 복원된 상대경로 목록 반환.
 * 없는 id 면 throw.
 */
export function restoreBackup(id: string, rootDir: string): string[] {
  const backupDir = path.join(rootDir, BACKUPS_REL, id)
  if (!fs.existsSync(backupDir)) {
    throw new Error(`백업 없음: ${id}`)
  }
  const rels = walkRelFiles(backupDir)
  for (const rel of rels) {
    const src = path.join(backupDir, rel)
    const dest = path.join(rootDir, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
  return rels
}

/** 보존 정책 — 최근 keepN 개만 남기고 오래된 백업 삭제. 삭제한 id 목록 반환. */
export function pruneBackups(keepN: number, rootDir: string): string[] {
  const all = listBackups(rootDir) // 최신순
  const toDelete = all.slice(Math.max(0, keepN))
  for (const b of toDelete) {
    removeDirSync(b.dir)
  }
  return toDelete.map((b) => b.id)
}
