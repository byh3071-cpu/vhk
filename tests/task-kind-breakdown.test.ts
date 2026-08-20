import { describe, it, expect } from 'vitest'
import {
  classifyPath,
  deriveTaskKind,
  deriveTaskKindDetailed,
  type TaskKind,
} from '../src/lib/task-kind.js'

/*
 * RFC 0066 §5.3 — 혼합 커밋에서 미분류가 섞이면 위험도는 human 이다 (적대 검증 치명 1).
 *
 * 초안은 "deriveTaskKind 가 이미 위험도 최댓값을 주므로 fail-closed" 라고 적었는데 코드와 반대였다.
 * RISK_ORDER 에 unknown 이 없어서 `indexOf` 가 -1 을 주고, 미분류는 **어떤 분류된 유형에도 진다.**
 * 그래서 `['docs/a.md', 'Dockerfile']` 이 통째로 docs = auto 로 통과했다.
 *
 * 기존 deriveTaskKind 의 시그니처·동작은 바꾸지 않는다 — 원장에 이미 쓰인 taskKind 값의 의미가
 * 달라지면 과거 라인과 비교가 깨진다. 대신 additive 함수를 하나 더 둔다.
 */

describe('deriveTaskKindDetailed (RFC 0066 §5.3)', () => {
  it('kind 는 기존 deriveTaskKind 와 항상 같다 — 원장 값의 의미 불변', () => {
    const cases: string[][] = [
      ['docs/a.md'],
      ['docs/a.md', 'Dockerfile'],
      ['Dockerfile'],
      ['src/lib/a.ts', 'docs/b.md'],
      ['.github/workflows/ci.yml'],
      [],
    ]
    for (const paths of cases) {
      expect(deriveTaskKindDetailed(paths).kind).toBe(deriveTaskKind(paths))
    }
  })

  it('미분류 경로 수를 센다 — 이게 치명 1 을 막는 신호다', () => {
    const r = deriveTaskKindDetailed(['docs/a.md', 'Dockerfile'])
    expect(r.kind).toBe('docs') // 기존 동작 그대로
    expect(r.total).toBe(2)
    expect(r.unclassified).toBe(1) // 그러나 미분류가 섞였다는 사실이 남는다
  })

  it('전부 분류되면 unclassified 는 0', () => {
    const r = deriveTaskKindDetailed(['docs/a.md', 'src/lib/x.ts'])
    expect(r.unclassified).toBe(0)
    expect(r.total).toBe(2)
  })

  it('빈 목록은 total 0 — 범위를 못 구한 상태', () => {
    const r = deriveTaskKindDetailed([])
    expect(r.total).toBe(0)
    expect(r.unclassified).toBe(0)
    expect(r.kind).toBe('unknown')
  })

  it('전부 미분류면 unclassified 가 total 과 같다', () => {
    const r = deriveTaskKindDetailed(['Dockerfile', 'Makefile'])
    expect(r.total).toBe(2)
    expect(r.unclassified).toBe(2)
    expect(r.kind).toBe('unknown')
  })
})

describe('PATH_RULES 확장 — .vhk/policy.json (RFC 0066 §7.3 조치3)', () => {
  // 설정 파일이 security 로 분류돼야 그 변경이 사람 승인 축에 걸린다.
  it('.vhk/policy.json 은 security 다', () => {
    expect(classifyPath('.vhk/policy.json')).toBe('security')
  })

  // additive 예외는 이 한 경로뿐이다. 다른 경로의 분류 결과는 하나도 바뀌지 않아야 한다.
  it('기존 경로 집합의 분류 결과는 불변', () => {
    const fixed: Array<[string, TaskKind]> = [
      ['.github/workflows/ci.yml', 'security'],
      ['.gitignore', 'security'],
      ['src/lib/exec.ts', 'security'],
      ['docs/adr/ADR-001.md', 'docs'],
      ['src/lib/foo.ts', 'source'],
      ['Dockerfile', 'unknown'],
      ['.vhk/memory.json', 'unknown'],
      ['.vhk/config.json', 'unknown'],
    ]
    for (const [path, kind] of fixed) {
      expect([path, classifyPath(path)]).toEqual([path, kind])
    }
  })
})
