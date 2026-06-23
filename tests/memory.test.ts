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
  memoryResolve,
  memoryUnarchive,
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
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

  it('손상 memory.json — read 경로(memoryList)가 덮어쓰지 않고 원본 보존 (#1 blocker)', async () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    const corrupt = '{ "decisions": [ this is not valid json'
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL), corrupt, 'utf-8')
    process.chdir(d)
    await memoryList() // read 경로 — 손상 파일을 빈 v2 로 절대 덮으면 안 됨
    expect(fs.readFileSync(path.join(d, MEMORY_PATH_REL), 'utf-8')).toBe(corrupt)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('손상 memory.json + .v1.bak 선재 — 반복 read 도 데이터 파괴 안 함 (#1 worst-case)', async () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL + '.v1.bak'), JSON.stringify([{ content: '오래된 v1' }]), 'utf-8')
    const corrupt = '{ broken'
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL), corrupt, 'utf-8')
    process.chdir(d)
    await memoryList()
    await memoryList() // 두 번째 read 도 파괴 금지(이전엔 .bak 덮어쓰며 영구 손실)
    expect(fs.readFileSync(path.join(d, MEMORY_PATH_REL), 'utf-8')).toBe(corrupt)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryMigrate — 인식 불가 객체(미래 스키마/수동편집)면 덮어쓰지 않고 중단 (exit 1, 원본 보존)', async () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    // v1 배열도 v2(schemaVersion:2) 도 아닌 객체 — 미래 v3+ 또는 수동 편집 의심.
    const future = JSON.stringify({ schemaVersion: 3, somethingNew: [] })
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL), future, 'utf-8')
    process.chdir(d)
    await memoryMigrate()
    expect(process.exitCode).toBe(1) // 마이그레이션 대상 아님 → 중단
    expect(fs.readFileSync(path.join(d, MEMORY_PATH_REL), 'utf-8')).toBe(future) // 빈 v2 로 덮지 않음
    expect(fs.existsSync(path.join(d, MEMORY_PATH_REL + '.v1.bak'))).toBe(false) // 백업도 안 만듦
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryMigrate — memory.json/learnings 둘 다 없으면 파일 생성 안 함 (거짓 백업 메시지 방지, #3)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryMigrate()
    expect(fs.existsSync(path.join(d, MEMORY_PATH_REL))).toBe(false) // 빈 파일 안 만듦
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryMigrate — learnings 만 있으면 v2 생성하되 .v1.bak 없음 (신규 생성, #3)', async () => {
    const d = tmp()
    seedLearnings(d, '- [2026-01-01 goal-1] 교훈만.\n')
    process.chdir(d)
    await memoryMigrate()
    expect(read(d).failures[0].lesson).toBe('교훈만.')
    expect(fs.existsSync(path.join(d, MEMORY_PATH_REL + '.v1.bak'))).toBe(false) // 원본 없었으니 백업 없음
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryRemove — 중복 id 여도 위치 기준으로 정확히 삭제 (#D)', async () => {
    const d = tmp()
    const v2: MemoryFileV2 = {
      schemaVersion: 2,
      decisions: [
        { id: 'd1', content: 'FIRST', tags: [], createdAt: '', status: 'active' },
        { id: 'd1', content: 'SECOND', tags: [], createdAt: '', status: 'active' },
      ],
      failures: [], successes: [], patterns: [],
    }
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL), JSON.stringify(v2, null, 2) + '\n', 'utf-8')
    process.chdir(d)
    await memoryRemove('2') // 두 번째(SECOND) 삭제 의도 — id 매칭이면 FIRST 가 지워졌었음
    const mem = read(d)
    expect(mem.decisions).toHaveLength(1)
    expect(mem.decisions[0].content).toBe('FIRST')
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  // #318: parseInt 부분파싱('2zzz'→2, '1.5'→1)으로 엉뚱한 항목을 조용히 삭제/보관하던 파괴적 버그.
  //        엄격 정수 검증으로 비정수·소수·문자혼입·공백·빈문자 전부 거부 (특히 remove 는 되돌릴 수 없어 엄격).
  describe('#318 memory remove/archive — 부분파싱 차단 (파괴적 오삭제 방지)', () => {
    // 2개 항목을 깔고, 잘못된 indexStr 가 어느 것도 건드리지 않음을 확인.
    function seedTwo(d: string): void {
      const v2: MemoryFileV2 = {
        schemaVersion: 2,
        decisions: [
          { id: 'd1', content: 'FIRST', tags: [], createdAt: '', status: 'active' },
          { id: 'd2', content: 'SECOND', tags: [], createdAt: '', status: 'active' },
        ],
        failures: [], successes: [], patterns: [],
      }
      fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
      fs.writeFileSync(path.join(d, MEMORY_PATH_REL), JSON.stringify(v2, null, 2) + '\n', 'utf-8')
    }

    for (const bad of ['2zzz', '1.5', ' 2', '', '   ', 'abc', '-1']) {
      it(`memoryRemove(${JSON.stringify(bad)}) → 거부 + 삭제 0 + exit 1`, async () => {
        const d = tmp()
        seedTwo(d)
        process.chdir(d)
        await memoryRemove(bad)
        const mem = read(d)
        // 파괴적 부작용 0: 두 항목 모두 보존
        expect(mem.decisions).toHaveLength(2)
        expect(mem.decisions.map((x) => x.content)).toEqual(['FIRST', 'SECOND'])
        expect(process.exitCode).toBe(1)
        process.chdir(origCwd)
        fs.rmSync(d, { recursive: true, force: true })
      })

      it(`memoryArchive(${JSON.stringify(bad)}) → 거부 + 보관 0 + exit 1`, async () => {
        const d = tmp()
        seedTwo(d)
        process.chdir(d)
        await memoryArchive(bad)
        const mem = read(d)
        // 어느 항목도 archived 로 바뀌지 않음
        expect(mem.decisions.every((x) => x.status === 'active')).toBe(true)
        expect(process.exitCode).toBe(1)
        process.chdir(origCwd)
        fs.rmSync(d, { recursive: true, force: true })
      })
    }

    it('정상 정수 인덱스 회귀 — remove("2") 는 두 번째만 삭제', async () => {
      const d = tmp()
      seedTwo(d)
      process.chdir(d)
      await memoryRemove('2')
      const mem = read(d)
      expect(mem.decisions).toHaveLength(1)
      expect(mem.decisions[0].content).toBe('FIRST')
      process.chdir(origCwd)
      fs.rmSync(d, { recursive: true, force: true })
    })

    it('정상 정수 인덱스 회귀 — archive("1") 은 첫 항목만 보관', async () => {
      const d = tmp()
      seedTwo(d)
      process.chdir(d)
      await memoryArchive('1')
      const mem = read(d)
      expect(mem.decisions[0].status).toBe('archived')
      expect(mem.decisions[1].status).toBe('active')
      process.chdir(origCwd)
      fs.rmSync(d, { recursive: true, force: true })
    })
  })

  it('memoryAdd — 잘못된 --type 거부(exit 1), 저장/입력 유실 없음 (#L)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('교훈 유실 방지', { type: 'failrue', lesson: '회귀 가드' })
    expect(process.exitCode).toBe(1)
    expect(fs.existsSync(path.join(d, MEMORY_PATH_REL))).toBe(false) // 저장 안 됨
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryResolve → status resolved + resolvedAt (#2 — 이제 도달 가능)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('해결 대상')
    await memoryResolve('1')
    const mem = read(d)
    expect(mem.decisions[0].status).toBe('resolved')
    expect(mem.decisions[0].resolvedAt).toBeDefined()
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryUnarchive → archived 를 active 로 복구 (오조작 역전)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('보관 후 복구')
    await memoryArchive('1')
    await memoryUnarchive('1')
    const mem = read(d)
    expect(mem.decisions[0].status).toBe('active')
    expect(mem.decisions[0].archivedAt).toBeUndefined()
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('writeMemory — 원자적 쓰기 후 .tmp 잔여물 없음', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('원자성')
    expect(fs.existsSync(path.join(d, MEMORY_PATH_REL + '.tmp'))).toBe(false)
    expect(fs.existsSync(path.join(d, MEMORY_PATH_REL))).toBe(true)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryAdd 첫 add(디스크 v1) — 단일 write: .bak 이 v1 원본 (이중 write 제거 #6)', async () => {
    const d = tmp()
    seedV1(d, [{ content: 'v1 원본' }])
    process.chdir(d)
    await memoryAdd('새 항목')
    // 단일 write 라 직전 상태(.bak)는 v1 원본 배열. 이중 write 였다면 중간 v2 가 됐을 것.
    const bak = JSON.parse(fs.readFileSync(path.join(d, MEMORY_PATH_REL + '.bak'), 'utf-8'))
    expect(Array.isArray(bak)).toBe(true)
    expect(bak[0].content).toBe('v1 원본')
    const mem = read(d)
    expect(mem.schemaVersion).toBe(2)
    expect(mem.decisions.map((x) => x.content)).toEqual(expect.arrayContaining(['v1 원본', '새 항목']))
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryAdd — 손상 memory.json 위 저장 시도 시 중단(exit 1) + 원본 보존 (#1 mutate-path blocker)', async () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    const corrupt = '{ "decisions": [ broken'
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL), corrupt, 'utf-8')
    process.chdir(d)
    await memoryAdd('새 결정') // 손상 파일 위에 빈 v2 로 덮으면 안 됨
    expect(process.exitCode).toBe(1)
    expect(fs.readFileSync(path.join(d, MEMORY_PATH_REL), 'utf-8')).toBe(corrupt)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('memoryArchive — 손상 memory.json 위 status 전이 시도 시 중단(exit 1) + 원본 보존', async () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    const corrupt = '{ broken'
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL), corrupt, 'utf-8')
    process.chdir(d)
    await memoryArchive('1')
    expect(process.exitCode).toBe(1)
    expect(fs.readFileSync(path.join(d, MEMORY_PATH_REL), 'utf-8')).toBe(corrupt)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('recordLesson — 손상 memory.json 이면 null 반환 + 원본 보존 (learn 중단)', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    const corrupt = '{ broken json'
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL), corrupt, 'utf-8')
    expect(recordLesson(d, '교훈', 1)).toBeNull()
    expect(fs.readFileSync(path.join(d, MEMORY_PATH_REL), 'utf-8')).toBe(corrupt)
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

describe('memory v2 — read 경로 마이그레이션 계약 일관성 (어느 명령 먼저든 동일)', () => {
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

  function seedV1Project(d: string): void {
    execFileSync('git', ['init'], { cwd: d, stdio: 'pipe' })
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 't', version: '0.0.0' }), 'utf-8')
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL), JSON.stringify([{ content: 'v1 결정' }]), 'utf-8')
  }
  function assertMigrated(d: string): void {
    const m = JSON.parse(fs.readFileSync(path.join(d, MEMORY_PATH_REL), 'utf-8'))
    expect(m.schemaVersion).toBe(2) // 디스크에 v2 영구화
    expect(fs.existsSync(path.join(d, MEMORY_PATH_REL + '.v1.bak'))).toBe(true) // 원본 보존
  }

  it('memory list 첫 실행 → 디스크 v2 + .v1.bak', async () => {
    const d = tmp()
    seedV1(d, [{ content: 'v1 결정' }])
    process.chdir(d)
    await memoryList()
    assertMigrated(d)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('context 첫 실행 → 디스크 v2 + .v1.bak (memory list 안 거쳐도 동일)', async () => {
    const d = tmp()
    seedV1Project(d)
    process.chdir(d)
    await context()
    assertMigrated(d)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('brief 첫 실행 → 디스크 v2 + .v1.bak', async () => {
    const d = tmp()
    seedV1Project(d)
    process.chdir(d)
    await brief()
    assertMigrated(d)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('이미 v2 → read 가 파일 변경/.v1.bak 생성 안 함 (멱등)', async () => {
    const d = tmp()
    const v2: MemoryFileV2 = { schemaVersion: 2, decisions: [{ id: 'd1', content: 'x', tags: [], createdAt: '', status: 'active' }], failures: [], successes: [], patterns: [] }
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(d, MEMORY_PATH_REL), JSON.stringify(v2, null, 2) + '\n', 'utf-8')
    const before = fs.readFileSync(path.join(d, MEMORY_PATH_REL), 'utf-8')
    process.chdir(d)
    await memoryList()
    expect(fs.readFileSync(path.join(d, MEMORY_PATH_REL), 'utf-8')).toBe(before) // 무변경
    expect(fs.existsSync(path.join(d, MEMORY_PATH_REL + '.v1.bak'))).toBe(false) // .v1.bak 미생성
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
