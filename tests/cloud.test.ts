import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_CLOUD_EXCLUDES,
  collectVhkFiles,
  loadVhkignore,
  partitionGistFiles,
  readCloudConfig,
  writeCloudConfig,
} from '../src/lib/vhk-cloud.js'
import { parseGistId } from '../src/commands/cloud.js'

// gh 호출 가로채기 — cloud E2E 에서 실제 gh CLI 없이 push/pull 와이어링 검증.
const mockSafeExecFile = vi.fn()
vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: (...a: unknown[]) => mockSafeExecFile(...a),
  NETWORK_EXEC_TIMEOUT_MS: 30_000,
  DEFAULT_EXEC_TIMEOUT_MS: 600_000,
}))

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-cloud-'))
  const vhk = path.join(dir, '.vhk')
  fs.mkdirSync(vhk, { recursive: true })
  fs.writeFileSync(path.join(vhk, 'context.md'), '# ctx\n')
  fs.writeFileSync(path.join(vhk, 'README.md'), '# readme\n')
  fs.writeFileSync(path.join(vhk, 'brief.md'), '# brief\n')
  fs.writeFileSync(path.join(vhk, 'memory.json'), '[]\n')
  fs.writeFileSync(path.join(vhk, 'refs.json'), '[]\n')
  fs.writeFileSync(path.join(vhk, 'HARD_STOP'), '')
  fs.writeFileSync(path.join(vhk, '.gitignore'), 'memory.json\n')
  return dir
}

describe('vhk-cloud — 기본 제외', () => {
  it('로컬 전용 파일이 기본 제외에 포함된다', () => {
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('memory.json')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('refs.json')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('HARD_STOP')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('cloud.json')
  })
})

describe('vhk-cloud — collectVhkFiles', () => {
  let repo: string
  beforeEach(() => { repo = makeRepo() })
  afterEach(() => { fs.rmSync(repo, { recursive: true, force: true }) })

  it('공유 파일만 수집하고 로컬 전용은 제외한다', () => {
    const files = collectVhkFiles(repo)
    expect(files).toEqual(['README.md', 'brief.md', 'context.md'])
    expect(files).not.toContain('memory.json')
    expect(files).not.toContain('refs.json')
    expect(files).not.toContain('HARD_STOP')
    expect(files).not.toContain('.gitignore')
  })

  it('.vhkignore 의 추가 제외 패턴을 반영한다', () => {
    fs.writeFileSync(path.join(repo, '.vhkignore'), 'brief.md\n')
    const files = collectVhkFiles(repo, loadVhkignore(repo))
    expect(files).toEqual(['README.md', 'context.md'])
  })

  it('.vhk/ 없으면 빈 배열', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-empty-'))
    expect(collectVhkFiles(empty)).toEqual([])
    fs.rmSync(empty, { recursive: true, force: true })
  })
})

describe('vhk-cloud — cloud.json 읽기/쓰기', () => {
  let repo: string
  beforeEach(() => { repo = makeRepo() })
  afterEach(() => { fs.rmSync(repo, { recursive: true, force: true }) })

  it('쓴 뒤 그대로 읽힌다', () => {
    writeCloudConfig(repo, { gistId: 'abc123def456' })
    expect(readCloudConfig(repo)).toEqual({ gistId: 'abc123def456' })
  })

  it('없으면 null', () => {
    expect(readCloudConfig(repo)).toBeNull()
  })

  it('깨진 JSON 이면 null (관대한 읽기)', () => {
    fs.writeFileSync(path.join(repo, '.vhk', 'cloud.json'), '{ broken')
    expect(readCloudConfig(repo)).toBeNull()
  })

  // VHK-022: cloud.json(secret gist 포인터)이 추적되지 않게 .vhk/.gitignore 보장.
  it('writeCloudConfig 가 .vhk/.gitignore 에 cloud.json 을 추가한다', () => {
    writeCloudConfig(repo, { gistId: 'abc123def456' })
    const gi = fs.readFileSync(path.join(repo, '.vhk', '.gitignore'), 'utf-8')
    expect(gi.split(/\r?\n/).some((l) => l.trim() === 'cloud.json')).toBe(true)
  })

  it('기존 .vhk/.gitignore 를 보존하며 cloud.json 만 추가 (중복 안 함)', () => {
    fs.writeFileSync(path.join(repo, '.vhk', '.gitignore'), 'memory.json\nrefs.json\n')
    writeCloudConfig(repo, { gistId: 'x' })
    writeCloudConfig(repo, { gistId: 'y' }) // 두 번째 호출 — idempotent
    const lines = fs.readFileSync(path.join(repo, '.vhk', '.gitignore'), 'utf-8').split(/\r?\n/)
    expect(lines).toContain('memory.json')
    expect(lines).toContain('refs.json')
    expect(lines.filter((l) => l.trim() === 'cloud.json').length).toBe(1)
  })
})

describe('vhk-cloud — partitionGistFiles (privacy purge / 복원 스킵)', () => {
  let repo: string
  beforeEach(() => { repo = makeRepo() })
  afterEach(() => { fs.rmSync(repo, { recursive: true, force: true }) })

  it('과거에 올라간 제외 대상은 excluded, 공유 파일은 keep 으로 분리', () => {
    const gistFiles = ['context.md', 'README.md', 'memory.json', 'refs.json', 'HARD_STOP', 'cloud.json']
    const { keep, excluded } = partitionGistFiles(gistFiles, loadVhkignore(repo))
    expect(keep.sort()).toEqual(['README.md', 'context.md'])
    expect(excluded.sort()).toEqual(['HARD_STOP', 'cloud.json', 'memory.json', 'refs.json'])
  })

  it('.vhkignore 추가 패턴도 excluded 로 분리 (retroactive purge)', () => {
    fs.writeFileSync(path.join(repo, '.vhkignore'), 'secret.md\n')
    const gistFiles = ['context.md', 'secret.md', 'memory.json']
    const { keep, excluded } = partitionGistFiles(gistFiles, loadVhkignore(repo))
    expect(keep).toEqual(['context.md'])
    expect(excluded.sort()).toEqual(['memory.json', 'secret.md'])
  })

  it('제외 대상이 없으면 excluded 는 빈 배열', () => {
    const { keep, excluded } = partitionGistFiles(['context.md', 'README.md'], loadVhkignore(repo))
    expect(keep.sort()).toEqual(['README.md', 'context.md'])
    expect(excluded).toEqual([])
  })

  it('빈 문자열 항목은 무시', () => {
    const { keep, excluded } = partitionGistFiles(['context.md', ''], loadVhkignore(repo))
    expect(keep).toEqual(['context.md'])
    expect(excluded).toEqual([])
  })

  it('백업 대상(keep)과 제외 대상(excluded)은 서로소 — push 후 gist 마지막 파일 보존 보장', () => {
    const gistFiles = ['context.md', 'memory.json']
    const { keep, excluded } = partitionGistFiles(gistFiles, loadVhkignore(repo))
    const intersection = keep.filter(n => excluded.includes(n))
    expect(intersection).toEqual([])
  })
})

describe('cloud — parseGistId', () => {
  it('gist URL 에서 id 추출', () => {
    expect(parseGistId('https://gist.github.com/byh3071-cpu/abc123def456789')).toBe('abc123def456789')
  })

  it('순수 id 출력도 인식', () => {
    expect(parseGistId('abc123def456')).toBe('abc123def456')
  })

  it('id 없으면 null', () => {
    expect(parseGistId('error: not found')).toBeNull()
  })
})

// gh CLI 를 stateful 하게 흉내내는 mock. gist 파일 목록을 Set 으로 들고
// -r(remove)/-a(add) 에 따라 갱신 → push 의 purge + 재검증 경로를 사실적으로 검증.
function installGhMock(initialGistFiles: string[]) {
  const state = new Set(initialGistFiles)
  mockSafeExecFile.mockImplementation((cmd: string, args: string[]) => {
    if (cmd !== 'gh') return { ok: true, out: '' }
    if (args[0] === '--version') return { ok: true, out: 'gh version 2.92.0' }
    if (args[0] === 'auth') return { ok: true, out: 'Logged in' }
    if (args[0] === 'gist' && args[1] === 'view' && args.includes('--files')) {
      return { ok: true, out: [...state].join('\n') }
    }
    if (args[0] === 'gist' && args[1] === 'view' && args.includes('-f')) {
      const name = args[args.indexOf('-f') + 1]
      return { ok: true, out: `content of ${name}\n` }
    }
    if (args[0] === 'gist' && args[1] === 'edit') {
      const ai = args.indexOf('-a')
      if (ai >= 0) { state.add(path.basename(args[ai + 1])); return { ok: true, out: '' } }
      return { ok: true, out: '' } // -f 덮어쓰기
    }
    // 원자적 purge: gh api --method PATCH /gists/{id} --input <body.json>
    if (args[0] === 'api' && args.includes('PATCH')) {
      const ii = args.indexOf('--input')
      if (ii >= 0) {
        const body = JSON.parse(fs.readFileSync(args[ii + 1], 'utf-8')) as {
          files?: Record<string, unknown>
        }
        for (const [name, val] of Object.entries(body.files ?? {})) {
          if (val === null) state.delete(name)
        }
      }
      return { ok: true, out: '' }
    }
    return { ok: true, out: '' }
  })
  return state
}

describe('cloud — cloudPush 기존 gist privacy purge (gh mock)', () => {
  let repo: string
  let origCwd: string
  beforeEach(() => {
    mockSafeExecFile.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    repo = makeRepo()
    fs.writeFileSync(path.join(repo, '.vhk', 'cloud.json'), JSON.stringify({ gistId: 'abc123' }) + '\n')
    origCwd = process.cwd()
    process.chdir(repo)
  })
  afterEach(() => {
    process.chdir(origCwd) // rmSync 전에 chdir 복귀 (Windows EPERM 회피)
    fs.rmSync(repo, { recursive: true, force: true })
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it('과거 누수 제외 파일(memory.json·refs.json)을 단일 gh api PATCH 로 원자적 제거', async () => {
    const state = installGhMock(['context.md', 'README.md', 'brief.md', 'memory.json', 'refs.json'])
    const { cloudPush } = await import('../src/commands/cloud.js')
    await cloudPush()

    // purge 는 PATCH /gists/{id} 단일 호출 (파일당 -r 루프 아님)
    const patchCalls = mockSafeExecFile.mock.calls.filter(
      c => c[0] === 'gh' && (c[1] as string[])[0] === 'api' && (c[1] as string[]).includes('PATCH')
    )
    expect(patchCalls.length).toBe(1)
    // -r flag 는 더 이상 사용하지 않는다 (flag 의존 제거)
    const rFlag = mockSafeExecFile.mock.calls.filter(c => (c[1] as string[]).includes('-r'))
    expect(rFlag).toEqual([])
    // 최종 gist 상태에 제외 파일이 남지 않는다
    expect(state.has('memory.json')).toBe(false)
    expect(state.has('refs.json')).toBe(false)
    expect(state.has('context.md')).toBe(true)
  })

  it('제외 파일이 gist 에 없으면 purge(PATCH)를 호출하지 않는다', async () => {
    installGhMock(['context.md', 'README.md', 'brief.md'])
    const { cloudPush } = await import('../src/commands/cloud.js')
    await cloudPush()
    const patchCalls = mockSafeExecFile.mock.calls
      .filter(c => c[0] === 'gh' && (c[1] as string[])[0] === 'api')
    expect(patchCalls).toEqual([])
  })
})

describe('cloud — cloudPull 제외 복원 스킵 (gh mock)', () => {
  let repo: string
  let origCwd: string
  beforeEach(() => {
    mockSafeExecFile.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-pull-'))
    origCwd = process.cwd()
    process.chdir(repo)
  })
  afterEach(() => {
    process.chdir(origCwd)
    fs.rmSync(repo, { recursive: true, force: true })
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it('gist 에 제외 파일이 있어도 fetch/복원하지 않는다', async () => {
    installGhMock(['context.md', 'memory.json', 'refs.json'])
    const { cloudPull } = await import('../src/commands/cloud.js')
    await cloudPull('abc123')

    // 제외 파일은 -f --raw fetch 시도조차 없어야 한다
    const fetched = mockSafeExecFile.mock.calls
      .filter(c => (c[1] as string[]).includes('-f') && (c[1] as string[]).includes('--raw'))
      .map(c => { const a = c[1] as string[]; return a[a.indexOf('-f') + 1] })
    expect(fetched).toEqual(['context.md'])
    // 디스크에도 공유 파일만 복원
    expect(fs.existsSync(path.join(repo, '.vhk', 'context.md'))).toBe(true)
    expect(fs.existsSync(path.join(repo, '.vhk', 'memory.json'))).toBe(false)
    expect(fs.existsSync(path.join(repo, '.vhk', 'refs.json'))).toBe(false)
  })
})
