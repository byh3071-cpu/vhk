import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shouldShow, readDailyShown, recordDailyShown } from '../../src/daily/shown-state.js'

// Goal 32 Phase 3 — 하루 1회 자동 브리핑 상태(KST 자정 기준).
// shouldShow 는 순수(IO 0). read/record 는 주입형 경로로 실파일 테스트(mock 0).

describe('shouldShow — KST 자정 기준 하루 1회', () => {
  it('이전에 안 봤으면(null) 보여준다', () => {
    expect(shouldShow(null, '2026-06-08')).toBe(true)
  })
  it('오늘 이미 봤으면 안 보여준다', () => {
    expect(shouldShow('2026-06-08', '2026-06-08')).toBe(false)
  })
  it('다른 날(어제) 봤으면 보여준다 — 자정 넘어가면 자동 stale', () => {
    expect(shouldShow('2026-06-07', '2026-06-08')).toBe(true)
  })
})

describe('readDailyShown / recordDailyShown — ~/.vhk/daily-shown.json (주입형 경로)', () => {
  const dirs: string[] = []
  function tmpFile(): string {
    const d = mkdtempSync(join(tmpdir(), 'vhk-shown-'))
    dirs.push(d)
    return join(d, 'daily-shown.json')
  }
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('파일 없으면 빈 객체 폴백', () => {
    expect(readDailyShown(tmpFile())).toEqual({})
  })

  it('record 후 read 로 standup 날짜 복원', () => {
    const f = tmpFile()
    recordDailyShown('standup', '2026-06-08', f)
    expect(readDailyShown(f).standup).toBe('2026-06-08')
  })

  it('record 가 디렉터리 없어도 생성한다 (mkdir recursive)', () => {
    const d = mkdtempSync(join(tmpdir(), 'vhk-shown-'))
    dirs.push(d)
    const f = join(d, 'nested', 'daily-shown.json') // nested 디렉터리 미존재
    recordDailyShown('standup', '2026-06-08', f)
    expect(existsSync(f)).toBe(true)
  })

  it('다른 키(today)를 보존하며 standup 만 갱신', () => {
    const f = tmpFile()
    recordDailyShown('today', '2026-06-01', f)
    recordDailyShown('standup', '2026-06-08', f)
    const s = readDailyShown(f)
    expect(s.standup).toBe('2026-06-08')
    expect(s.today).toBe('2026-06-01')
  })

  it('손상 JSON 이면 빈 객체 폴백 (throw 안 함)', () => {
    const f = tmpFile()
    writeFileSync(f, '{ broken json', 'utf-8')
    expect(readDailyShown(f)).toEqual({})
  })
})
