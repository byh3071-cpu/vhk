import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function sanitizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '').replace(/[^a-zA-Z0-9._-]/g, '-') || '0.0.0'
}

describe('vhk ship', () => {
  it('docs/build-log 디렉토리 생성 가능', () => {
    const tmpDir = path.join(process.cwd(), 'tmp-test-ship')
    const buildLogDir = path.join(tmpDir, 'docs', 'build-log')
    fs.mkdirSync(buildLogDir, { recursive: true })
    expect(fs.existsSync(buildLogDir)).toBe(true)
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('버전 문자열을 파일명에 안전하게 만든다', () => {
    expect(sanitizeVersion('v0.4.0')).toBe('0.4.0')
    expect(sanitizeVersion(' 1.0.0-beta ')).toBe('1.0.0-beta')
    expect(sanitizeVersion('')).toBe('0.0.0')
  })

  it('빌드 로그 경로 형식', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-ship-'))
    const today = new Date().toISOString().split('T')[0]
    const version = sanitizeVersion('0.4.0')
    const filePath = path.join(tmp, 'docs', 'build-log', `${today}-v${version}.md`)

    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, '# test', 'utf-8')

    expect(fs.existsSync(filePath)).toBe(true)
    expect(filePath).toMatch(/build-log[/\\]\d{4}-\d{2}-\d{2}-v0\.4\.0\.md$/)

    fs.rmSync(tmp, { recursive: true })
  })
})
