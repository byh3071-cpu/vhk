import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CLOUD_EMPTY_PLACEHOLDER,
  CLOUD_EMPTY_PLACEHOLDER_CONTENT,
  DEFAULT_CLOUD_EXCLUDES,
  collectVhkFiles,
  collectVhkFlatEntryNames,
  collectVhkSubdirs,
  gistHeadCleanupSatisfied,
  hasPortableFilenameCollisions,
  isSafeFlatGistFilename,
  loadVhkignore,
  partitionGistFiles,
  planGistHeadCleanup,
  readCloudConfig,
  writeCloudConfig,
} from '../src/lib/vhk-cloud.js'
import { parseGistId } from '../src/commands/cloud.js'
import { removeDirSync, removeFileSync } from '../src/lib/fs-remove.js'

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
  fs.writeFileSync(path.join(vhk, 'policy.json'), '{}\n')
  fs.writeFileSync(path.join(vhk, 'policy-baseline.json'), '{"hash":null}\n')
  fs.writeFileSync(path.join(vhk, '.policy-baseline.json.tmp-123-0'), '{"hash":null}\n')
  fs.writeFileSync(path.join(vhk, 'run-state.json'), '{}\n')
  fs.writeFileSync(path.join(vhk, 'run-state.lock'), '{}\n')
  fs.writeFileSync(path.join(vhk, 'run-state-recovery.lock'), '{}\n')
  fs.writeFileSync(path.join(vhk, '.run-state.json.tmp-123-0'), '{}\n')
  fs.writeFileSync(path.join(vhk, 'HARD_STOP'), '')
  fs.writeFileSync(path.join(vhk, '.gitignore'), 'memory.json\n')
  return dir
}

function tryCreateDirectoryLink(target: string, link: string): boolean {
  try {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
    return true
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      return false
    }
    throw error
  }
}

function tryCreateFileLink(target: string, link: string): boolean {
  try {
    fs.symlinkSync(target, link, 'file')
    return true
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      return false
    }
    throw error
  }
}

describe('vhk-cloud — 기본 제외', () => {
  it('로컬 전용 파일이 기본 제외에 포함된다', () => {
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('memory.json')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('refs.json')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('HARD_STOP')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('cloud.json')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('policy.json')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('policy-baseline.json')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('.policy-baseline.json.tmp-*')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('run-state.json')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('run-state.lock')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('run-state-recovery.lock')
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('.run-state.json.tmp-*')
  })

  it('#248: *.bak 백업본도 기본 제외 (memory.json.bak 누출 차단)', () => {
    expect(DEFAULT_CLOUD_EXCLUDES).toContain('*.bak')
  })

  it('빈 gist 유지용 비민감 마커도 백업·복원 대상에서 제외한다', () => {
    expect(DEFAULT_CLOUD_EXCLUDES).toContain(CLOUD_EMPTY_PLACEHOLDER)
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
    expect(files).not.toContain('policy.json')
    expect(files).not.toContain('policy-baseline.json')
    expect(files).not.toContain('.policy-baseline.json.tmp-123-0')
    expect(files).not.toContain('run-state.json')
    expect(files).not.toContain('run-state.lock')
    expect(files).not.toContain('run-state-recovery.lock')
    expect(files).not.toContain('.run-state.json.tmp-123-0')
  })

  it('.vhkignore 의 추가 제외 패턴을 반영한다', () => {
    fs.writeFileSync(path.join(repo, '.vhkignore'), 'brief.md\n')
    const files = collectVhkFiles(repo, loadVhkignore(repo))
    expect(files).toEqual(['README.md', 'context.md'])
  })

  it('.vhkignore negation으로 하드 제외 정책 파일을 다시 포함할 수 없다', () => {
    fs.writeFileSync(
      path.join(repo, '.vhkignore'),
      '!policy.json\n!.run-state.json.tmp-*\n',
    )
    const files = collectVhkFiles(repo, loadVhkignore(repo))
    expect(files).not.toContain('policy.json')
    expect(files).not.toContain('.run-state.json.tmp-123-0')
  })

  it('.vhk/ 없으면 빈 배열', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-empty-'))
    expect(collectVhkFiles(empty)).toEqual([])
    fs.rmSync(empty, { recursive: true, force: true })
  })

  it('#248: memory.json.bak 등 *.bak 백업본을 수집서 제외(개인정보 누출 차단)', () => {
    fs.writeFileSync(path.join(repo, '.vhk', 'memory.json.bak'), '[]\n')
    fs.writeFileSync(path.join(repo, '.vhk', 'memory.json.v1.bak'), '[]\n')
    const files = collectVhkFiles(repo)
    expect(files).not.toContain('memory.json.bak')
    expect(files).not.toContain('memory.json.v1.bak')
  })

  it('.vhk 자체가 외부 디렉터리 링크면 파일을 수집하지 않고 실패 폐쇄한다', () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-cloud-external-'))
    fs.writeFileSync(path.join(external, 'private.md'), 'do not upload\n', 'utf-8')
    removeDirSync(path.join(repo, '.vhk'))
    try {
      if (!tryCreateDirectoryLink(external, path.join(repo, '.vhk'))) return
      expect(() => collectVhkFiles(repo)).toThrow('local boundary')
    } finally {
      removeDirSync(external)
    }
  })

  it('.vhk 읽기 권한 오류를 빈 백업으로 오인하지 않고 전파한다', () => {
    const denied = Object.assign(new Error('read denied'), { code: 'EACCES' })
    const read = vi.spyOn(fs, 'readdirSync')
    read.mockImplementationOnce((() => { throw denied }) as typeof fs.readdirSync)
    try {
      expect(() => collectVhkFiles(repo)).toThrow(denied)
    } finally {
      read.mockRestore()
    }
  })
})

describe('vhk-cloud — collectVhkSubdirs (하위 폴더 감지, #160)', () => {
  it('.vhk/ 안의 하위 디렉터리 이름만 반환 (파일 제외)', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-sub-'))
    fs.mkdirSync(path.join(repo, '.vhk', 'evolve'), { recursive: true })
    fs.writeFileSync(path.join(repo, '.vhk', 'evolve', 'queue.json'), '[]\n')
    fs.writeFileSync(path.join(repo, '.vhk', 'context.md'), '# ctx\n')
    expect(collectVhkSubdirs(repo)).toEqual(['evolve'])
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('하위 폴더 없으면 빈 배열', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-nosub-'))
    fs.mkdirSync(path.join(repo, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(repo, '.vhk', 'context.md'), '# ctx\n')
    expect(collectVhkSubdirs(repo)).toEqual([])
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('.vhk 읽기 권한 오류를 하위 폴더 없음으로 오인하지 않는다', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-sub-denied-'))
    fs.mkdirSync(path.join(repo, '.vhk'), { recursive: true })
    const denied = Object.assign(new Error('read denied'), { code: 'EACCES' })
    const read = vi.spyOn(fs, 'readdirSync')
    read.mockImplementationOnce((() => { throw denied }) as typeof fs.readdirSync)
    try {
      expect(() => collectVhkSubdirs(repo)).toThrow(denied)
    } finally {
      read.mockRestore()
      removeDirSync(repo)
    }
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
    expect(gi.split(/\r?\n/).some((l) => l.trim() === '.cloud.json.tmp-*')).toBe(true)
  })

  it('기존 .vhk/.gitignore 를 보존하며 cloud.json 만 추가 (중복 안 함)', () => {
    fs.writeFileSync(path.join(repo, '.vhk', '.gitignore'), 'memory.json\nrefs.json\n')
    writeCloudConfig(repo, { gistId: 'x' })
    writeCloudConfig(repo, { gistId: 'y' }) // 두 번째 호출 — idempotent
    const lines = fs.readFileSync(path.join(repo, '.vhk', '.gitignore'), 'utf-8').split(/\r?\n/)
    expect(lines).toContain('memory.json')
    expect(lines).toContain('refs.json')
    expect(lines.filter((l) => l.trim() === 'cloud.json').length).toBe(1)
    expect(lines.filter((l) => l.trim() === '.cloud.json.tmp-*').length).toBe(1)
  })

  it('기존 cloud.json 규칙 뒤 negation이 있으면 마지막에 다시 고정한다', () => {
    fs.writeFileSync(
      path.join(repo, '.vhk', '.gitignore'),
      'cloud.json\n!cloud.json\n',
      'utf-8',
    )
    writeCloudConfig(repo, { gistId: 'safe-pointer' })
    const lines = fs.readFileSync(path.join(repo, '.vhk', '.gitignore'), 'utf-8').split(/\r?\n/)
    expect(lines.lastIndexOf('cloud.json')).toBeGreaterThan(lines.lastIndexOf('!cloud.json'))
  })
})

describe('vhk-cloud — partitionGistFiles (현재 revision 정리 / 복원 스킵)', () => {
  let repo: string
  beforeEach(() => { repo = makeRepo() })
  afterEach(() => { fs.rmSync(repo, { recursive: true, force: true }) })

  it('과거에 올라간 제외 대상은 excluded, 공유 파일은 keep 으로 분리', () => {
    const gistFiles = ['context.md', 'README.md', 'memory.json', 'refs.json', 'policy.json', 'policy-baseline.json', '.policy-baseline.json.tmp-123-0', 'run-state.json', 'run-state.lock', 'run-state-recovery.lock', '.run-state.json.tmp-123-0', 'HARD_STOP', 'cloud.json']
    const { keep, excluded } = partitionGistFiles(gistFiles, loadVhkignore(repo))
    expect(keep.sort()).toEqual(['README.md', 'context.md'])
    expect(excluded.sort()).toEqual(['.policy-baseline.json.tmp-123-0', '.run-state.json.tmp-123-0', 'HARD_STOP', 'cloud.json', 'memory.json', 'policy-baseline.json', 'policy.json', 'refs.json', 'run-state-recovery.lock', 'run-state.json', 'run-state.lock'])
  })

  it('.vhkignore 추가 패턴도 excluded 로 분리 (현재 revision 정리)', () => {
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

describe('vhk-cloud — collectVhkFlatEntryNames', () => {
  it('pull 충돌 검사용으로 평면 파일·링크가 아닌 디렉터리 이름까지 모은다', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-flat-entries-'))
    fs.mkdirSync(path.join(repo, '.vhk', 'folder'), { recursive: true })
    fs.writeFileSync(path.join(repo, '.vhk', 'context.md'), '# ctx\n', 'utf-8')
    expect(collectVhkFlatEntryNames(repo)).toEqual(['context.md', 'folder'])
    removeDirSync(repo)
  })
})

describe('vhk-cloud — 원격 파일명 평면 경계', () => {
  it.each([
    'x\\..\\policy.json',
    'x\\..\\..\\README.md',
    'x/../../README.md',
    'sub\\context.md',
    'C:\\escape.md',
    'name:stream',
    'CON.txt',
    'CONIN$',
    'CONOUT$.txt',
    'COM¹.txt',
    'COM²',
    'LPT³.log',
    'trailing.',
    '\u001bescape.md',
    '\u007fdelete.md',
  ])('안전하지 않은 이름을 거부한다: %s', (name) => {
    expect(isSafeFlatGistFilename(name)).toBe(false)
  })

  it.each(['context.md', '.hidden', '한글-맥락.md'])('평면 파일명은 허용한다: %s', (name) => {
    expect(isSafeFlatGistFilename(name)).toBe(true)
  })

  it('대소문자·유니코드 정규화가 다른 동명 파일을 이식 불가 충돌로 본다', () => {
    expect(hasPortableFilenameCollisions(['A.md', 'a.md'])).toBe(true)
    expect(hasPortableFilenameCollisions(['é.md', 'e\u0301.md'])).toBe(true)
    expect(hasPortableFilenameCollisions(['same.md', 'same.md'])).toBe(false)
    expect(hasPortableFilenameCollisions(['a.md', 'b.md'])).toBe(false)
  })
})

describe('vhk-cloud — 현재 Gist revision 정리 계획', () => {
  let repo: string
  beforeEach(() => { repo = makeRepo() })
  afterEach(() => { removeDirSync(repo) })

  it('공유 파일이 있으면 제외 파일을 지우되 검증된 placeholder는 보존한다', () => {
    const ig = loadVhkignore(repo)
    const plan = planGistHeadCleanup(
      ['context.md', 'policy.json', CLOUD_EMPTY_PLACEHOLDER],
      ig,
      true,
    )
    expect(plan.updates).toEqual({
      'policy.json': null,
    })
  })

  it('제외 파일만 있으면 기존 파일 하나를 carrier로 rename하고 나머지는 삭제한다', () => {
    const ig = loadVhkignore(repo)
    const plan = planGistHeadCleanup(['policy.json', 'run-state.json'], ig)
    const carrier = Object.entries(plan.updates).find(([, update]) => update !== null)
    expect(carrier?.[0]).toBe('policy.json')
    expect(carrier?.[1]).toMatchObject({ filename: CLOUD_EMPTY_PLACEHOLDER })
    expect(plan.updates['run-state.json']).toBeNull()
  })

  it('공유 파일 0개는 placeholder 하나일 때만 postcondition 통과다', () => {
    const ig = loadVhkignore(repo)
    expect(gistHeadCleanupSatisfied([CLOUD_EMPTY_PLACEHOLDER], ig, true)).toBe(true)
    expect(gistHeadCleanupSatisfied([CLOUD_EMPTY_PLACEHOLDER], ig)).toBe(false)
    expect(gistHeadCleanupSatisfied(['policy.json'], ig)).toBe(false)
    expect(gistHeadCleanupSatisfied([], ig)).toBe(false)
  })

  it('동명 파일의 마커 내용이 검증되지 않으면 삭제·덮어쓰기 계획을 만들지 않는다', () => {
    const ig = loadVhkignore(repo)
    const plan = planGistHeadCleanup(
      ['context.md', CLOUD_EMPTY_PLACEHOLDER],
      ig,
    )
    expect(plan.markerConflict).toBe(true)
    expect(plan.updates).toEqual({})
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
interface GhMockOptions {
  patchAppliedButFailsOnce?: boolean
  failListCalls?: number[]
  failRawNames?: string[]
  markerContent?: string
  mutateMarkerBeforePatch?: boolean
  gistPublic?: boolean
  gistVisibilityLookupFails?: boolean
  afterAuth?: () => void
}

function installGhMock(initialGistFiles: string[], options: GhMockOptions = {}) {
  const state = new Set(initialGistFiles)
  const patchBodies: Record<string, unknown>[] = []
  let markerContent = state.has(CLOUD_EMPTY_PLACEHOLDER)
    ? (options.markerContent ?? CLOUD_EMPTY_PLACEHOLDER_CONTENT)
    : undefined
  let listCalls = 0
  let patchCalls = 0
  mockSafeExecFile.mockImplementation((cmd: string, args: string[]) => {
    if (cmd !== 'gh') return { ok: true, out: '' }
    if (args[0] === '--version') return { ok: true, out: 'gh version 2.92.0' }
    if (args[0] === 'auth') {
      options.afterAuth?.()
      return { ok: true, out: 'Logged in' }
    }
    if (args[0] === 'api' && !args.includes('PATCH') && args.includes('--jq')) {
      if (options.gistVisibilityLookupFails) {
        return { ok: false, out: '', err: 'visibility lookup failed' }
      }
      return { ok: true, out: options.gistPublic ? 'true\n' : 'false\n' }
    }
    if (args[0] === 'gist' && args[1] === 'view' && args.includes('--files')) {
      listCalls++
      if (options.failListCalls?.includes(listCalls)) return { ok: false, out: '', err: 'list failed' }
      return { ok: true, out: [...state].join('\n') }
    }
    if (args[0] === 'gist' && args[1] === 'view' && args.includes('-f')) {
      const name = args[args.indexOf('-f') + 1]
      if (options.failRawNames?.includes(name)) {
        return { ok: false, out: '', err: 'raw fetch failed' }
      }
      return {
        ok: true,
        out: name === CLOUD_EMPTY_PLACEHOLDER && markerContent !== undefined
          ? markerContent
          : `content of ${name}\n`,
      }
    }
    if (args[0] === 'gist' && args[1] === 'edit') {
      const ai = args.indexOf('-a')
      if (ai >= 0) { state.add(path.basename(args[ai + 1])); return { ok: true, out: '' } }
      return { ok: true, out: '' } // -f 덮어쓰기
    }
    if (args[0] === 'gist' && args[1] === 'create') {
      return { ok: true, out: 'https://gist.github.com/sample-user/abc123def456\n' }
    }
    // 원자적 purge: gh api --method PATCH /gists/{id} --input <body.json>
    if (args[0] === 'api' && args.includes('PATCH')) {
      patchCalls++
      if (options.mutateMarkerBeforePatch && patchCalls === 1) {
        markerContent = 'concurrent user content\n'
      }
      const ii = args.indexOf('--input')
      if (ii >= 0) {
        const body = JSON.parse(fs.readFileSync(args[ii + 1], 'utf-8')) as {
          files?: Record<string, unknown>
        }
        const updates = body.files ?? {}
        patchBodies.push(updates)
        if (Object.keys(updates).some((name) => !state.has(name))) {
          return { ok: false, out: '', err: '422 key must be current filename' }
        }
        const next = new Set(state)
        let nextMarkerContent = markerContent
        for (const [name, val] of Object.entries(updates)) {
          next.delete(name)
          if (name === CLOUD_EMPTY_PLACEHOLDER) nextMarkerContent = undefined
          if (val !== null) {
            const target = typeof val === 'object'
              && val !== null
              && 'filename' in val
              && typeof val.filename === 'string'
              ? val.filename
              : name
            next.add(target)
            if (target === CLOUD_EMPTY_PLACEHOLDER) {
              nextMarkerContent = typeof val === 'object'
                && val !== null
                && 'content' in val
                && typeof val.content === 'string'
                ? val.content
                : CLOUD_EMPTY_PLACEHOLDER_CONTENT
            }
          }
        }
        if (next.size === 0) return { ok: false, out: '', err: '422 gist needs one file' }
        state.clear()
        for (const name of next) state.add(name)
        markerContent = nextMarkerContent
      }
      if (options.patchAppliedButFailsOnce && patchCalls === 1) {
        return { ok: false, out: '', err: 'timeout after apply' }
      }
      return { ok: true, out: '' }
    }
    return { ok: true, out: '' }
  })
  return Object.assign(state, { patchBodies })
}

describe('cloud — cloudPush 신규 gist 비공개 검증 (gh mock)', () => {
  let repo: string
  let origCwd: string

  beforeEach(() => {
    mockSafeExecFile.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    repo = makeRepo()
    removeFileSync(path.join(repo, '.vhk', 'HARD_STOP'))
    origCwd = process.cwd()
    process.chdir(repo)
  })

  afterEach(() => {
    process.chdir(origCwd)
    removeDirSync(repo)
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it.each([
    ['비공개 여부 조회 실패', { gistVisibilityLookupFails: true }],
    ['공개 Gist 판정', { gistPublic: true }],
  ] as const)('%s면 신규 gist 포인터를 저장하지 않는다', async (_case, options) => {
    installGhMock([], options)
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    expect(process.exitCode).toBe(1)
    expect(mockSafeExecFile.mock.calls.filter((call) => {
      const args = call[1] as string[]
      return args[0] === 'gist' && args[1] === 'create'
    })).toHaveLength(1)
    expect(mockSafeExecFile.mock.calls.filter((call) => {
      const args = call[1] as string[]
      return args[0] === 'api' && args.includes('--jq')
    })).toHaveLength(1)
    expect(fs.existsSync(path.join(repo, '.vhk', 'cloud.json'))).toBe(false)
  })
})

describe('cloud — cloudPush 기존 gist 현재 revision 정리 (gh mock)', () => {
  let repo: string
  let origCwd: string
  beforeEach(() => {
    mockSafeExecFile.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    repo = makeRepo()
    // Goal 39: cloudPush 는 이제 HARD_STOP 가드를 가진다. 정상 push 경로를 테스트하므로
    // makeRepo 가 남긴 트립와이어(.vhk/HARD_STOP, 원래 sync-제외 fixture)를 제거한다.
    fs.rmSync(path.join(repo, '.vhk', 'HARD_STOP'), { force: true })
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
      .filter(c => c[0] === 'gh' && (c[1] as string[]).includes('PATCH'))
    expect(patchCalls).toEqual([])
  })

  it('새 공유 파일이 0개여도 기존 gist의 제외 파일을 지우고 비민감 마커만 남긴다', async () => {
    fs.writeFileSync(path.join(repo, '.vhkignore'), '*.md\n')
    const state = installGhMock(['context.md', 'policy.json', '.run-state.json.tmp-old'])
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    expect([...state]).toEqual([CLOUD_EMPTY_PLACEHOLDER])
    expect(process.exitCode).toBe(0)
  })

  it('PATCH 적용 뒤 응답만 유실돼도 재조회로 성공을 확인하고 낡은 rename body를 재전송하지 않는다', async () => {
    fs.writeFileSync(path.join(repo, '.vhkignore'), '*.md\n')
    const state = installGhMock(
      ['policy.json', 'run-state.json'],
      { patchAppliedButFailsOnce: true },
    )
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    expect([...state]).toEqual([CLOUD_EMPTY_PLACEHOLDER])
    const patchCalls = mockSafeExecFile.mock.calls.filter(
      call => (call[1] as string[])[0] === 'api' && (call[1] as string[]).includes('PATCH'),
    )
    expect(patchCalls).toHaveLength(1)
    expect(process.exitCode).toBe(0)
  })

  it('기존 gist 파일 목록 조회 실패를 빈 목록 성공으로 오인하지 않는다', async () => {
    installGhMock(['policy.json'], { failListCalls: [1] })
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    expect(process.exitCode).toBe(1)
    expect(mockSafeExecFile.mock.calls.some(
      call => (call[1] as string[]).includes('PATCH'),
    )).toBe(false)
  })

  it('동명 placeholder의 내용이 공식 마커와 다르면 어떤 gist 쓰기도 하지 않는다', async () => {
    installGhMock(
      ['context.md', CLOUD_EMPTY_PLACEHOLDER],
      { markerContent: 'legacy user content\n' },
    )
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    expect(process.exitCode).toBe(1)
    expect(mockSafeExecFile.mock.calls.some((call) => {
      const args = call[1] as string[]
      return args.includes('PATCH') || (args[0] === 'gist' && args[1] === 'edit')
    })).toBe(false)
  })

  it('원격 head에 비평면 파일명이 하나라도 있으면 로컬 업로드와 PATCH를 모두 중단한다', async () => {
    installGhMock(['context.md', 'x\\..\\..\\README.md'])
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    expect(process.exitCode).toBe(1)
    expect(mockSafeExecFile.mock.calls.some((call) => {
      const args = call[1] as string[]
      return args.includes('PATCH') || (args[0] === 'gist' && args[1] === 'edit')
    })).toBe(false)
  })

  it('기존 포인터가 공개 Gist면 업로드와 PATCH를 모두 중단한다', async () => {
    installGhMock(['context.md'], { gistPublic: true })
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    expect(process.exitCode).toBe(1)
    expect(mockSafeExecFile.mock.calls.some((call) => {
      const args = call[1] as string[]
      return args.includes('PATCH') || (args[0] === 'gist' && args[1] === 'edit')
    })).toBe(false)
  })

  it('로컬 파일명이 운영체제 사이에서 안전하지 않으면 gh 호출 전에 중단한다', async () => {
    fs.writeFileSync(path.join(repo, '.vhk', ' unsafe.md'), 'unsafe name\n', 'utf-8')
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    expect(process.exitCode).toBe(1)
    expect(mockSafeExecFile).not.toHaveBeenCalled()
  })

  it('로컬 유니코드 정규화 충돌은 새 gist를 만들기 전에 중단한다', async () => {
    fs.writeFileSync(path.join(repo, '.vhk', 'é.md'), 'NFC\n', 'utf-8')
    fs.writeFileSync(path.join(repo, '.vhk', 'e\u0301.md'), 'NFD\n', 'utf-8')
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    expect(process.exitCode).toBe(1)
    expect(mockSafeExecFile).not.toHaveBeenCalled()
  })

  it('원격과 로컬을 합쳤을 때 생기는 대소문자 충돌도 어떤 gist 쓰기 전에 중단한다', async () => {
    fs.writeFileSync(path.join(repo, '.vhk', 'A.md'), 'upper\n', 'utf-8')
    installGhMock(['context.md', 'a.md'])
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    expect(process.exitCode).toBe(1)
    expect(mockSafeExecFile.mock.calls.some((call) => {
      const args = call[1] as string[]
      return args.includes('PATCH') || (args[0] === 'gist' && args[1] === 'edit')
    })).toBe(false)
  })

  it('.vhk가 외부 디렉터리 링크면 외부 파일을 읽거나 gh를 호출하지 않는다', async () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-push-external-'))
    fs.writeFileSync(path.join(external, 'private.md'), 'do not upload\n', 'utf-8')
    removeDirSync(path.join(repo, '.vhk'))
    try {
      if (!tryCreateDirectoryLink(external, path.join(repo, '.vhk'))) return
      const { cloudPush } = await import('../src/commands/cloud.js')

      await cloudPush()

      expect(process.exitCode).toBe(1)
      expect(mockSafeExecFile).not.toHaveBeenCalled()
      expect(fs.readFileSync(path.join(external, 'private.md'), 'utf-8')).toBe('do not upload\n')
    } finally {
      removeDirSync(path.join(repo, '.vhk'))
      removeDirSync(external)
    }
  })

  it('인증 중 수집된 파일이 외부 링크로 바뀌면 기존 gist edit 전에 중단한다', async () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-push-race-edit-'))
    const outside = path.join(external, 'private.md')
    const probe = path.join(repo, '.vhk', 'link-probe')
    fs.writeFileSync(outside, 'do not upload\n', 'utf-8')
    try {
      if (!tryCreateFileLink(outside, probe)) return
      fs.unlinkSync(probe)
      installGhMock(['context.md', 'README.md', 'brief.md'], {
        afterAuth: () => {
          fs.unlinkSync(path.join(repo, '.vhk', 'context.md'))
          if (!tryCreateFileLink(outside, path.join(repo, '.vhk', 'context.md'))) {
            throw new Error('file link capability changed during test')
          }
        },
      })
      const { cloudPush } = await import('../src/commands/cloud.js')

      await cloudPush()

      expect(process.exitCode).toBe(1)
      expect(mockSafeExecFile.mock.calls.some((call) => {
        const args = call[1] as string[]
        return args[0] === 'gist' && (args[1] === 'edit' || args[1] === 'create')
      })).toBe(false)
      expect(fs.readFileSync(outside, 'utf-8')).toBe('do not upload\n')
    } finally {
      removeDirSync(external)
    }
  })

  it('인증 중 수집된 파일이 외부 링크로 바뀌면 새 gist create 전에 중단한다', async () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-push-race-create-'))
    const outside = path.join(external, 'private.md')
    const probe = path.join(repo, '.vhk', 'link-probe')
    fs.writeFileSync(outside, 'do not upload\n', 'utf-8')
    fs.unlinkSync(path.join(repo, '.vhk', 'cloud.json'))
    try {
      if (!tryCreateFileLink(outside, probe)) return
      fs.unlinkSync(probe)
      installGhMock([], {
        afterAuth: () => {
          fs.unlinkSync(path.join(repo, '.vhk', 'README.md'))
          if (!tryCreateFileLink(outside, path.join(repo, '.vhk', 'README.md'))) {
            throw new Error('file link capability changed during test')
          }
        },
      })
      const { cloudPush } = await import('../src/commands/cloud.js')

      await cloudPush()

      expect(process.exitCode).toBe(1)
      expect(mockSafeExecFile.mock.calls.some((call) => {
        const args = call[1] as string[]
        return args[0] === 'gist' && args[1] === 'create'
      })).toBe(false)
      expect(fs.readFileSync(outside, 'utf-8')).toBe('do not upload\n')
    } finally {
      removeDirSync(external)
    }
  })

  it('마커 검증 뒤 동시 편집돼도 PATCH가 그 파일을 삭제하거나 덮어쓰지 않는다', async () => {
    const state = installGhMock(
      ['context.md', 'policy.json', CLOUD_EMPTY_PLACEHOLDER],
      { mutateMarkerBeforePatch: true },
    )
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    expect(state.patchBodies).toHaveLength(1)
    expect(state.patchBodies[0]).not.toHaveProperty(CLOUD_EMPTY_PLACEHOLDER)
    expect(state.has(CLOUD_EMPTY_PLACEHOLDER)).toBe(true)
    expect(process.exitCode).toBe(1)
  })

  it('PATCH 뒤 검증 조회가 실패하면 head 정리를 성공으로 보고하지 않는다', async () => {
    fs.writeFileSync(path.join(repo, '.vhkignore'), '*.md\n')
    const state = installGhMock(
      ['policy.json', 'run-state.json'],
      { failListCalls: [3] },
    )
    const { cloudPush } = await import('../src/commands/cloud.js')

    await cloudPush()

    // 서버 적용 여부와 무관하게 검증을 못 했으므로 명령은 실패 폐쇄한다.
    expect([...state]).toEqual([CLOUD_EMPTY_PLACEHOLDER])
    expect(process.exitCode).toBe(1)
  })

  it('HARD_STOP 활성 → cloudPush 가 gh 를 전혀 호출하지 않는다 (Goal 39)', async () => {
    // 가드는 함수 첫 줄(ensureGhReady·collect 전) → safeExecFile 호출 0.
    fs.writeFileSync(path.join(repo, '.vhk', 'HARD_STOP'), '2026-06-07T00:00:00Z\nauto: test\n')
    const { cloudPush } = await import('../src/commands/cloud.js')
    await cloudPush()
    expect(mockSafeExecFile).not.toHaveBeenCalled()
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

  it('옵션처럼 해석될 수 있는 gist id는 gh 호출 전에 거부한다', async () => {
    const { cloudPull } = await import('../src/commands/cloud.js')

    await cloudPull('--web')

    expect(process.exitCode).toBe(1)
    expect(mockSafeExecFile).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(repo, '.vhk'))).toBe(false)
  })

  it('gist 에 제외 파일이 있어도 fetch/복원하지 않는다', async () => {
    installGhMock(['context.md', 'memory.json', 'refs.json', CLOUD_EMPTY_PLACEHOLDER])
    const { cloudPull } = await import('../src/commands/cloud.js')
    await cloudPull('abc123')

    // 제외 파일은 -f --raw fetch 시도조차 없어야 한다
    const fetched = mockSafeExecFile.mock.calls
      .filter(c => (c[1] as string[]).includes('-f') && (c[1] as string[]).includes('--raw'))
      .map(c => { const a = c[1] as string[]; return a[a.indexOf('-f') + 1] })
    expect(fetched).toEqual([CLOUD_EMPTY_PLACEHOLDER, 'context.md'])
    // 디스크에도 공유 파일만 복원
    expect(fs.existsSync(path.join(repo, '.vhk', 'context.md'))).toBe(true)
    expect(fs.existsSync(path.join(repo, '.vhk', 'memory.json'))).toBe(false)
    expect(fs.existsSync(path.join(repo, '.vhk', 'refs.json'))).toBe(false)
  })

  it('placeholder-only gist는 파일을 복원하지 않고 cloud 연결 포인터만 보존한다', async () => {
    installGhMock([CLOUD_EMPTY_PLACEHOLDER])
    const { cloudPull } = await import('../src/commands/cloud.js')

    await cloudPull('abc123')

    const fetched = mockSafeExecFile.mock.calls.filter(
      call => (call[1] as string[]).includes('-f') && (call[1] as string[]).includes('--raw'),
    )
    expect(fetched.map((call) => {
      const args = call[1] as string[]
      return args[args.indexOf('-f') + 1]
    })).toEqual([CLOUD_EMPTY_PLACEHOLDER])
    expect(readCloudConfig(repo)).toEqual({ gistId: 'abc123' })
    expect(fs.existsSync(path.join(repo, '.vhk', CLOUD_EMPTY_PLACEHOLDER))).toBe(false)
  })

  it('동명 placeholder가 공식 마커 내용이 아니면 복원과 포인터 저장을 모두 중단한다', async () => {
    installGhMock(
      ['context.md', CLOUD_EMPTY_PLACEHOLDER],
      { markerContent: 'legacy user content\n' },
    )
    const { cloudPull } = await import('../src/commands/cloud.js')

    await cloudPull('abc123')

    expect(process.exitCode).toBe(1)
    expect(fs.existsSync(path.join(repo, '.vhk', 'context.md'))).toBe(false)
    expect(readCloudConfig(repo)).toBeNull()
  })

  it.each([
    'x\\..\\policy.json',
    'x\\..\\..\\README.md',
    'x/../../README.md',
    'sub\\context.md',
    'C:\\escape.md',
  ])('비평면 원격 이름이 있으면 fetch·포인터·파일 쓰기 전에 전체 복원을 중단한다: %s', async (unsafeName) => {
    installGhMock(['context.md', unsafeName])
    const { cloudPull } = await import('../src/commands/cloud.js')

    await cloudPull('abc123')

    const rawFetches = mockSafeExecFile.mock.calls.filter(
      call => (call[1] as string[]).includes('-f') && (call[1] as string[]).includes('--raw'),
    )
    expect(rawFetches).toEqual([])
    expect(process.exitCode).toBe(1)
    expect(readCloudConfig(repo)).toBeNull()
    expect(fs.existsSync(path.join(repo, '.vhk'))).toBe(false)
    expect(fs.existsSync(path.join(repo, 'README.md'))).toBe(false)
  })

  it('원격 파일 하나라도 가져오지 못하면 어떤 파일·포인터도 쓰지 않고 실패한다', async () => {
    installGhMock(
      ['context.md', 'README.md'],
      { failRawNames: ['README.md'] },
    )
    const { cloudPull } = await import('../src/commands/cloud.js')

    await cloudPull('abc123')

    expect(process.exitCode).toBe(1)
    expect(fs.existsSync(path.join(repo, '.vhk'))).toBe(false)
    expect(readCloudConfig(repo)).toBeNull()
  })

  it('.vhk가 외부 디렉터리 링크면 네트워크와 외부 파일 쓰기를 모두 중단한다', async () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-pull-dir-link-'))
    fs.writeFileSync(path.join(external, 'context.md'), 'KEEP\n', 'utf-8')
    try {
      if (!tryCreateDirectoryLink(external, path.join(repo, '.vhk'))) return
      const { cloudPull } = await import('../src/commands/cloud.js')

      await cloudPull('abc123')

      expect(process.exitCode).toBe(1)
      expect(mockSafeExecFile).not.toHaveBeenCalled()
      expect(fs.readFileSync(path.join(external, 'context.md'), 'utf-8')).toBe('KEEP\n')
    } finally {
      removeDirSync(path.join(repo, '.vhk'))
      removeDirSync(external)
    }
  })

  it('기존 복원 대상이 파일 링크면 raw fetch와 링크 대상 덮어쓰기를 중단한다', async () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-pull-file-link-'))
    const outside = path.join(external, 'README.md')
    fs.writeFileSync(outside, 'KEEP\n', 'utf-8')
    fs.mkdirSync(path.join(repo, '.vhk'), { recursive: true })
    try {
      if (!tryCreateFileLink(outside, path.join(repo, '.vhk', 'context.md'))) return
      installGhMock(['context.md'])
      const { cloudPull } = await import('../src/commands/cloud.js')

      await cloudPull('abc123')

      const rawFetches = mockSafeExecFile.mock.calls.filter(
        call => (call[1] as string[]).includes('--raw'),
      )
      expect(rawFetches).toEqual([])
      expect(process.exitCode).toBe(1)
      expect(fs.readFileSync(outside, 'utf-8')).toBe('KEEP\n')
      expect(readCloudConfig(repo)).toBeNull()
    } finally {
      removeDirSync(external)
    }
  })

  it('cloud.json이 외부 파일 링크면 포인터 저장 전에 중단한다', async () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-pull-config-link-'))
    const outside = path.join(external, 'outside.json')
    fs.writeFileSync(outside, '{"keep":true}\n', 'utf-8')
    fs.mkdirSync(path.join(repo, '.vhk'), { recursive: true })
    try {
      if (!tryCreateFileLink(outside, path.join(repo, '.vhk', 'cloud.json'))) return
      const { cloudPull } = await import('../src/commands/cloud.js')

      await cloudPull('abc123')

      expect(process.exitCode).toBe(1)
      expect(mockSafeExecFile).not.toHaveBeenCalled()
      expect(fs.readFileSync(outside, 'utf-8')).toBe('{"keep":true}\n')
    } finally {
      removeDirSync(external)
    }
  })

  it('공개 Gist는 파일을 가져오거나 로컬 포인터로 저장하지 않는다', async () => {
    installGhMock(['context.md'], { gistPublic: true })
    const { cloudPull } = await import('../src/commands/cloud.js')

    await cloudPull('abc123')

    expect(process.exitCode).toBe(1)
    expect(mockSafeExecFile.mock.calls.some(
      call => (call[1] as string[]).includes('--raw'),
    )).toBe(false)
    expect(fs.existsSync(path.join(repo, '.vhk'))).toBe(false)
    expect(readCloudConfig(repo)).toBeNull()
  })

  it.each([
    ['context.md', 'CONTEXT.md'],
    ['é.md', 'e\u0301.md'],
  ])('기존 로컬 이름 %s와 원격 이름 %s가 이식 불가 충돌이면 fetch 전에 중단한다', async (localName, remoteName) => {
    fs.mkdirSync(path.join(repo, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(repo, '.vhk', localName), 'KEEP\n', 'utf-8')
    installGhMock([remoteName])
    const { cloudPull } = await import('../src/commands/cloud.js')

    await cloudPull('abc123')

    expect(process.exitCode).toBe(1)
    expect(mockSafeExecFile.mock.calls.some(
      call => (call[1] as string[]).includes('--raw'),
    )).toBe(false)
    expect(fs.readFileSync(path.join(repo, '.vhk', localName), 'utf-8')).toBe('KEEP\n')
    expect(readCloudConfig(repo)).toBeNull()
  })
})
