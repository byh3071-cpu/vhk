import fs from 'node:fs'
import path from 'node:path'

/**
 * vhk 자체 백업 — git 비의존 복구. 덮어쓰기 직전 원본을 `.vhk/backups/<id>/` 로 복사한다.
 * undo(git 커밋만 되돌림)의 구멍(언커밋 sync 덮어쓰기 복구 불가)을 메운다.
 * 보존 정책(pruneBackups)으로 무한 증식 방지, `.vhk/.gitignore`·cloud 제외로 추적/유출 방지.
 */

const BACKUPS_REL = path.join('.vhk', 'backups')
const VHK_GITIGNORE_REL = path.join('.vhk', '.gitignore')

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
  const giPath = path.join(rootDir, VHK_GITIGNORE_REL)
  fs.mkdirSync(path.dirname(giPath), { recursive: true })
  let content = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf-8') : ''
  const present = new Set(content.split('\n').map((l) => l.trim().replace(/\/$/, '')))
  const missing = entries.filter((e) => !present.has(e.trim().replace(/\/$/, '')))
  if (missing.length === 0) return
  if (content.length > 0 && !content.endsWith('\n')) content += '\n'
  content += missing.join('\n') + '\n'
  fs.writeFileSync(giPath, content, 'utf-8')
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
  // suffix 는 zero-pad — listBackups 의 문자열 정렬이 시간순과 어긋나지 않게
  // (base-10 < base-2 같은 렉시컬 뒤틀림 방지 → pruneBackups 가 진짜 최신을 안 지움).
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
export function listBackups(rootDir: string): BackupInfo[] {
  const root = path.join(rootDir, BACKUPS_REL)
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root)
    .filter((e) => fs.statSync(path.join(root, e)).isDirectory())
    .sort()
    .reverse()
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
    fs.rmSync(b.dir, { recursive: true, force: true })
  }
  return toDelete.map((b) => b.id)
}
