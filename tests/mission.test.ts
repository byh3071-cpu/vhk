import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { simpleGit } from 'simple-git'
import {
  globToRegExp,
  checkMission,
  readMission,
  missionSet,
  missionShow,
  missionCheck,
  MISSION_PATH_REL,
  MISSION_DISCLAIMER,
  type Mission,
} from '../src/commands/mission.js'

function mission(scope: string[], forbidden: string[]): Mission {
  return { schemaVersion: 1, objective: 'o', scope, forbidden, createdAt: '', updatedAt: '' }
}

describe('mission — globToRegExp', () => {
  it('`src/**` 는 src 하위 전체', () => {
    expect(globToRegExp('src/**').test('src/a.ts')).toBe(true)
    expect(globToRegExp('src/**').test('src/x/y/a.ts')).toBe(true)
    expect(globToRegExp('src/**').test('lib/a.ts')).toBe(false)
  })
  it('`**/*.ts` 는 모든 깊이의 .ts', () => {
    const re = globToRegExp('**/*.ts')
    expect(re.test('a.ts')).toBe(true)
    expect(re.test('src/x/a.ts')).toBe(true)
    expect(re.test('a.js')).toBe(false)
  })
  it('`*.md` 는 루트 세그먼트만 (디렉터리 안 넘음)', () => {
    expect(globToRegExp('*.md').test('README.md')).toBe(true)
    expect(globToRegExp('*.md').test('docs/x.md')).toBe(false)
  })
})

describe('mission — checkMission (순수)', () => {
  it('forbidden 매칭 → 위반 (회귀 가드)', () => {
    const r = checkMission(['src/secret.ts', 'src/a.ts'], mission([], ['**/secret*']))
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0].file).toBe('src/secret.ts')
  })
  it('scope 밖 변경 → 경고', () => {
    const r = checkMission(['docs/x.md'], mission(['src/**'], []))
    expect(r.warnings).toHaveLength(1)
    expect(r.violations).toHaveLength(0)
  })
  it('scope 안 변경 → 경고 0', () => {
    expect(checkMission(['src/a.ts'], mission(['src/**'], [])).warnings).toHaveLength(0)
  })
  it('scope 비면 경고 안 함 (모두 허용)', () => {
    expect(checkMission(['anything/x.js'], mission([], [])).warnings).toHaveLength(0)
  })
  it('forbidden 우선 (scope 안이어도 forbidden 이면 위반)', () => {
    const r = checkMission(['src/.env'], mission(['src/**'], ['**/.env']))
    expect(r.violations).toHaveLength(1)
    expect(r.warnings).toHaveLength(0)
  })
  it('disclaimer 항상 존재 ("보장 아님" + 경로 glob 한계)', () => {
    expect(checkMission([], mission([], [])).disclaimer).toBe(MISSION_DISCLAIMER)
    expect(MISSION_DISCLAIMER).toMatch(/경로 glob|의미/)
  })
})

describe('mission — readMission BOM-safe', () => {
  it('BOM 붙은 mission.json 도 읽음', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mission-'))
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    const m = mission(['src/**'], ['**/.env'])
    fs.writeFileSync(path.join(d, MISSION_PATH_REL), '﻿' + JSON.stringify(m), 'utf-8')
    const read = readMission(d)
    expect(read?.objective).toBe('o')
    expect(read?.forbidden).toEqual(['**/.env'])
    fs.rmSync(d, { recursive: true, force: true })
  })
  it('없으면 null', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mission-'))
    expect(readMission(d)).toBeNull()
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('mission — 커맨드 통합', () => {
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

  it('mission set → mission.json 생성 (별도 네임스페이스, latest.json 불변)', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mission-'))
    process.chdir(d)
    await missionSet({ objective: 'auth 리팩터', scope: ['src/auth/**'], forbidden: ['**/*.env'], yes: true })
    const m = JSON.parse(fs.readFileSync(path.join(d, MISSION_PATH_REL), 'utf-8'))
    expect(m.schemaVersion).toBe(1)
    expect(m.objective).toBe('auth 리팩터')
    expect(m.forbidden).toEqual(['**/*.env'])
    expect(fs.existsSync(path.join(d, '.vhk', 'reports', 'latest.json'))).toBe(false) // verify 증거 안 만듦
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('mission (계약 없음) → 안내 + exit 1', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mission-'))
    process.chdir(d)
    await missionShow()
    expect(process.exitCode).toBe(1)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('mission check → forbidden 변경 시 위반 + exit 1', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mission-'))
    await simpleGit(d).init()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(d, MISSION_PATH_REL), JSON.stringify(mission(['src/**'], ['**/*.env'])), 'utf-8')
    fs.writeFileSync(path.join(d, 'secret.env'), 'TOKEN=x', 'utf-8') // forbidden glob 매칭 (untracked)
    process.chdir(d)
    await missionCheck()
    expect(process.exitCode).toBe(1)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('mission check → 계약 안 변경이면 exit 0', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mission-'))
    await simpleGit(d).init()
    fs.mkdirSync(path.join(d, 'src'), { recursive: true })
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(d, MISSION_PATH_REL), JSON.stringify(mission(['src/**', '.vhk/**'], ['**/*.env'])), 'utf-8')
    fs.writeFileSync(path.join(d, 'src', 'a.ts'), 'export const a = 1\n', 'utf-8')
    process.chdir(d)
    await missionCheck()
    expect(process.exitCode).toBe(0)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
