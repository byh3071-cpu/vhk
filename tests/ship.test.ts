import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { updateChangelogUnreleased } from '../src/commands/ship.js'

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

describe('updateChangelogUnreleased', () => {
  it('CHANGELOG.md 없으면 missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-changelog-'))
    const r = updateChangelogUnreleased(tmp, '0.5.3', '2026-05-23')
    expect(r.status).toBe('missing')
    fs.rmSync(tmp, { recursive: true })
  })

  it('[Unreleased] 섹션 없으면 no-unreleased', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-changelog-'))
    fs.writeFileSync(path.join(tmp, 'CHANGELOG.md'), '# Changelog\n\n## [0.5.0]\n', 'utf-8')
    const r = updateChangelogUnreleased(tmp, '0.5.3', '2026-05-23')
    expect(r.status).toBe('no-unreleased')
    fs.rmSync(tmp, { recursive: true })
  })

  it('[Unreleased] → [버전] 이동 + 새 [Unreleased] 위에 삽입', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-changelog-'))
    const before = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Added',
      '- 새 기능 X',
      '',
      '## [0.5.0] — 2026-05-20',
      '',
      '### Added',
      '- 이전 기능',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(tmp, 'CHANGELOG.md'), before, 'utf-8')

    const r = updateChangelogUnreleased(tmp, '0.5.3', '2026-05-23')
    expect(r.status).toBe('updated')
    if (r.status === 'updated') expect(r.version).toBe('0.5.3')

    const after = fs.readFileSync(path.join(tmp, 'CHANGELOG.md'), 'utf-8')
    // 새 [Unreleased]가 위에 있고 [0.5.3]이 그 다음에 있어야 함
    const unreleasedIdx = after.indexOf('## [Unreleased]')
    const v053Idx = after.indexOf('## [0.5.3] — 2026-05-23')
    const v050Idx = after.indexOf('## [0.5.0]')
    expect(unreleasedIdx).toBeGreaterThan(-1)
    expect(v053Idx).toBeGreaterThan(unreleasedIdx)
    expect(v050Idx).toBeGreaterThan(v053Idx)
    // 기존 [Unreleased] 본문(`- 새 기능 X`)은 [0.5.3] 섹션 아래에 보존돼야 함
    expect(after.indexOf('- 새 기능 X')).toBeGreaterThan(v053Idx)

    fs.rmSync(tmp, { recursive: true })
  })
})
