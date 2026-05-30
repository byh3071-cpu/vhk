import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  syncCore,
  buildSyncPlan,
  parseRulesMd,
  deriveProjectName,
} from '../src/commands/sync.js'
import { listBackups } from '../src/lib/backup.js'

const RULES = `# 데모 — Rules

## 코딩 규칙
- execSync 금지

## 기록 규칙
- 세션 로그
`

let dir: string
const alwaysYes = async (): Promise<boolean> => true
const alwaysNo = async (): Promise<boolean> => false

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-syncg-'))
  fs.writeFileSync(path.join(dir, 'RULES.md'), RULES, 'utf-8')
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function read(rel: string): string {
  return fs.readFileSync(path.join(dir, rel), 'utf-8')
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(dir, rel))
}

describe('syncCore — 첫 sync', () => {
  it('타겟 생성 + .synced 마커 + firstSync=true', async () => {
    const r = await syncCore(dir, {}, alwaysYes)
    expect(r.firstSync).toBe(true)
    expect(exists('.cursorrules')).toBe(true)
    expect(exists('CLAUDE.md')).toBe(true)
    expect(exists('.vhk/.synced')).toBe(true)
    expect(r.written).toContain('.cursorrules')
  })

  it('기존 파일 있으면 첫 sync 에서 백업(+gitignore 등록)', async () => {
    fs.writeFileSync(path.join(dir, '.cursorrules'), '손으로 만든 규칙\n', 'utf-8')
    const r = await syncCore(dir, {}, alwaysYes)
    expect(r.backupId).not.toBeNull()
    expect(r.backedUp).toContain('.cursorrules')
    const gi = read('.vhk/.gitignore')
    expect(gi).toContain('backups/')
    expect(gi).toContain('.synced')
  })
})

describe('syncCore — drift 가드 (데이터 손실 0)', () => {
  it('drift + 덮어쓰기 거부 → 백업 저장되고 원본 유지', async () => {
    await syncCore(dir, {}, alwaysYes) // 초기 동기화(마커 생성)
    fs.writeFileSync(path.join(dir, '.cursorrules'), '내 손글 규칙\n', 'utf-8') // 사용자 수정 = drift
    const r = await syncCore(dir, {}, alwaysNo) // 덮어쓰기 거부
    expect(r.backupId).not.toBeNull()
    expect(r.skipped).toContain('.cursorrules')
    expect(read('.cursorrules')).toBe('내 손글 규칙\n') // 원본 보존
    // 백업에 사용자 원본이 들어있어 복구 가능
    const backups = listBackups(dir)
    expect(backups.length).toBeGreaterThan(0)
    const backed = fs.readFileSync(path.join(backups[0].dir, '.cursorrules'), 'utf-8')
    expect(backed).toBe('내 손글 규칙\n')
  })

  it('drift + 자동 승인(비대화형) → 백업 후 재생성본으로 덮어씀 (멈춤 없음)', async () => {
    await syncCore(dir, {}, alwaysYes)
    fs.writeFileSync(path.join(dir, '.cursorrules'), 'drift\n', 'utf-8')
    const r = await syncCore(dir, {}, alwaysYes) // 비대화형 = 자동 true
    expect(r.backupId).not.toBeNull()
    expect(r.written).toContain('.cursorrules')
    expect(read('.cursorrules')).not.toBe('drift\n')
    expect(read('.cursorrules')).toContain('Cursor Rules')
  })
})

describe('syncCore — --dry-run', () => {
  it('디스크 미변경 + 백업도 안 만듦', async () => {
    await syncCore(dir, {}, alwaysYes)
    fs.writeFileSync(path.join(dir, '.cursorrules'), 'drift now\n', 'utf-8')
    const r = await syncCore(dir, { dryRun: true }, alwaysNo)
    expect(r.dryRun).toBe(true)
    expect(r.written).toEqual([])
    expect(read('.cursorrules')).toBe('drift now\n') // 변경 안 됨
    expect(listBackups(dir).length).toBe(0) // 백업 생성 안 함
  })
})

describe('buildSyncPlan — drift 판정', () => {
  it('무수정=not drift, 수작업 수정=drift', async () => {
    await syncCore(dir, {}, alwaysYes)
    const sections = parseRulesMd(read('RULES.md'))
    const name = deriveProjectName(read('RULES.md'))
    let plan = buildSyncPlan(dir, sections, name)
    expect(plan.find((p) => p.path === '.cursorrules')?.drift).toBe(false)

    fs.writeFileSync(path.join(dir, '.cursorrules'), 'hand edit\n', 'utf-8')
    plan = buildSyncPlan(dir, sections, name)
    expect(plan.find((p) => p.path === '.cursorrules')?.drift).toBe(true)
  })

  it('CLAUDE.md 도 계획에 포함 (하이브리드 가드)', async () => {
    const sections = parseRulesMd(read('RULES.md'))
    const name = deriveProjectName(read('RULES.md'))
    const plan = buildSyncPlan(dir, sections, name)
    expect(plan.map((p) => p.path)).toContain('CLAUDE.md')
  })

  // 회귀: toClaudeMd 비멱등 → 매 sync 마다 CLAUDE.md drift → 백업 churn → pruneBackups 가
  // 진짜 사용자 백업을 밀어내 영구 소실. 멱등성으로 churn 차단.
  it('CLAUDE.md 멱등 — 반복 sync 가 drift 를 만들지 않음 (백업 churn 방지)', async () => {
    await syncCore(dir, {}, alwaysYes) // 1회차
    const after1 = read('CLAUDE.md')
    await syncCore(dir, {}, alwaysYes) // 2회차 (원본 무변경)
    const after2 = read('CLAUDE.md')
    expect(after2).toBe(after1) // 바이트 동일 = 멱등 (배너 누적 없음)
    const sections = parseRulesMd(read('RULES.md'))
    const plan = buildSyncPlan(dir, sections, deriveProjectName(read('RULES.md')))
    expect(plan.find((p) => p.path === 'CLAUDE.md')?.drift).toBe(false)
  })

  it('반복 sync 가 백업을 churn 하지 않음 — 사용자 원본 백업 보존', async () => {
    fs.writeFileSync(path.join(dir, '.cursorrules'), '6개월 튜닝한 손글 규칙\n', 'utf-8')
    await syncCore(dir, {}, alwaysYes) // Day1 — 원본 백업
    const day1 = listBackups(dir)[0]
    expect(
      fs.readFileSync(path.join(day1.dir, '.cursorrules'), 'utf-8')
    ).toBe('6개월 튜닝한 손글 규칙\n')
    // 원본 무변경 상태로 sync 12회 더 — CLAUDE.md 가 churn 하면 Day1 백업이 evict 됨
    for (let i = 0; i < 12; i++) await syncCore(dir, {}, alwaysYes)
    const stillThere = listBackups(dir).some((b) => b.id === day1.id)
    expect(stillThere).toBe(true) // Day1 백업이 남아있어야 (멱등이면 백업 자체가 1회만)
  })
})
