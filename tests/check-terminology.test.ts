import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
// tsc 는 tests/ 미검사 → .mjs 직접 import 안전(meta-gate.test.ts 선례).
import {
  findLegacyTerms,
  FORBIDDEN_TERMS,
  TERMINOLOGY_TARGETS,
} from '../scripts/check-terminology.mjs'

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-terminology.mjs')

// 114-T5 / ADR-011: 종전 용어가 외부 표면에 다시 섞이면 실패시킨다.
// 이 테스트가 검사기를 실제로 실행하므로 CI 에서도 게이트가 살아 있다(스크립트만 두면 아무도 안 돈다).
describe('check-terminology — ADR-011 용어 회귀 게이트', () => {
  it('실물 외부 표면에 종전 용어 0건 (회귀 가드)', () => {
    execFileSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf-8', stdio: 'pipe' })
  })

  it('종전 용어가 있으면 줄 번호와 대체어를 함께 보고한다', () => {
    const hits = findLegacyTerms('첫 줄\n- 감사층을 만든다\n마지막 줄\n')
    expect(hits).toHaveLength(1)
    expect(hits[0].line).toBe(2)
    expect(hits[0].term).toBe('감사층')
    expect(hits[0].to).toBe('검증 계층')
  })

  it('한 파일에 여러 줄이 걸리면 전부 보고한다 (전역 정규식 lastIndex 누수 회귀)', () => {
    // 전역 플래그를 재사용하면 lastIndex 가 남아 홀수 줄만 잡히는 함정 — 매 줄 새 정규식이어야 한다.
    const hits = findLegacyTerms('- 트립와이어 A\n- 트립와이어 B\n- 트립와이어 C\n')
    expect(hits.map((h) => h.line)).toEqual([1, 2, 3])
  })

  it('종전 용어가 없으면 0건', () => {
    expect(findLegacyTerms('- 검증 리포트로 완료 보고 검증을 한다\n')).toEqual([])
  })

  it('대응표에 ADR-011 의 핵심 항목이 들어 있다', () => {
    const sources = FORBIDDEN_TERMS.map((t) => t.pattern.source)
    expect(sources.some((s) => s.includes('감사층'))).toBe(true)
    expect(sources.some((s) => s.includes('트립와이어'))).toBe(true)
    expect(sources.some((s) => s.includes('드리프트'))).toBe(true)
  })

  it('검사 대상은 외부 표면만 — ADR·RFC 는 제외 (append-only 규율)', () => {
    expect(TERMINOLOGY_TARGETS).toContain('README.md')
    expect(TERMINOLOGY_TARGETS).toContain('src/i18n/ko.ts')
    expect(TERMINOLOGY_TARGETS.some((f: string) => f.startsWith('docs/adr/'))).toBe(false)
    expect(TERMINOLOGY_TARGETS.some((f: string) => f.startsWith('docs/rfc/'))).toBe(false)
  })

  it('종전 용어가 섞인 파일을 넘기면 exit 1', () => {
    // 이 테스트 파일 자신을 대상으로 주면 위 픽스처 문자열들이 잡혀야 한다.
    expect(() =>
      execFileSync('node', [SCRIPT, path.join('tests', 'check-terminology.test.ts')], {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: 'pipe',
      }),
    ).toThrow()
  })
})
