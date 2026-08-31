import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { removeDirSync } from '../../src/lib/fs-remove.js'
import {
  isCopyableEnvFile,
  listEnvFiles,
  buildCopyList,
  readWorktreeRoot,
} from '../../src/worktree/configList.js'

describe('isCopyableEnvFile', () => {
  it('.env / .env.local / .env.production 은 복사 대상', () => {
    expect(isCopyableEnvFile('.env')).toBe(true)
    expect(isCopyableEnvFile('.env.local')).toBe(true)
    expect(isCopyableEnvFile('.env.production')).toBe(true)
  })
  it('템플릿(.example/.sample/.template)은 제외 — 이미 git에 있음', () => {
    expect(isCopyableEnvFile('.env.example')).toBe(false)
    expect(isCopyableEnvFile('.env.sample')).toBe(false)
    expect(isCopyableEnvFile('.env.template')).toBe(false)
  })
  it('.env 로 시작 안 하면 제외', () => {
    expect(isCopyableEnvFile('package.json')).toBe(false)
    expect(isCopyableEnvFile('env.txt')).toBe(false)
  })
})

describe('listEnvFiles', () => {
  it('디렉터리 목록에서 복사 대상 env만 추린다', () => {
    const names = ['.env', '.env.local', '.env.example', 'package.json', 'README.md']
    expect(listEnvFiles(names)).toEqual(['.env', '.env.local'])
  })
})

describe('buildCopyList', () => {
  it('env + 추가 설정을 source/target 경로 CopyItem 으로 만든다', () => {
    const items = buildCopyList({
      sourceDir: '/src',
      targetDir: '/tgt',
      envFiles: ['.env', '.env.local'],
      extraConfigs: ['.vscode/settings.json'],
    })
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ kind: 'env' })
    expect(items[0].source).toContain('.env')
    expect(items[0].target).toContain('.env')
    const cfg = items.find((i) => i.kind === 'config')
    expect(cfg?.source).toContain('.vscode')
  })
  it('빈 목록이면 빈 배열', () => {
    expect(buildCopyList({ sourceDir: '/s', targetDir: '/t', envFiles: [], extraConfigs: [] })).toEqual([])
  })
})

describe('readWorktreeRoot', () => {
  it('문자열 worktreeRoot 만 읽고 손상 파일은 null', () => {
    const dir = join(tmpdir(), `vhk-wt-root-${Date.now()}`)
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    try {
      expect(readWorktreeRoot(dir)).toBeNull()
      writeFileSync(join(dir, '.vhk', 'config.json'), '{"worktreeRoot":".worktrees"}', 'utf-8')
      expect(readWorktreeRoot(dir)).toBe('.worktrees')
      writeFileSync(join(dir, '.vhk', 'config.json'), '{', 'utf-8')
      expect(readWorktreeRoot(dir)).toBeNull()
    } finally {
      removeDirSync(dir)
    }
  })
})
