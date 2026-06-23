import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { getVhkDescription } from '../src/lib/version.js'

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

// Goal 54: README 버전 드리프트 가드 — package.json(SoT)을 동적 비교(버전 하드코딩 금지).
//   README 두 곳(frontmatter tags + 제목 blockquote)이 발행 버전과 어긋나면 CI 실패.
describe('버전 정합 — package.json ↔ README.md', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { version: string }
  const readme = readFileSync('README.md', 'utf-8')
  const head = readme.split('\n').slice(0, 16).join('\n') // frontmatter + 제목 blockquote 범위

  it('README frontmatter tags 의 vX.Y.Z 가 package.json 과 일치', () => {
    const m = head.match(/tags:.*?v(\d+\.\d+\.\d+)/)
    expect(m, 'README frontmatter tags 에 vX.Y.Z 태그가 있어야 함').not.toBeNull()
    expect(
      m![1],
      `README tags 버전(v${m![1]}) ≠ package.json(${pkg.version}) — 릴리즈 시 README 도 갱신하세요`,
    ).toBe(pkg.version)
  })

  it('README 제목 blockquote 의 **vX.Y.Z** 가 package.json 과 일치', () => {
    const m = head.match(/\*\*v(\d+\.\d+\.\d+)\*\*/)
    expect(m, 'README 상단 blockquote 에 **vX.Y.Z** 가 있어야 함').not.toBeNull()
    expect(
      m![1],
      `README blockquote 버전(v${m![1]}) ≠ package.json(${pkg.version}) — 릴리즈 시 README 도 갱신하세요`,
    ).toBe(pkg.version)
  })
})

// Goal 81: 제품 설명 단일 SoT — package.json.description 가 SoT.
//   과거 index.ts 가 .description('VHK — …') 로 같은 설명을 하드코딩 복제 → 드리프트 위험.
//   getVhkDescription() 런타임 주입으로 복제를 구조적으로 제거(getVhkVersion 과 동형).
describe('제품 설명 정합 — package.json ↔ index.ts (Goal 81)', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { description?: string }
  const idx = readFileSync('src/index.ts', 'utf-8')

  it('getVhkDescription() 이 package.json.description 을 그대로 반환', () => {
    expect(typeof pkg.description).toBe('string')
    expect(getVhkDescription()).toBe(pkg.description)
  })

  it('index.ts 프로그램 설명이 getVhkDescription() 주입(하드코딩 복제 제거)', () => {
    // #342 #343: getVhkDescription() 이 설명 SoT 인 점은 유지하되, 'MCP N tools' 토큰은
    //   normalizeMcpToolCount() 로 실 등록 수에 맞춰 정규화해 주입한다(getVhkDescription() 직접 또는 래핑 허용).
    expect(idx).toMatch(/\.name\('vhk'\)[\s\S]*?\.description\([\s\S]*?getVhkDescription\(\)[\s\S]*?\)/)
    // 제품 설명을 index.ts 에 통째 하드코딩 금지(드리프트 원천 차단).
    expect(idx).not.toMatch(/\.description\('VHK — AI 코딩 세션을/)
  })
})
