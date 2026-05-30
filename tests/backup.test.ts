import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  saveBackup,
  listBackups,
  restoreBackup,
  pruneBackups,
  fsSafeStamp,
} from '../src/lib/backup.js'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-backup-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function write(rel: string, content: string): void {
  const full = path.join(dir, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}
function read(rel: string): string {
  return fs.readFileSync(path.join(dir, rel), 'utf-8')
}

describe('fsSafeStamp', () => {
  it('콜론·점 제거 — Windows 파일명 금지문자 안전', () => {
    const s = fsSafeStamp(new Date('2026-05-30T09:19:17.358Z'))
    expect(s).not.toMatch(/[:.]/)
    expect(s).toBe('2026-05-30T09-19-17-358Z')
  })
})

describe('saveBackup', () => {
  it('존재 파일 백업 + 중첩 구조 보존', () => {
    write('.cursorrules', 'orig cursor')
    write('.github/copilot-instructions.md', 'orig copilot')
    const info = saveBackup(
      ['.cursorrules', '.github/copilot-instructions.md'],
      dir,
      '2026-01-01T00-00-00-000Z'
    )
    expect(info.id).toBe('2026-01-01T00-00-00-000Z')
    expect(info.files.sort()).toEqual(
      ['.cursorrules', '.github/copilot-instructions.md'].sort()
    )
    expect(read('.vhk/backups/2026-01-01T00-00-00-000Z/.cursorrules')).toBe('orig cursor')
    expect(read('.vhk/backups/2026-01-01T00-00-00-000Z/.github/copilot-instructions.md')).toBe(
      'orig copilot'
    )
  })

  it('존재하지 않는 파일은 건너뜀', () => {
    write('.cursorrules', 'x')
    const info = saveBackup(['.cursorrules', '.windsurfrules'], dir, '2026-01-01T00-00-00-000Z')
    expect(info.files).toEqual(['.cursorrules'])
  })

  it('.vhk/.gitignore 에 backups/ 자동 추가 (없을 때 생성)', () => {
    write('.cursorrules', 'x')
    saveBackup(['.cursorrules'], dir, '2026-01-01T00-00-00-000Z')
    expect(read('.vhk/.gitignore')).toMatch(/(^|\n)backups\/(\n|$)/)
  })

  it('기존 .vhk/.gitignore 보존하며 append', () => {
    write('.vhk/.gitignore', 'memory.json\nrefs.json\n')
    write('.cursorrules', 'x')
    saveBackup(['.cursorrules'], dir, '2026-01-01T00-00-00-000Z')
    const gi = read('.vhk/.gitignore')
    expect(gi).toContain('memory.json')
    expect(gi).toContain('backups/')
  })

  it('이미 backups/ 있으면 중복 추가 안 함', () => {
    write('.vhk/.gitignore', 'backups/\n')
    write('.cursorrules', 'x')
    saveBackup(['.cursorrules'], dir, '2026-01-01T00-00-00-000Z')
    const count = read('.vhk/.gitignore')
      .split('\n')
      .filter((l) => l.trim() === 'backups/').length
    expect(count).toBe(1)
  })

  // 회귀: 같은 ms 타임스탬프로 연속 백업 시 디렉터리 충돌로 첫 백업이 덮여 영구 유실되면 안 됨.
  it('같은 stamp 재호출 → 유니크 디렉터리 (첫 백업 덮어쓰기 방지)', () => {
    write('.cursorrules', 'FIRST')
    const a = saveBackup(['.cursorrules'], dir, '2026-09-09T00-00-00-000Z')
    write('.cursorrules', 'SECOND')
    const b = saveBackup(['.cursorrules'], dir, '2026-09-09T00-00-00-000Z')
    expect(a.id).not.toBe(b.id)
    expect(fs.readFileSync(path.join(a.dir, '.cursorrules'), 'utf-8')).toBe('FIRST')
    expect(fs.readFileSync(path.join(b.dir, '.cursorrules'), 'utf-8')).toBe('SECOND')
    expect(listBackups(dir).length).toBe(2)
  })

  // 회귀: suffix 가 zero-pad 안 되면 base-10 < base-2 (렉시컬) 라 11회+ 충돌 시 listBackups
  // 최신순이 뒤틀려 pruneBackups 가 진짜 최신을 지운다. zero-pad 로 정렬 안정화 확인.
  it('동일 stamp 12회 충돌 → listBackups 최신순 유지 (suffix zero-pad)', () => {
    write('.cursorrules', 'x')
    let lastId = ''
    for (let i = 0; i < 12; i++) {
      lastId = saveBackup(['.cursorrules'], dir, '2026-09-09T00-00-00-000Z').id
    }
    const list = listBackups(dir)
    expect(list.length).toBe(12)
    expect(list[0].id).toBe(lastId) // 가장 최근 생성본이 목록 최상단(최신순)
  })
})

describe('listBackups', () => {
  it('최신순 정렬', () => {
    write('.cursorrules', 'x')
    saveBackup(['.cursorrules'], dir, '2026-01-01T00-00-00-000Z')
    saveBackup(['.cursorrules'], dir, '2026-02-01T00-00-00-000Z')
    expect(listBackups(dir).map((b) => b.id)).toEqual([
      '2026-02-01T00-00-00-000Z',
      '2026-01-01T00-00-00-000Z',
    ])
  })
  it('백업 폴더 없으면 빈 배열', () => {
    expect(listBackups(dir)).toEqual([])
  })
})

describe('restoreBackup', () => {
  it('백업 내용으로 복원 — 현재 파일 덮어씀', () => {
    write('.cursorrules', 'orig')
    saveBackup(['.cursorrules'], dir, '2026-01-01T00-00-00-000Z')
    write('.cursorrules', 'modified by user')
    const restored = restoreBackup('2026-01-01T00-00-00-000Z', dir)
    expect(restored).toEqual(['.cursorrules'])
    expect(read('.cursorrules')).toBe('orig')
  })
  it('중첩 경로 복원 (삭제된 파일도)', () => {
    write('.github/copilot-instructions.md', 'orig')
    saveBackup(['.github/copilot-instructions.md'], dir, '2026-01-01T00-00-00-000Z')
    fs.rmSync(path.join(dir, '.github/copilot-instructions.md'))
    restoreBackup('2026-01-01T00-00-00-000Z', dir)
    expect(read('.github/copilot-instructions.md')).toBe('orig')
  })
  it('없는 id → throw', () => {
    expect(() => restoreBackup('nope', dir)).toThrow()
  })
})

describe('pruneBackups', () => {
  it('최근 N개만 유지, 나머지 삭제', () => {
    write('.cursorrules', 'x')
    for (const m of ['01', '02', '03', '04']) {
      saveBackup(['.cursorrules'], dir, `2026-${m}-01T00-00-00-000Z`)
    }
    const deleted = pruneBackups(2, dir)
    expect(listBackups(dir).map((b) => b.id)).toEqual([
      '2026-04-01T00-00-00-000Z',
      '2026-03-01T00-00-00-000Z',
    ])
    expect(deleted.sort()).toEqual(
      ['2026-01-01T00-00-00-000Z', '2026-02-01T00-00-00-000Z'].sort()
    )
  })
  it('N 이하면 삭제 0', () => {
    write('.cursorrules', 'x')
    saveBackup(['.cursorrules'], dir, '2026-01-01T00-00-00-000Z')
    expect(pruneBackups(5, dir)).toEqual([])
  })
})
