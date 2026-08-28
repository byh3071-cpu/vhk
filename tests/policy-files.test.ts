import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensurePolicyFilesIgnored,
  POLICY_LOCAL_FILES,
  POLICY_LOCAL_TEMP_PATTERNS,
} from '../src/lib/policy-files.js'
import { removeDirSync } from '../src/lib/fs-remove.js'

describe('정책 로컬 파일 Git 자기방어', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vhk-policy-files-'))
    mkdirSync(join(dir, '.vhk'), { recursive: true })
  })
  afterEach(() => removeDirSync(dir))

  it('기존 ignore 내용을 보존하며 정책 상태 파일과 잠금을 한 번씩만 추가한다', () => {
    writeFileSync(join(dir, '.vhk', '.gitignore'), 'memory.json\ncustom-local.txt\n', 'utf-8')
    ensurePolicyFilesIgnored(dir)
    ensurePolicyFilesIgnored(dir)

    const lines = readFileSync(join(dir, '.vhk', '.gitignore'), 'utf-8').split(/\r?\n/)
    expect(lines).toContain('memory.json')
    expect(lines).toContain('custom-local.txt')
    for (const name of [...POLICY_LOCAL_FILES, ...POLICY_LOCAL_TEMP_PATTERNS]) {
      expect(lines.filter((line) => line.trim() === name)).toHaveLength(1)
    }
  })

  it('뒤쪽 negation이 기존 양성 규칙을 무효화하면 마지막에 다시 고정한다', () => {
    writeFileSync(
      join(dir, '.vhk', '.gitignore'),
      'policy.json\nrun-state.json\n!policy.json\n!run-state.json\n',
      'utf-8',
    )

    ensurePolicyFilesIgnored(dir)
    ensurePolicyFilesIgnored(dir)

    const lines = readFileSync(join(dir, '.vhk', '.gitignore'), 'utf-8').split(/\r?\n/)
    expect(lines.lastIndexOf('policy.json')).toBeGreaterThan(lines.lastIndexOf('!policy.json'))
    expect(lines.lastIndexOf('run-state.json')).toBeGreaterThan(lines.lastIndexOf('!run-state.json'))
    expect(lines.filter((line) => line === 'policy.json')).toHaveLength(2)
    expect(lines.filter((line) => line === 'run-state.json')).toHaveLength(2)
  })
})
