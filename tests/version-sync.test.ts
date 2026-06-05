import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// 버전 정합 가드 (자동화 C) — 매 릴리즈마다 손으로 맞추던 버전 표기가 어긋나면 CI 실패.
// package.json 이 단일 진실(SoT). CLAUDE.md 의 "**버전:** vX.Y.Z" 표기가 이를 따라가야 한다.
describe('버전 정합 — package.json ↔ CLAUDE.md', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { version: string }

  it('CLAUDE.md "**버전:**" 표기가 package.json version 과 일치', () => {
    const claude = readFileSync('CLAUDE.md', 'utf-8')
    const m = claude.match(/\*\*버전:\*\*\s*v(\d+\.\d+\.\d+)/)
    expect(m, 'CLAUDE.md 에 "**버전:** vX.Y.Z" 라인이 있어야 함').not.toBeNull()
    expect(
      m![1],
      `CLAUDE.md 버전(v${m![1]}) ≠ package.json(${pkg.version}) — 릴리즈 시 CLAUDE.md 버전도 갱신하세요`,
    ).toBe(pkg.version)
  })
})
