import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseRules } from '../src/lib/rules-parser.js'

function writeRules(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-rules-'))
  const p = path.join(dir, 'RULES.md')
  fs.writeFileSync(p, content, 'utf-8')
  return p
}

describe('parseRules (VHK-011/012)', () => {
  it('VHK-012: 기록/지침 섹션의 URL·행동지침 경로를 규칙으로 오추출 안 함', () => {
    const p = writeRules(
      [
        '# Rules',
        '',
        '## 기록 규칙',
        '- ⚠️ 직접 수정 금지 — `github.com/byh3071-cpu/vhk` 템플릿',
        '- 버그 발견 시 `docs/vhk-issues/`에 기록',
      ].join('\n')
    )
    const rules = parseRules(p)
    // 메타 섹션 → 금지패턴·필수디렉터리 등록 0 (CI 깨뜨리는 오탐 제거)
    expect(rules.filter((r) => r.type === 'content')).toHaveLength(0)
    expect(rules.filter((r) => r.type === 'structure')).toHaveLength(0)
    fs.rmSync(path.dirname(p), { recursive: true })
  })

  it('VHK-012: 금지 인접 코드 토큰은 ban, URL은 제외', () => {
    const p = writeRules(
      [
        '## 코딩 규칙',
        '- `execSync` 사용 금지',
        '- 금지: `eval`',
        '- 참고 `github.com/x/y` 직접 수정 금지',
      ].join('\n')
    )
    const rules = parseRules(p)
    const content = rules.filter((r) => r.type === 'content')
    expect(content.some((r) => r.description.includes('execSync'))).toBe(true)
    expect(content.some((r) => r.description.includes('eval'))).toBe(true)
    // URL 토큰은 금지 패턴으로 등록 안 됨
    expect(content.map((r) => r.pattern?.source ?? '').join(' ')).not.toContain('github')
    fs.rmSync(path.dirname(p), { recursive: true })
  })

  it('VHK-012: 구조(필수 디렉터리) 규칙은 아키텍처 섹션에서만', () => {
    const p = writeRules(
      [
        '## 코딩 규칙',
        '- 로그는 `docs/log/`에 남긴다',
        '## 아키텍처',
        '- 소스는 `src/`',
      ].join('\n')
    )
    const rules = parseRules(p)
    expect(rules.filter((r) => r.type === 'structure')).toHaveLength(1)
    fs.rmSync(path.dirname(p), { recursive: true })
  })

  it('VHK-013: rule id 가 RULES.md 출처 행번호(L<n>) 를 쓴다', () => {
    const p = writeRules(
      [
        '# Rules', // L1
        '', // L2
        '## 코딩 규칙', // L3
        '- `eval` 사용 금지', // L4 → ban-L4
      ].join('\n')
    )
    const ban = parseRules(p).find((r) => r.id.startsWith('ban-'))
    expect(ban?.id).toBe('ban-L4')
    fs.rmSync(path.dirname(p), { recursive: true })
  })
})
