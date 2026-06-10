import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { nextTsNumber, createTroubleshootingFile } from '../src/lib/troubleshooting.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-ts-'))
}

describe('nextTsNumber', () => {
  it('폴더 없거나 비면 1', () => {
    const dir = tmp()
    expect(nextTsNumber(path.join(dir, 'nope'))).toBe(1)
    expect(nextTsNumber(dir)).toBe(1)
    fs.rmSync(dir, { recursive: true })
  })

  it('기존 TS-001·TS-003 있으면 max+1 = 4 (날짜형 파일은 무시)', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'TS-001-foo.md'), '')
    fs.writeFileSync(path.join(dir, 'TS-003-bar.md'), '')
    fs.writeFileSync(path.join(dir, '2026-06-10-baz.md'), '') // 구 날짜형 — 카운트 안 됨
    expect(nextTsNumber(dir)).toBe(4)
    fs.rmSync(dir, { recursive: true })
  })
})

describe('createTroubleshootingFile', () => {
  it('docs/troubleshooting 에 TS-NNN 파일 생성 + frontmatter id + 본문', () => {
    const cwd = tmp()
    const filePath = createTroubleshootingFile(
      cwd,
      '콜드스타트 느림',
      'inquirer eager import',
      'lazy import 로 전환',
      [{ hash: 'abc1234def', message: 'fix: lazy load' }],
    )

    expect(fs.existsSync(filePath)).toBe(true)
    expect(filePath).toMatch(/docs[/\\]troubleshooting[/\\]TS-\d{3}-/)

    const body = fs.readFileSync(filePath, 'utf-8')
    expect(body).toContain('id: TS-001')
    expect(body).toContain('콜드스타트 느림')
    expect(body).toContain('inquirer eager import')
    expect(body).toContain('lazy import 로 전환')
    expect(body).toContain('abc1234') // 커밋 short hash

    fs.rmSync(cwd, { recursive: true })
  })

  it('두 번째 호출은 TS-002 로 증가', () => {
    const cwd = tmp()
    createTroubleshootingFile(cwd, '문제1', 'c', 's', [])
    const second = createTroubleshootingFile(cwd, '문제2', 'c', 's', [])
    expect(second).toMatch(/TS-002-/)
    fs.rmSync(cwd, { recursive: true })
  })
})
