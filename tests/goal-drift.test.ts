import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  hasCustomGateAssertions,
  findStatusDriftCandidates,
  extractBacktickPaths,
  resolvePathEvidence,
  tallyCheckboxes,
  PATH_EVIDENCE_MIN,
} from '../src/lib/goal-drift.js'
import { repoGoalsPresent, REPO_GOALS_SKIP_NOTE } from '../src/lib/test-support/repo-goals.js'

// `vhk goal sync` 가 생성하는 스캐폴드 게이트의 핵심(must 정의 + 주석 예시만 — 고유 검증 0).
const SCAFFOLD = `#!/usr/bin/env node
const must = (cond, label) => { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) pass = false }
// const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
// must(read('src/foo.ts')?.includes('bar'), 'foo.ts 에 bar 존재')
`
// 구현하면서 손으로 추가한 goal 고유 검증 호출.
const CUSTOM = SCAFFOLD + "must(existsSync('src/commands/pattern.ts'), 'pattern.ts 존재')\n"

describe('hasCustomGateAssertions', () => {
  it('스캐폴드(정의 + 주석 예시만) → false', () => {
    expect(hasCustomGateAssertions(SCAFFOLD)).toBe(false)
  })
  it('goal 고유 must() 호출 있으면 → true', () => {
    expect(hasCustomGateAssertions(CUSTOM)).toBe(true)
  })
  it('주석 처리된 must() 호출은 무시 → false', () => {
    expect(hasCustomGateAssertions(SCAFFOLD + "// must(read('x'), 'x')\n")).toBe(false)
  })
})

describe('path evidence helpers', () => {
  it('백틱에서 경로만 추출(URL·순수식별자 제외)', () => {
    const body = [
      '- `providers/image-openai.ts`',
      '- `zod`',
      '- `https://example.com`',
      '- `poc/run.ts`',
      '- `app/api/checkout-*`',
    ].join('\n')
    expect(extractBacktickPaths(body)).toEqual([
      'providers/image-openai.ts',
      'poc/run.ts',
      'app/api/checkout-*',
    ])
  })

  it('축약 경로 → lib/engine prefix 해석', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-path-ev-'))
    try {
      const target = path.join(root, 'lib', 'engine', 'providers')
      fs.mkdirSync(target, { recursive: true })
      fs.writeFileSync(path.join(target, 'image-openai.ts'), 'export {}\n')
      expect(resolvePathEvidence(root, 'providers/image-openai.ts')).toBe(
        'lib/engine/providers/image-openai.ts',
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('동일 basename 후보가 여럿이면 부모 경로가 일치하는 유일 후보만 선택', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-path-parent-'))
    try {
      fs.mkdirSync(path.join(root, 'packages', 'a', 'providers'), { recursive: true })
      fs.mkdirSync(path.join(root, 'packages', 'b', 'adapters'), { recursive: true })
      fs.writeFileSync(path.join(root, 'packages', 'a', 'providers', 'image.ts'), 'export {}\n')
      fs.writeFileSync(path.join(root, 'packages', 'b', 'adapters', 'image.ts'), 'export {}\n')
      expect(resolvePathEvidence(root, 'providers/image.ts')).toBe(
        'packages/a/providers/image.ts',
      )
      expect(resolvePathEvidence(root, 'legacy/image.ts')).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('부모 경로까지 같은 basename 후보가 여럿이면 오탐 대신 null', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-path-ambiguous-'))
    try {
      fs.mkdirSync(path.join(root, 'packages', 'a', 'providers'), { recursive: true })
      fs.mkdirSync(path.join(root, 'packages', 'b', 'providers'), { recursive: true })
      fs.writeFileSync(path.join(root, 'packages', 'a', 'providers', 'image.ts'), 'export {}\n')
      fs.writeFileSync(path.join(root, 'packages', 'b', 'providers', 'image.ts'), 'export {}\n')
      expect(resolvePathEvidence(root, 'providers/image.ts')).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('글롭 checkout-* 매칭', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-glob-ev-'))
    try {
      const dir = path.join(root, 'app', 'api')
      fs.mkdirSync(dir, { recursive: true })
      fs.mkdirSync(path.join(dir, 'checkout-pdf'))
      expect(resolvePathEvidence(root, 'app/api/checkout-*')).toBe('app/api/checkout-pdf')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('findStatusDriftCandidates', () => {
  function setup(
    goals: Record<string, string>,
    scripts: Record<string, string>,
    files: Record<string, string> = {},
  ): { root: string; gdir: string; sdir: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-drift-'))
    const gdir = path.join(root, 'goals')
    const sdir = path.join(root, 'scripts')
    fs.mkdirSync(gdir)
    fs.mkdirSync(sdir)
    for (const [name, content] of Object.entries(goals)) fs.writeFileSync(path.join(gdir, name), content)
    for (const [name, content] of Object.entries(scripts)) fs.writeFileSync(path.join(sdir, name), content)
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, ...rel.split('/'))
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, content)
    }
    return { root, gdir, sdir }
  }
  const goalCard = (id: number, status: string, body = ''): string =>
    `---\nvhk_format: 1\ntype: goal\nid: ${id}\ntitle: G${id}\nstatus: ${status}\npriority: P1\n---\n\n# Goal ${id}\n${body}\n`

  it('NOT_STARTED + custom 게이트 → 드리프트로 잡음', () => {
    const { root, gdir, sdir } = setup({ '5-x.md': goalCard(5, 'NOT_STARTED') }, { 'check-goal-5.mjs': CUSTOM })
    expect(findStatusDriftCandidates(gdir, sdir, root).map((x) => x.id)).toEqual([5])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('NOT_STARTED + 스캐폴드 게이트 → 통과(오탐 0)', () => {
    const { root, gdir, sdir } = setup({ '6-y.md': goalCard(6, 'NOT_STARTED') }, { 'check-goal-6.mjs': SCAFFOLD })
    expect(findStatusDriftCandidates(gdir, sdir, root)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('DONE + custom 게이트 → 통과(정상 완료)', () => {
    const { root, gdir, sdir } = setup({ '7-z.md': goalCard(7, 'DONE') }, { 'check-goal-7.mjs': CUSTOM })
    expect(findStatusDriftCandidates(gdir, sdir, root)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('NOT_STARTED + 게이트 스크립트 없음 → 통과(아직 sync 안 한 goal)', () => {
    const { root, gdir, sdir } = setup({ '8-w.md': goalCard(8, 'NOT_STARTED') }, {})
    expect(findStatusDriftCandidates(gdir, sdir, root)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it(`NOT_STARTED + 본문 경로 증거 ≥${PATH_EVIDENCE_MIN} (스크립트 없음) → 드리프트`, () => {
    const body = '## 완료조건\n- `poc/run.ts`\n- `lib/engine/providers/image-openai.ts`\n'
    const { root, gdir, sdir } = setup(
      { '2-engine.md': goalCard(2, 'NOT_STARTED', body) },
      {},
      {
        'poc/run.ts': 'console.log(1)\n',
        'lib/engine/providers/image-openai.ts': 'export {}\n',
      },
    )
    const hits = findStatusDriftCandidates(gdir, sdir, root)
    expect(hits.map((x) => x.id)).toEqual([2])
    expect(hits[0].reason).toContain('경로 증거')
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('NOT_STARTED + 축약 경로 본문도 prefix 해석으로 드리프트', () => {
    const body = '## 완료조건\n- `providers/image-openai.ts`\n- `providers/text-openai.ts`\n'
    const { root, gdir, sdir } = setup(
      { '2-engine.md': goalCard(2, 'NOT_STARTED', body) },
      {},
      {
        'lib/engine/providers/image-openai.ts': 'export {}\n',
        'lib/engine/providers/text-openai.ts': 'export {}\n',
      },
    )
    expect(findStatusDriftCandidates(gdir, sdir, root).map((x) => x.id)).toEqual([2])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('경로 증거 1건만 → 미탐 선호(오탐 방지)', () => {
    const body = '- `poc/run.ts`\n'
    const { root, gdir, sdir } = setup(
      { '9-one.md': goalCard(9, 'NOT_STARTED', body) },
      {},
      { 'poc/run.ts': 'ok\n' },
    )
    expect(findStatusDriftCandidates(gdir, sdir, root)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('NOT_STARTED + 체크박스 전부 완료 → 드리프트 (경로 증거 없이도)', () => {
    const body = '## 티켓\n- [x] **T1** 하나\n- [x] **T2** 둘\n'
    const { root, gdir, sdir } = setup({ '10-done.md': goalCard(10, 'NOT_STARTED', body) }, {})
    const hits = findStatusDriftCandidates(gdir, sdir, root)
    expect(hits.map((x) => x.id)).toEqual([10])
    expect(hits[0].reason).toContain('체크박스')
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('NOT_STARTED + 체크박스 일부만 완료 → 통과(진행 중은 드리프트 아님)', () => {
    const body = '## 티켓\n- [x] **T1** 하나\n- [ ] **T2** 둘\n'
    const { root, gdir, sdir } = setup({ '11-partial.md': goalCard(11, 'NOT_STARTED', body) }, {})
    expect(findStatusDriftCandidates(gdir, sdir, root)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })

  // 112-T7(a) 회귀: 계획 카드는 "앞으로 고칠 파일" 경로를 인용하고 그 경로는 이미 존재한다.
  // 예전 구현은 이것만으로 드리프트 판정해 신규 계획 카드 14장이 100% 오탐이었다.
  it('NOT_STARTED + 미완 체크박스 + 실재 경로 인용 → 통과(계획 카드 오탐 0)', () => {
    const body = [
      '## 티켓',
      '- [ ] **T1** `src/commands/goal.ts` 수정',
      '- [ ] **T2** `tests/goal.test.ts` 보강',
    ].join('\n')
    const { root, gdir, sdir } = setup(
      { '12-plan.md': goalCard(12, 'NOT_STARTED', body) },
      {},
      { 'src/commands/goal.ts': 'export {}\n', 'tests/goal.test.ts': 'export {}\n' },
    )
    expect(findStatusDriftCandidates(gdir, sdir, root)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('체크박스가 전부 완료여도 status 가 DONE 이면 통과', () => {
    const body = '## 티켓\n- [x] **T1** 하나\n'
    const { root, gdir, sdir } = setup({ '13-ok.md': goalCard(13, 'DONE', body) }, {})
    expect(findStatusDriftCandidates(gdir, sdir, root)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })

  // 112-T7(b): goals/ 가 비추적이라 CI 에는 없다 → 빈 배열끼리 비교하며 무조건 통과하던 가드.
  // 판정력이 로컬에만 있다는 사실이 보이도록 조건부 실행으로 분리한다.
  it.skipIf(!repoGoalsPresent())(
    `실제 repo goals/ ↔ scripts/ 드리프트 0 (회귀 가드 — ${REPO_GOALS_SKIP_NOTE})`,
    () => {
      expect(findStatusDriftCandidates('goals', 'scripts')).toEqual([])
    },
  )
})

describe('tallyCheckboxes', () => {
  it('체크·미체크를 세고 체크박스가 아닌 줄은 무시', () => {
    const body = ['- [x] 완료', '- [ ] 미완', '* [X] 대문자도 완료', '- 그냥 항목', '텍스트'].join('\n')
    expect(tallyCheckboxes(body)).toEqual({ total: 3, checked: 2 })
  })

  it('체크박스가 없으면 0/0', () => {
    expect(tallyCheckboxes('# 제목\n본문\n')).toEqual({ total: 0, checked: 0 })
  })
})
