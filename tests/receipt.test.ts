import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  decideReceipt,
  buildReceipt,
  renderReceiptMarkdown,
  type ReceiptEvidence,
  type ReceiptDecision,
  HONESTY_LINE,
} from '../src/lib/receipt.js'
import { collectReceipt, collectIntent, verifyBaseSha } from '../src/commands/receipt.js'

// Goal 86 (RFC 0056 T1): vhk receipt — 4대 기계증거 → 영수증 1장.
// 핵심 불변식(테스트로 고정):
//  ① decision 은 기계증거만으로(LLM 0). 실차단(red·dirty·stale·forbidden) 중 하나라도면 block.
//  ② 단조성: caution → pass 격상 절대 금지(부정 신호가 늘면 결과가 좋아질 수 없다).
//  ③ ④ diff-cover 는 advisory(약신호) — decision 을 block 으로 격하시키지 못한다.

/** 모든 게이트 green·clean·신선·풀커버 = 깨끗한 기준 증거. */
function cleanEvidence(): ReceiptEvidence {
  return {
    gates: { red: false, status: 'PASS', failedGateIds: [], hasSoftWarning: false },
    dirty: false,
    stale: false,
    staleKnown: true,
    diffCover: { measured: true, totalAdded: 10, totalUncovered: 0, ratio: 1 },
  }
}

describe('decideReceipt — 기계증거만(LLM 0)', () => {
  it('전부 green·clean·신선·풀커버 → pass', () => {
    expect(decideReceipt(cleanEvidence())).toBe('pass')
  })

  it('red(게이트 실패 종료코드) → block', () => {
    const e = cleanEvidence()
    e.gates.red = true
    e.gates.status = 'FAIL'
    e.gates.failedGateIds = ['test']
    expect(decideReceipt(e)).toBe('block')
  })

  it('dirty(미커밋 변경) → block', () => {
    const e = cleanEvidence()
    e.dirty = true
    expect(decideReceipt(e)).toBe('block')
  })

  it('stale(작업시작 SHA ≠ HEAD) → block', () => {
    const e = cleanEvidence()
    e.stale = true
    expect(decideReceipt(e)).toBe('block')
  })

  it('기저 실차단 3종(red·dirty·stale) 각각 단독이면 block — 조합 무관 (forbidden 은 별도 describe)', () => {
    for (const key of ['red', 'dirty', 'stale'] as const) {
      const e = cleanEvidence()
      if (key === 'red') e.gates.red = true
      else e[key] = true
      expect(decideReceipt(e), `${key} 단독이면 block`).toBe('block')
    }
  })

  it('stale 미상(staleKnown=false) 단독은 block 아님 — 모르는 걸 빨강으로 위장 금지', () => {
    const e = cleanEvidence()
    e.stale = false
    e.staleKnown = false
    // 기준선 미기록 = 알 수 없음 → 거짓 block 안 함(단 pass 도 아니고 caution 으로 정직).
    expect(decideReceipt(e)).not.toBe('block')
  })
})

describe('단조성 불변식 — caution → pass 격상 절대 금지', () => {
  it('soft 경고(skip/warn 게이트)가 있으면 caution 이지 pass 아님', () => {
    const e = cleanEvidence()
    e.gates.status = 'WARN'
    e.gates.hasSoftWarning = true
    expect(decideReceipt(e)).toBe('caution')
  })

  it('diff-cover 미검증 변경분이 있으면 caution 이지 pass 아님(advisory 약신호)', () => {
    const e = cleanEvidence()
    e.diffCover = { measured: true, totalAdded: 10, totalUncovered: 4, ratio: 0.6 }
    expect(decideReceipt(e)).toBe('caution')
  })

  it('stale 미상도 caution(모르면 안심 금지)', () => {
    const e = cleanEvidence()
    e.staleKnown = false
    expect(decideReceipt(e)).toBe('caution')
  })

  it('부정 신호를 더해도 결과가 절대 좋아지지 않는다(pass→caution→block 단조)', () => {
    const order: Record<ReceiptDecision, number> = { pass: 0, caution: 1, block: 2 }
    const base = cleanEvidence()
    const baseRank = order[decideReceipt(base)]
    // caution 유발 신호를 추가 → pass 로 떨어질 수 없음(>= base).
    const cautioned = cleanEvidence()
    cautioned.gates.hasSoftWarning = true
    expect(order[decideReceipt(cautioned)]).toBeGreaterThanOrEqual(baseRank)
    // block 유발 신호를 추가 → caution 이상.
    const blocked = cleanEvidence()
    blocked.gates.hasSoftWarning = true
    blocked.dirty = true
    expect(order[decideReceipt(blocked)]).toBeGreaterThanOrEqual(order[decideReceipt(cautioned)])
    expect(decideReceipt(blocked)).toBe('block')
  })
})

describe('④ diff-cover 는 advisory — decision 을 block 으로 격하 못 함', () => {
  it('diff-cover 0% 미커버여도(나머지 clean) block 아님 — 최대 caution', () => {
    const e = cleanEvidence()
    e.diffCover = { measured: true, totalAdded: 20, totalUncovered: 20, ratio: 0 }
    const d = decideReceipt(e)
    expect(d).not.toBe('block')
    expect(d).toBe('caution')
  })

  it('실차단(dirty)에 더해 diff-cover 가 풀커버여도 여전히 block — 차단은 실차단이 결정(diff-cover 무관)', () => {
    const e = cleanEvidence()
    e.dirty = true
    e.diffCover = { measured: true, totalAdded: 10, totalUncovered: 0, ratio: 1 }
    expect(decideReceipt(e)).toBe('block')
  })

  it('diff-cover 미측정(리포트 없음)도 block 아님 — advisory 부재는 차단 사유 아님', () => {
    const e = cleanEvidence()
    e.diffCover = { measured: false, totalAdded: 0, totalUncovered: 0, ratio: 1 }
    expect(decideReceipt(e)).not.toBe('block')
  })
})

describe('buildReceipt — .json 영수증 구조', () => {
  it('decision·증거·생성시각·날짜·슬러그를 담는다', () => {
    const r = buildReceipt(cleanEvidence(), {
      generatedAt: '2026-06-23T00:00:00.000Z',
      date: '2026-06-23',
      slug: 'test-slug',
      headSha: 'abc1234def',
      baseSha: 'abc1234def',
    })
    expect(r.decision).toBe('pass')
    expect(r.date).toBe('2026-06-23')
    expect(r.slug).toBe('test-slug')
    expect(r.evidence.dirty).toBe(false)
    expect(r.head.shortSha).toBe('abc1234')
  })
})

describe('buildReceipt — agent 필드 (RFC 0057 트랙② — 에이전트불가지론 증명용 attribution)', () => {
  it('meta.agent 지정 시 그대로 반영', () => {
    const r = buildReceipt(cleanEvidence(), {
      generatedAt: '2026-07-04T00:00:00.000Z',
      date: '2026-07-04',
      slug: 's',
      headSha: 'abc1234def',
      baseSha: 'abc1234def',
      agent: 'claude-code',
    })
    expect(r.agent).toBe('claude-code')
  })

  it('meta.agent 생략 시 unknown 기본값(하위호환 — 구버전 호출부도 안전)', () => {
    const r = buildReceipt(cleanEvidence(), {
      generatedAt: '2026-07-04T00:00:00.000Z',
      date: '2026-07-04',
      slug: 's',
      headSha: 'abc1234def',
      baseSha: 'abc1234def',
    })
    expect(r.agent).toBe('unknown')
  })
})

// 원칙1(불가침): "decision(판정) = 기계증거 전용, LLM 0" — decideReceipt(e: ReceiptEvidence) 는
// agent 필드에 타입 레벨로 접근 불가능해야 한다(ReceiptEvidence 에 agent 를 추가하지 않음으로 강제).
// 이 테스트는 그 원칙을 행동으로도 증명 — agent 만 다르고 나머지 evidence 가 완전히 동일하면
// decision·reasons 가 완전히 동일해야 한다(missionChecksum 회귀 테스트와 동형 패턴).
describe('decideReceipt — agent 는 decision·reasons 에 절대 무영향 (원칙1 증명)', () => {
  it('agent 값만 다르고 나머지 evidence 동일(clean) → decision·reasons 완전히 동일', () => {
    const meta = {
      generatedAt: '2026-07-04T00:00:00.000Z',
      date: '2026-07-04',
      slug: 's',
      headSha: 'abc1234def',
      baseSha: 'abc1234def',
    }
    const withClaudeCode = buildReceipt(cleanEvidence(), { ...meta, agent: 'claude-code' as const })
    const withUnknown = buildReceipt(cleanEvidence(), { ...meta, agent: 'unknown' as const })
    expect(withClaudeCode.decision).toBe(withUnknown.decision)
    expect(withClaudeCode.reasons).toEqual(withUnknown.reasons)
  })

  it('block 케이스에서도 agent 무관하게 동일 decision·reasons', () => {
    const e = cleanEvidence()
    e.dirty = true
    const meta = {
      generatedAt: '2026-07-04T00:00:00.000Z',
      date: '2026-07-04',
      slug: 's',
      headSha: 'x',
      baseSha: 'y',
    }
    const a = buildReceipt(e, { ...meta, agent: 'claude-code' as const })
    const b = buildReceipt(e, { ...meta, agent: 'unknown' as const })
    expect(a.decision).toBe(b.decision)
    expect(a.decision).toBe('block')
    expect(a.reasons).toEqual(b.reasons)
  })
})

describe('renderReceiptMarkdown — PR/대화 붙여넣기 1블록', () => {
  it('decision 배지 + 게이트표 + 정직성 1줄을 포함', () => {
    const r = buildReceipt(cleanEvidence(), {
      generatedAt: '2026-06-23T00:00:00.000Z',
      date: '2026-06-23',
      slug: 'test-slug',
      headSha: 'abc1234def',
      baseSha: 'abc1234def',
    })
    const md = renderReceiptMarkdown(r)
    expect(md).toContain('PASS')
    expect(md).toContain('게이트')
    expect(md).toContain(HONESTY_LINE)
    // 정직성 1줄 — 게으른 거짓완료 vs 미묘한 오류 경계 명시.
    expect(HONESTY_LINE).toMatch(/게으른 거짓완료|미묘한 오류/)
  })

  it('block 영수증은 사유(dirty/stale/red)를 표기', () => {
    const e = cleanEvidence()
    e.dirty = true
    e.stale = true
    e.gates.red = true
    e.gates.status = 'FAIL'
    e.gates.failedGateIds = ['build']
    const r = buildReceipt(e, {
      generatedAt: '2026-06-23T00:00:00.000Z',
      date: '2026-06-23',
      slug: 's',
      headSha: 'x',
      baseSha: 'y',
    })
    const md = renderReceiptMarkdown(r)
    expect(md).toContain('BLOCK')
    expect(md).toMatch(/미커밋|dirty/)
    expect(md).toMatch(/낡|stale|작업\s*시작/)
  })
})

// lint 게이트 → receipt 합류 확인(수용기준 1): verify lint fail 이 영수증 red 로 자동 합류 → decision=block.
// receipt 수집부(collectReceipt)는 게이트 id 에 일반적이라 receipt.ts/순수 로직 수정 없이 lint 가 red 에 든다.
describe('lint 게이트 → receipt block 합류 (#381 거짓완료 포획)', () => {
  // 커밋 1개 + base-sha 박은 깨끗한 임시 git 레포 — dirty/stale 가 red 를 가리지 않게 격리.
  function makeRepo(lintScript: string): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-receipt-lint-'))
    const g = (args: string[]): void => {
      execFileSync('git', args, { cwd: d, stdio: 'pipe' })
    }
    g(['init'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    fs.writeFileSync(path.join(d, 'lint-runner.js'), `process.exit(${lintScript})\n`, 'utf-8')
    fs.writeFileSync(
      path.join(d, 'package.json'),
      JSON.stringify({ name: 'tp', version: '0.0.0', scripts: { lint: 'node lint-runner.js' } }),
      'utf-8'
    )
    g(['add', '.'])
    g(['commit', '-m', 'seed'])
    // 작업시작 기준선 = 현재 HEAD (stale 미상/거짓 stale 차단).
    fs.mkdirSync(path.join(d, '.vhk', 'receipts'), { recursive: true })
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: d, encoding: 'utf-8' }).trim()
    fs.writeFileSync(path.join(d, '.vhk', 'receipts', '.base-sha'), head + '\n', 'utf-8')
    return d
  }

  it('lint 에러(종료코드 1) → 영수증 evidence.gates.red=true · failedGateIds 에 lint · decision=block', () => {
    const d = makeRepo('1')
    const r = collectReceipt(d)
    expect(r.evidence.gates.red).toBe(true)
    expect(r.evidence.gates.failedGateIds).toContain('lint')
    expect(r.decision).toBe('block')
    fs.rmSync(d, { recursive: true, force: true })
  }, 30_000)
})

// Goal 87: ⑤ intent(의도 대조) — mission(scope/forbidden) ↔ 변경 파일.
//  forbidden 위반 = 결정론 실차단(block, red/dirty/stale 동급) · scope 밖 = advisory(caution).
//  mission.json 없으면 동작·decision·출력 변화 0(하위호환). 단조성·과확장 0 유지.
describe('decideReceipt — ⑤ intent(의도 대조) 반영', () => {
  it('forbidden 위반(missionKnown) → block (red/dirty/stale 동급 실차단)', () => {
    const e = cleanEvidence()
    e.intent = { missionKnown: true, forbiddenHits: 1, scopeWarnings: 0 }
    expect(decideReceipt(e)).toBe('block')
  })

  it('scope 밖 변경만(forbidden 0, missionKnown) → caution (block 아님 — advisory)', () => {
    const e = cleanEvidence()
    e.intent = { missionKnown: true, forbiddenHits: 0, scopeWarnings: 3 }
    expect(decideReceipt(e)).toBe('caution')
  })

  it('하위호환 — intent 부재(undefined)면 기존과 동일(clean→pass)', () => {
    const e = cleanEvidence()
    expect(e.intent).toBeUndefined()
    expect(decideReceipt(e)).toBe('pass')
  })

  it('missionKnown=false 면 forbiddenHits 가 있어도 무시 → 영향 0(clean→pass)', () => {
    const e = cleanEvidence()
    // mission 없을 때의 방어값: 숫자가 채워져도 missionKnown=false 면 decision 에 반영 안 됨.
    e.intent = { missionKnown: false, forbiddenHits: 5, scopeWarnings: 5 }
    expect(decideReceipt(e)).toBe('pass')
  })

  it('ⓑ(N4) objective 토큰 교집합 0 → caution (advisory, block 아님)', () => {
    const e = cleanEvidence()
    e.intent = { missionKnown: true, forbiddenHits: 0, scopeWarnings: 0, objectiveTokenOverlap: 0 }
    expect(decideReceipt(e)).toBe('caution')
    expect(decideReceipt(e)).not.toBe('block')
  })

  it('ⓑ(N4) objective 교집합 >0 → 영향 없음(clean→pass)', () => {
    const e = cleanEvidence()
    e.intent = { missionKnown: true, forbiddenHits: 0, scopeWarnings: 0, objectiveTokenOverlap: 2 }
    expect(decideReceipt(e)).toBe('pass')
  })

  it('ⓑ(N4) objectiveTokenOverlap undefined(미계산) → 영향 0(하위호환·pass)', () => {
    const e = cleanEvidence()
    e.intent = { missionKnown: true, forbiddenHits: 0, scopeWarnings: 0 }
    expect(decideReceipt(e)).toBe('pass')
  })

  it('과확장 0 — missionKnown 이어도 위반·경고 0 이면 caution 유발 안 함(clean→pass)', () => {
    const e = cleanEvidence()
    e.intent = { missionKnown: true, forbiddenHits: 0, scopeWarnings: 0 }
    expect(decideReceipt(e)).toBe('pass')
  })

  it('단조성 — clean 에 forbidden 위반을 더해도 절대 pass 로 격상 안 됨(→block)', () => {
    const order: Record<ReceiptDecision, number> = { pass: 0, caution: 1, block: 2 }
    const base = cleanEvidence()
    const baseRank = order[decideReceipt(base)] // pass
    const violated = cleanEvidence()
    violated.intent = { missionKnown: true, forbiddenHits: 2, scopeWarnings: 0 }
    expect(order[decideReceipt(violated)]).toBeGreaterThanOrEqual(baseRank)
    expect(decideReceipt(violated)).toBe('block')
  })

  it('실차단 우선 — diff-cover 풀커버여도 forbidden 위반이면 block', () => {
    const e = cleanEvidence()
    e.diffCover = { measured: true, totalAdded: 10, totalUncovered: 0, ratio: 1 }
    e.intent = { missionKnown: true, forbiddenHits: 1, scopeWarnings: 0 }
    expect(decideReceipt(e)).toBe('block')
  })
})

// Goal 87 방향 2-1: glob 미지원 문법 → 거짓 안전을 caution 으로 드러냄.
describe('decideReceipt — unsupportedForbiddenCount (방향 2-1)', () => {
  it('unsupportedForbiddenCount>0 → caution (forbidden 검증 무효 가능 — advisory, block 아님)', () => {
    const e = cleanEvidence()
    e.intent = { missionKnown: true, forbiddenHits: 0, scopeWarnings: 0, unsupportedForbiddenCount: 1 }
    expect(decideReceipt(e)).toBe('caution')
  })

  it('단조성 — unsupportedForbiddenCount>0 결과 등급 ≥ cleanEvidence() 결과 등급', () => {
    const order: Record<ReceiptDecision, number> = { pass: 0, caution: 1, block: 2 }
    const base = cleanEvidence()
    const baseRank = order[decideReceipt(base)]
    const e = cleanEvidence()
    e.intent = { missionKnown: true, forbiddenHits: 0, scopeWarnings: 0, unsupportedForbiddenCount: 1 }
    expect(order[decideReceipt(e)]).toBeGreaterThanOrEqual(baseRank)
  })

  it('missionKnown=false + unsupportedForbiddenCount=5 → pass (하위호환, 영향 0)', () => {
    const e = cleanEvidence()
    e.intent = { missionKnown: false, forbiddenHits: 0, scopeWarnings: 0, unsupportedForbiddenCount: 5 }
    expect(decideReceipt(e)).toBe('pass')
  })

  it('intent 없을 때(undefined) → pass 유지 (하위호환)', () => {
    const e = cleanEvidence()
    expect(e.intent).toBeUndefined()
    expect(decideReceipt(e)).toBe('pass')
  })
})

describe('renderReceiptMarkdown — ⑤ intent 행', () => {
  function receiptWithIntent(intent: ReceiptEvidence['intent']) {
    const e = cleanEvidence()
    e.intent = intent
    return renderReceiptMarkdown(
      buildReceipt(e, {
        generatedAt: '2026-06-25T00:00:00.000Z',
        date: '2026-06-25',
        slug: 's',
        headSha: 'abc1234def',
        baseSha: 'abc1234def',
      })
    )
  }

  it('forbidden 위반 → ⑤ intent 행 + "의도" 표기 + 판정 BLOCK', () => {
    const md = receiptWithIntent({ missionKnown: true, forbiddenHits: 1, scopeWarnings: 0 })
    expect(md).toContain('intent')
    expect(md).toMatch(/의도|forbidden/)
    expect(md).toContain('BLOCK')
  })

  it('하위호환 — mission 부재(intent undefined)면 ⑤ intent 행 자체가 없다(출력 변화 0)', () => {
    const md = receiptWithIntent(undefined)
    expect(md).not.toContain('⑤')
    expect(md).not.toContain('intent')
  })
})

describe('collectIntent(경계) — mission.json ↔ 변경 파일', () => {
  // 임시 git 레포를 모아 afterEach 에서 일괄 삭제 — 단언 실패로 인라인 rmSync 가 건너뛰어도 누수 0(CodeRabbit #394).
  const tmpDirs: string[] = []
  afterEach(() => {
    for (const d of tmpDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true })
      } catch {
        /* 정리 실패는 무시 — 테스트 결과에 영향 없음 */
      }
    }
    tmpDirs.length = 0
  })

  // 커밋 1개 박은 임시 git 레포 + 선택적 mission.json. verify 게이트는 안 돌림(intent 수집만 — 빠름).
  function makeMissionRepo(mission: { forbidden: string[]; scope: string[] } | null): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-receipt-intent-'))
    tmpDirs.push(d)
    const g = (args: string[]): void => {
      execFileSync('git', args, { cwd: d, stdio: 'pipe' })
    }
    g(['init'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    fs.writeFileSync(path.join(d, 'README.md'), 'seed\n', 'utf-8')
    g(['add', '.'])
    g(['commit', '-m', 'seed'])
    if (mission) {
      fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
      fs.writeFileSync(
        path.join(d, '.vhk', 'mission.json'),
        JSON.stringify({
          schemaVersion: 1,
          objective: 'test',
          scope: mission.scope,
          forbidden: mission.forbidden,
          createdAt: '2026-06-25T00:00:00.000Z',
          updatedAt: '2026-06-25T00:00:00.000Z',
        }),
        'utf-8'
      )
      // mission.json 을 커밋해 "변경 파일"에서 뺀다 — 안 그러면 mission.json 자체가 scope 밖 변경으로
      // 잡혀 검증 대상(secret/stray/self-tracked)만 보려는 의도를 흐린다.
      g(['add', '.'])
      g(['commit', '-m', 'mission'])
    }
    return d
  }

  it('forbidden 매치 변경 → forbiddenHits>0 → decideReceipt block (수용기준)', () => {
    const d = makeMissionRepo({ forbidden: ['secret/**'], scope: [] })
    fs.mkdirSync(path.join(d, 'secret'), { recursive: true })
    fs.writeFileSync(path.join(d, 'secret', 'key.txt'), 'x', 'utf-8')
    const intent = collectIntent(d)
    expect(intent?.missionKnown).toBe(true)
    expect(intent?.forbiddenHits).toBeGreaterThan(0)
    const e = cleanEvidence()
    e.intent = intent
    expect(decideReceipt(e)).toBe('block')
  })

  it('커밋된 forbidden 위반도 잡는다 — baseSha 기준(커밋해 숨기기 차단, CodeRabbit #394)', () => {
    const d = makeMissionRepo({ forbidden: ['secret/**'], scope: [] })
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: d, encoding: 'utf-8' }).trim()
    fs.mkdirSync(path.join(d, 'secret'), { recursive: true })
    fs.writeFileSync(path.join(d, 'secret', 'key.txt'), 'leak', 'utf-8')
    execFileSync('git', ['add', '.'], { cwd: d, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', 'leak'], { cwd: d, stdio: 'pipe' })
    // 커밋 후 working tree 는 clean — status(미커밋)만 보면 놓친다. baseSha 기준이면 커밋된 위반을 잡는다.
    expect(collectIntent(d, base)?.forbiddenHits).toBeGreaterThan(0)
    // 대조: 기준선 없으면 status 폴백 → 미커밋 0 이라 forbiddenHits=0 (이 경우 receipt stale 이 보완).
    expect(collectIntent(d)?.forbiddenHits).toBe(0)
  })

  it('scope 밖 변경 → scopeWarnings>0 · forbiddenHits=0 → caution', () => {
    const d = makeMissionRepo({ forbidden: [], scope: ['allowed/**'] })
    fs.writeFileSync(path.join(d, 'stray.txt'), 'x', 'utf-8')
    const intent = collectIntent(d)
    expect(intent?.forbiddenHits).toBe(0)
    expect(intent?.scopeWarnings).toBeGreaterThan(0)
    const e = cleanEvidence()
    e.intent = intent
    expect(decideReceipt(e)).toBe('caution')
  })

  it('하위호환 — mission.json 없으면 collectIntent undefined(변경이 있어도)', () => {
    const d = makeMissionRepo(null)
    fs.writeFileSync(path.join(d, 'whatever.txt'), 'x', 'utf-8')
    expect(collectIntent(d)).toBeUndefined()
  })

  it('자기참조 회귀 — .vhk/events/*.jsonl 변경은 scope 경고를 유발 안 함(dirty 와 동일 제외)', () => {
    const d = makeMissionRepo({ forbidden: [], scope: ['src/**'] })
    fs.mkdirSync(path.join(d, '.vhk', 'events'), { recursive: true })
    fs.writeFileSync(path.join(d, '.vhk', 'events', 'ai-actions.jsonl'), '{}\n', 'utf-8')
    const intent = collectIntent(d)
    expect(intent?.scopeWarnings).toBe(0)
    expect(intent?.forbiddenHits).toBe(0)
  })

  // 방향 3-③: mission checksum 스냅샷(사후 위조 탐지). decision 영향 0 — 순수 사후 감사용.
  it('mission 있으면 missionChecksum 존재 + 16자 hex', () => {
    const d = makeMissionRepo({ forbidden: ['secret/**'], scope: [] })
    const intent = collectIntent(d)
    expect(intent?.missionChecksum).toBeDefined()
    expect(intent?.missionChecksum).toMatch(/^[0-9a-f]{16}$/)
  })

  it('mission.json 내용이 바뀌면 checksum 도 달라진다(사후 위조 탐지)', () => {
    const d = makeMissionRepo({ forbidden: ['secret/**'], scope: [] })
    const before = collectIntent(d)?.missionChecksum
    // forbidden 을 완화(위조 시나리오) → 내용 변화 → checksum 변화.
    fs.writeFileSync(
      path.join(d, '.vhk', 'mission.json'),
      JSON.stringify({
        schemaVersion: 1,
        objective: 'test',
        scope: [],
        forbidden: [],
        createdAt: '2026-06-25T00:00:00.000Z',
        updatedAt: '2026-06-25T00:00:00.000Z',
      }),
      'utf-8'
    )
    const after = collectIntent(d)?.missionChecksum
    expect(before).toBeDefined()
    expect(after).toBeDefined()
    expect(after).not.toBe(before)
  })

  it('하위호환 — mission 없으면 missionChecksum 자체가 없다(undefined intent)', () => {
    const d = makeMissionRepo(null)
    expect(collectIntent(d)).toBeUndefined()
  })
})

// 방향 3-③: checksum 은 decision 에 절대 반영 안 됨(순수 사후 감사) — 단조성 불변식 ②·③ 불변.
describe('decideReceipt — missionChecksum 은 decision 무영향(3-③)', () => {
  it('checksum 유무가 decision 을 바꾸지 않는다(clean→pass 유지)', () => {
    const withSum = cleanEvidence()
    withSum.intent = { missionKnown: true, forbiddenHits: 0, scopeWarnings: 0, missionChecksum: 'deadbeefdeadbeef' }
    const without = cleanEvidence()
    without.intent = { missionKnown: true, forbiddenHits: 0, scopeWarnings: 0 }
    expect(decideReceipt(withSum)).toBe('pass')
    expect(decideReceipt(without)).toBe('pass')
    expect(decideReceipt(withSum)).toBe(decideReceipt(without))
  })

  it('forbidden 위반 + checksum 있어도 여전히 block(checksum 이 격상시키지 못함)', () => {
    const e = cleanEvidence()
    e.intent = { missionKnown: true, forbiddenHits: 1, scopeWarnings: 0, missionChecksum: 'abcdef0123456789' }
    expect(decideReceipt(e)).toBe('block')
  })
})

describe('renderReceiptMarkdown — mission checksum 1줄(3-③)', () => {
  function md(intent: ReceiptEvidence['intent']) {
    const e = cleanEvidence()
    e.intent = intent
    return renderReceiptMarkdown(
      buildReceipt(e, {
        generatedAt: '2026-06-25T00:00:00.000Z',
        date: '2026-06-25',
        slug: 's',
        headSha: 'abc1234def',
        baseSha: 'abc1234def',
      })
    )
  }

  it('checksum 있으면 mission checksum 줄을 표시', () => {
    const out = md({ missionKnown: true, forbiddenHits: 0, scopeWarnings: 0, missionChecksum: 'deadbeefdeadbeef' })
    expect(out).toContain('mission checksum')
    expect(out).toContain('deadbeefdeadbeef')
  })

  it('checksum 없으면(mission 있어도) checksum 줄 없음', () => {
    const out = md({ missionKnown: true, forbiddenHits: 0, scopeWarnings: 0 })
    expect(out).not.toContain('mission checksum')
  })

  it('하위호환 — mission 부재(intent undefined)면 checksum 줄 없음', () => {
    const out = md(undefined)
    expect(out).not.toContain('mission checksum')
  })
})

// 방향 3-④: baseSha 무결성 — 위조·오타·비커밋 SHA 를 무효 처리(거짓 stale 방지).
describe('verifyBaseSha / collectReceipt — baseSha 무결성(3-④)', () => {
  const tmpDirs: string[] = []
  afterEach(() => {
    for (const d of tmpDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true })
      } catch {
        /* 정리 실패 무시 */
      }
    }
    tmpDirs.length = 0
  })

  // 커밋 2개 + 빌드/테스트 게이트 없는 임시 git 레포 — baseSha 검증만 본다.
  function makeRepo(): { dir: string; head: string } {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-receipt-basesha-'))
    tmpDirs.push(d)
    const g = (args: string[]): void => {
      execFileSync('git', args, { cwd: d, stdio: 'pipe' })
    }
    g(['init'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    fs.writeFileSync(path.join(d, 'README.md'), 'seed\n', 'utf-8')
    g(['add', '.'])
    g(['commit', '-m', 'seed'])
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: d, encoding: 'utf-8' }).trim()
    return { dir: d, head }
  }

  it('verifyBaseSha — 실제 HEAD 커밋이면 true', () => {
    const { dir, head } = makeRepo()
    expect(verifyBaseSha(dir, head)).toBe(true)
  })

  it('verifyBaseSha — 존재하지 않는 SHA 면 false(위조·오타)', () => {
    const { dir } = makeRepo()
    expect(verifyBaseSha(dir, '0000000000000000000000000000000000000000')).toBe(false)
    expect(verifyBaseSha(dir, 'not-a-sha')).toBe(false)
  })

  it('verifyBaseSha — 커밋이 아닌 객체(tree)면 false(^{commit} 역참조 실패)', () => {
    const { dir, head } = makeRepo()
    // HEAD 의 tree SHA — 존재하는 객체지만 커밋이 아님. ^{commit} 으로 못 풀어야 정상.
    const treeSha = execFileSync('git', ['rev-parse', `${head}^{tree}`], { cwd: dir, encoding: 'utf-8' }).trim()
    expect(verifyBaseSha(dir, treeSha)).toBe(false)
  })

  // 무효 baseSha → 무효 처리(stale 미상). decision 은 임시 레포의 dirty/게이트로 오염될 수 있어
  // 단언하지 않는다 — 3-④의 직접 출력(base.sha null·staleKnown false·stale false)만 본다.
  it('collectReceipt — 무효 baseSha(--since 위조) → base.sha null · staleKnown false · stale false', () => {
    const { dir } = makeRepo()
    const r = collectReceipt(dir, '0000000000000000000000000000000000000000')
    expect(r.base.sha).toBeNull()
    expect(r.evidence.staleKnown).toBe(false)
    expect(r.evidence.stale).toBe(false) // 무효 baseSha 는 거짓 stale 을 만들지 않는다.
  }, 30_000)

  it('collectReceipt — 유효 baseSha(=HEAD) → base.sha 보존 · staleKnown true · stale=false', () => {
    const { dir, head } = makeRepo()
    const r = collectReceipt(dir, head)
    expect(r.base.sha).toBe(head)
    expect(r.evidence.staleKnown).toBe(true)
    expect(r.evidence.stale).toBe(false)
  }, 30_000)

  // RFC 0057 트랙②: collectReceipt(실 조립부) 가 detectAgent() 를 실제로 호출해 agent 를 채우는지.
  // CLAUDECODE 를 강제로 설정해 검증 — buildReceipt 의 기본값('unknown')만으로는 통과 못 하고,
  // collectReceipt 가 detectAgent() 결과를 meta 에 실제로 실어야만 'claude-code' 로 나온다.
  it('agent 필드 — collectReceipt 가 detectAgent() 를 실제로 호출해 채운다(env 강제 후 검증)', () => {
    const { dir } = makeRepo()
    const orig = process.env.CLAUDECODE
    try {
      process.env.CLAUDECODE = '1'
      const r = collectReceipt(dir)
      expect(r.agent).toBe('claude-code')
    } finally {
      if (orig === undefined) delete process.env.CLAUDECODE
      else process.env.CLAUDECODE = orig
    }
  }, 30_000)
})
