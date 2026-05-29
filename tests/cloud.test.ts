import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_CLOUD_EXCLUDES,
  collectVhkFiles,
  loadVhkignore,
  readCloudConfig,
  writeCloudConfig,
} from '../src/lib/vhk-cloud.js'
import { parseGistId } from '../src/commands/cloud.js'

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
