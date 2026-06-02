import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { context } from '../src/commands/context.js'
import { brief } from '../src/commands/brief.js'
import { activeMemoryLines } from '../src/commands/memory.js'
import {
  migrateMemory,
  readMemory,
  writeMemory,
  recordLesson,
  memoryAdd,
  memoryList,
  memoryRemove,
  memoryArchive,
  memoryMigrate,
  MEMORY_PATH_REL,
  type MemoryFileV2,
} from '../src/commands/memory.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mem-'))
}
function seedV1(d: string, arr: unknown[]): void {
  fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
  fs.writeFileSync(path.join(d, MEMORY_PATH_REL), JSON.stringify(arr), 'utf-8')
}
function seedLearnings(d: string, body: string): void {
  fs.mkdirSync(path.join(d, 'docs', 'state'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'state', 'learnings.md'), body, 'utf-8')
}
function read(d: string): MemoryFileV2 {
  return JSON.parse(fs.readFileSync(path.join(d, MEMORY_PATH_REL), 'utf-8'))
}

describe('memory v2 — migrateMemory (순수)', () => {
  it('v1 평면 배열 → decisions (status active)', () => {
    const v2 = migrateMemory([{ content: 'A', addedAt: '2026-01-01', tags: ['x'] }, { content: 'B' }])
    expect(v2.schemaVersion).toBe(2)
    expect(v2.decisions).toHaveLength(2)
    expect(v2.decisions[0]).toMatchObject({ content: 'A', tags: ['x'], status: 'active' })
    expect(v2.failures).toEqual([])
  })
  it('learnings.md 흡수 → failures (lesson, content 비움)', () => {
    const learnings = '# Learnings\n\n- [2026-05-27 goal-1] 교훈 하나.\n- [2026-05-28 release] 교훈 둘.\n'
    const v2 = migrateMemory([], learnings)
    expect(v2.failures).toHaveLength(2)
    expect(v2.failures[0].content).toBe('')
    expect(v2.failures[0].lesson).toBe('교훈 하나.')
    expect(v2.failures[0].tags).toEqual(['goal-1'])
  })
  it('이미 v2 면 멱등 (learnings 재흡수 안 함)', () => {
    const once = migrateMemory([{ content: 'A' }], '- [2026-01-01 goal-1] L.\n')
    const twice = migrateMemory(once, '- [2026-01-01 goal-1] L.\n')
    expect(twice.decisions).toHaveLength(1)
    expect(twice.failures).toHaveLength(1) // 두 번째 호출이 재흡수하지 않음
  })
})

describe('memory v2 — read/write (fs)', () => {
  it('readMemory: v1 + learnings 흡수 → v2 (BOM-safe)', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL), '﻿' + JSON.stringify([{ content: 'BOM 결정' }]), 'utf-8')
    seedLearnings(d, '- [2026-01-01 goal-2] BOM 교훈.\n')
    const mem = readMemory(d)
    expect(mem.decisions[0].content).toBe('BOM 결정')
    expect(mem.failures[0].lesson).toBe('BOM 교훈.')
    fs.rmSync(d, { recursive: true, force: true })
  })
  it('writeMemory: 기존 파일 있으면 .bak 백업', () => {
    const d = tmp()
    seedV1(d, [{ content: '원본' }])
    writeMemory(d, migrateMemory(readMemory(d)))
    expect(fs.existsSync(path.join(d, MEMORY_PATH_REL + '.bak'))).toBe(true)
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('memory v2 — recordLesson (learn 통합)', () => {
  it('교훈 → failures.lesson + learnings.md 신규 기록 안 함', () => {
    const d = tmp()
    const entry = recordLesson(d, 'PowerShell 은 && 미지원', 7)
    expect(entry.lesson).toBe('PowerShell 은 && 미지원')
    const mem = read(d)
    expect(mem.failures[0].lesson).toBe('PowerShell 은 && 미지원')
    expect(mem.failures[0].tags).toEqual(['goal-7'])
    expect(fs.existsSync(path.join(d, 'docs', 'state', 'learnings.md'))).toBe(false) // learnings.md 미생성
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('memory v2 — 커맨드 (tmp+chdir)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    process.exitCode = 0
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it('memoryAdd --type failure (--why --lesson) → failures 버킷, status active', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('테스트가 변경 미커버', { type: 'failure', why: '테스트 안 짬', lesson: '회귀 가드 먼저' })
    const mem = read(d)
    expect(mem.failures).toHaveLength(1)
    expect(mem.failures[0]).toMatchObject({ why: '테스트 안 짬', lesson: '회귀 가드 먼저', status: 'active' })
    expect(mem.decisions).toEqual([])
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryAdd --type success (--why) → successes', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('롤백 빨랐다', { type: 'success', why: '백업 먼저' })
    expect(read(d).successes[0]).toMatchObject({ why: '백업 먼저', status: 'active' })
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryAdd 기본 → decisions, 빈 content → exit 1', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('API tRPC')
    expect(read(d).decisions[0].content).toBe('API tRPC')
    await memoryAdd('')
    expect(process.exitCode).toBe(1)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryArchive → status archived (활성 목록서 제외, 선순환)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('보관 대상')
    await memoryArchive('1')
    const mem = read(d)
    expect(mem.decisions[0].status).toBe('archived')
    expect(mem.decisions[0].archivedAt).toBeDefined()
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryRemove → 해당 항목 삭제', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('지울것')
    await memoryAdd('남길것')
    await memoryRemove('1')
    const mem = read(d)
    expect(mem.decisions).toHaveLength(1)
    expect(mem.decisions[0].content).toBe('남길것')
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryMigrate → v1 파일을 v2 로 재기록 (.bak)', async () => {
    const d = tmp()
    seedV1(d, [{ content: '결정1' }])
    seedLearnings(d, '- [2026-01-01 goal-1] 교훈1.\n')
    process.chdir(d)
    await memoryMigrate()
    const mem = read(d)
    expect(mem.schemaVersion).toBe(2)
    expect(mem.decisions[0].content).toBe('결정1')
    expect(mem.failures[0].lesson).toBe('교훈1.')
    expect(fs.existsSync(path.join(d, MEMORY_PATH_REL + '.bak'))).toBe(true)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('.v1.bak = v1 원본 write-once 영구 보존 (후속 add/archive 가 못 덮음) + 롤링 .bak 은 최신', async () => {
    const d = tmp()
    seedV1(d, [{ content: '원본 결정' }]) // v1: 1개
    process.chdir(d)
    await memoryMigrate() // .v1.bak = v1 원본
    await memoryAdd('새 결정') // v2 덮어쓰기
    await memoryAdd('또 결정', { type: 'success' })
    // .v1.bak 은 v1 평면 배열 원본 그대로
    const v1bak = JSON.parse(fs.readFileSync(path.join(d, MEMORY_PATH_REL + '.v1.bak'), 'utf-8'))
    expect(Array.isArray(v1bak)).toBe(true)
    expect(v1bak).toHaveLength(1)
    expect(v1bak[0].content).toBe('원본 결정')
    // 롤링 .bak 은 직전(v2) 상태 — v2 객체
    const bak = JSON.parse(fs.readFileSync(path.join(d, MEMORY_PATH_REL + '.bak'), 'utf-8'))
    expect(bak.schemaVersion).toBe(2)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('memory v2 — activeMemoryLines + context/brief 렌더 (회귀)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  it('activeMemoryLines — active decisions/failures/successes 렌더, archived 제외', () => {
    const mem: MemoryFileV2 = {
      schemaVersion: 2,
      decisions: [
        { id: 'd1', content: '활성 결정', tags: [], createdAt: '', status: 'active' },
        { id: 'd2', content: '보관 결정', tags: [], createdAt: '', status: 'archived' },
      ],
      failures: [{ id: 'f1', content: '', tags: [], createdAt: '', status: 'active', lesson: '교훈X' }],
      successes: [{ id: 's1', content: '성공Y', tags: [], createdAt: '', status: 'active' }],
      patterns: [],
    }
    const out = activeMemoryLines(mem).join('\n')
    expect(out).toContain('활성 결정')
    expect(out).toContain('교훈X')
    expect(out).toContain('성공Y')
    expect(out).not.toContain('보관 결정') // archived 제외
  })

  function seedProject(d: string): void {
    execFileSync('git', ['init'], { cwd: d, stdio: 'pipe' })
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 't', version: '0.0.0' }), 'utf-8')
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    const mem: MemoryFileV2 = {
      schemaVersion: 2,
      decisions: [{ id: 'd1', content: 'tRPC 채택 결정', tags: ['api'], createdAt: '2026-01-01', status: 'active' }],
      failures: [],
      successes: [],
      patterns: [],
    }
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL), JSON.stringify(mem, null, 2), 'utf-8')
  }

  it('vhk context → context.md 에 v2 decision 노출', async () => {
    const d = tmp()
    seedProject(d)
    process.chdir(d)
    await context()
    const md = fs.readFileSync(path.join(d, '.vhk', 'context.md'), 'utf-8')
    expect(md).toContain('tRPC 채택 결정')
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('vhk brief → brief.md 에 v2 decision 노출', async () => {
    const d = tmp()
    seedProject(d)
    process.chdir(d)
    await brief()
    const md = fs.readFileSync(path.join(d, '.vhk', 'brief.md'), 'utf-8')
    expect(md).toContain('tRPC 채택 결정')
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
