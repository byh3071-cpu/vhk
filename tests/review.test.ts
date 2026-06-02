import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  parseCompletionChecks,
  crossCheck,
  review,
  REVIEW_DISCLAIMER,
  COVERAGE_MIN,
  STALE_AGE_MS,
  type CompletionCheck,
} from '../src/commands/review.js'
import type { GateResult, ReportStatus, VerifyReport } from '../src/commands/verify.js'
import { routeNaturalLanguage } from '../src/lib/nlp-router.js'
import { dispatchNlpRoute } from '../src/lib/nlp-run.js'
import { KNOWN_COMMAND_TOKENS } from '../src/lib/cli-args.js'

const GEN_AT = '2026-06-02T00:00:00.000Z'
const FRESH = Date.parse(GEN_AT) // crossCheck(now=FRESH) → age 0 (신선)

function gate(id: GateResult['id'], status: GateResult['status'], exitCode: number | null = 0): GateResult {
  return { id, label: id, status, exitCode, skipped: status === 'skip' }
}

function report(status: ReportStatus, gates: GateResult[], generatedAt: string = GEN_AT): VerifyReport {
  return {
    schemaVersion: 1,
    generatedAt,
    date: '2026-06-02',
    status,
    summary: {
      total: gates.length,
      pass: gates.filter((g) => g.status === 'pass').length,
      fail: gates.filter((g) => g.status === 'fail').length,
      skip: gates.filter((g) => g.status === 'skip').length,
    },
    gates,
    nextActions: [],
  }
}

const checked = (text: string): CompletionCheck => ({ text, checked: true })

describe('review — parseCompletionChecks', () => {
  const body = `# Goal

## Completion Check
- [x] 타입 체크 통과
- [ ] 빌드 통과
-  [X]  테스트 추가됨

## 제외 범위
- [ ] 이건 다른 섹션 — 무시돼야 함
`
  it('Completion Check 섹션의 체크박스만 파싱 (다음 heading 에서 종료)', () => {
    const checks = parseCompletionChecks(body)
    expect(checks).toHaveLength(3)
    expect(checks[0]).toEqual({ text: '타입 체크 통과', checked: true })
    expect(checks[1]).toEqual({ text: '빌드 통과', checked: false })
    expect(checks[2]).toEqual({ text: '테스트 추가됨', checked: true })
    expect(checks.some((c) => c.text.includes('다른 섹션'))).toBe(false)
  })
  it('Completion Check 섹션 없으면 빈 배열', () => {
    expect(parseCompletionChecks('# Goal\n본문만 있음')).toEqual([])
  })
})

describe('review — crossCheck (순수)', () => {
  it('완료조건 전부 체크 + 실제 게이트 FAIL → 거짓완료 의심 (비-trivial 회귀 가드)', () => {
    const r = crossCheck([checked('테스트 통과 + 회귀 0')], 'DONE', report('FAIL', [gate('test', 'fail', 1)]), FRESH)
    expect(r.suspicions.length).toBeGreaterThan(0)
    expect(r.suspicions.some((s) => /FAIL|모순/.test(s.reason))).toBe(true)
    expect(r.confidence).toBe('low')
  })

  it('status DONE 인데 verify FAIL → 강한 의심 (전역 신호)', () => {
    const r = crossCheck([], 'DONE', report('FAIL', [gate('build', 'fail', 1)]), FRESH)
    expect(r.suspicions.some((s) => /DONE/.test(s.check))).toBe(true)
  })

  it('체크된 테스트 항목인데 test 게이트 skip → 의심', () => {
    const r = crossCheck([checked('테스트 추가')], 'IN_PROGRESS', report('WARN', [gate('test', 'skip', null)]), FRESH)
    expect(r.suspicions.some((s) => /skip/.test(s.reason))).toBe(true)
  })

  it('전 게이트 pass + 매핑 충분 + 신선 → confidence high + disclaimer', () => {
    const gates = [gate('typecheck', 'pass'), gate('test', 'pass'), gate('build', 'pass')]
    const r = crossCheck([checked('tsc 통과'), checked('테스트 통과'), checked('빌드 통과')], 'IN_PROGRESS', report('PASS', gates), FRESH)
    expect(r.suspicions).toHaveLength(0)
    expect(r.coverage).toBe(1)
    expect(r.confidence).toBe('high')
    expect(r.disclaimer).toBe(REVIEW_DISCLAIMER)
    expect(r.disclaimer).toMatch(/보장이 아니|미검증/)
  })

  it('coverage < 0.5 → confidence high 금지(medium 캡), unmapped 카운트', () => {
    // 1 매핑(tsc) + 2 미검증 → coverage 1/3 < COVERAGE_MIN
    const r = crossCheck(
      [checked('tsc 통과'), checked('문서 업데이트'), checked('UX 개선 적용')],
      'IN_PROGRESS',
      report('PASS', [gate('typecheck', 'pass')]),
      FRESH
    )
    expect(r.suspicions).toHaveLength(0)
    expect(r.coverage).toBeLessThan(COVERAGE_MIN)
    expect(r.unmappedCount).toBe(2)
    expect(r.confidence).toBe('medium')
  })

  it('증거 stale(>6h) → confidence high 금지(medium 캡)', () => {
    const gates = [gate('typecheck', 'pass'), gate('test', 'pass')]
    const r = crossCheck([checked('tsc 통과'), checked('테스트 통과')], 'IN_PROGRESS', report('PASS', gates), FRESH + STALE_AGE_MS + 1000)
    expect(r.freshness.stale).toBe(true)
    expect(r.confidence).toBe('medium')
  })

  it('generatedAt 파싱 불가 → 신선도 미확인 → high 금지', () => {
    const r = crossCheck([checked('tsc 통과')], 'IN_PROGRESS', report('PASS', [gate('typecheck', 'pass')], 'not-a-date'), FRESH)
    expect(r.freshness.confirmed).toBe(false)
    expect(r.confidence).not.toBe('high')
  })

  it('체크된 완료조건 0개 → vacuous, confidence high 아님', () => {
    const r = crossCheck([{ text: '테스트 통과', checked: false }], 'NOT_STARTED', report('PASS', [gate('test', 'pass')]), FRESH)
    expect(r.checkedCount).toBe(0)
    expect(r.confidence).not.toBe('high')
    expect(r.reprompt).toMatch(/vacuous|없습니다/)
  })

  it('미체크 항목은 의심 대상 아님', () => {
    const r = crossCheck([{ text: '테스트 통과', checked: false }], 'IN_PROGRESS', report('FAIL', [gate('test', 'fail', 1)]), FRESH)
    expect(r.suspicions).toHaveLength(0)
  })
})

describe('review — 통합 (verify.test 패턴)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.exitCode = 0
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  function seedGoal(d: string, id: number, status: string, checks: string[]): void {
    fs.mkdirSync(path.join(d, 'goals'), { recursive: true })
    const body = `---
vhk_format: 1
type: goal
id: ${id}
title: probe
status: ${status}
---

# probe

## Completion Check
${checks.map((c) => `- [x] ${c}`).join('\n')}
`
    fs.writeFileSync(path.join(d, 'goals', `${id}-probe.md`), body, 'utf-8')
  }

  function seedReport(d: string, r: VerifyReport): void {
    fs.mkdirSync(path.join(d, '.vhk', 'reports'), { recursive: true })
    fs.writeFileSync(path.join(d, '.vhk', 'reports', 'latest.json'), JSON.stringify(r, null, 2), 'utf-8')
  }

  it('거짓완료(체크됨 + FAIL) → exit 1 + latest.json 에 review 섹션 병합', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-review-'))
    seedGoal(d, 9, 'DONE', ['테스트 통과 + 회귀 0', '빌드 통과'])
    seedReport(d, report('FAIL', [gate('test', 'fail', 1), gate('build', 'pass')]))
    process.chdir(d)
    await review({ id: '9' })
    expect(process.exitCode).toBe(1)
    const merged = JSON.parse(fs.readFileSync(path.join(d, '.vhk', 'reports', 'latest.json'), 'utf-8'))
    expect(merged.review).toBeTruthy()
    expect(merged.review.suspicions.length).toBeGreaterThan(0)
    expect(merged.review.disclaimer).toMatch(/보장/)
    expect(merged.review.freshness).toBeTruthy()
    expect(typeof merged.review.coverage).toBe('number')
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('latest.json 없으면 안내 + exit 1 + 새 증거 미생성', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-review-'))
    seedGoal(d, 9, 'IN_PROGRESS', ['테스트 통과'])
    process.chdir(d)
    await review({ id: '9' })
    expect(process.exitCode).toBe(1)
    expect(fs.existsSync(path.join(d, '.vhk', 'reports', 'latest.json'))).toBe(false)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('review 섹션에 시크릿 누출 0', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-review-'))
    seedGoal(d, 9, 'IN_PROGRESS', ['tsc 통과'])
    seedReport(d, report('PASS', [gate('typecheck', 'pass')]))
    process.chdir(d)
    await review({ id: '9' })
    const raw = fs.readFileSync(path.join(d, '.vhk', 'reports', 'latest.json'), 'utf-8')
    expect(raw).not.toMatch(/AKIA|BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]/)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  // ── exit code 정책 고정 ──
  it('confidence high(신선+커버리지 충분) → exit 0', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-review-'))
    seedGoal(d, 9, 'IN_PROGRESS', ['tsc 통과', '테스트 통과', '빌드 통과'])
    // generatedAt 을 now 로 → 신선. 전 게이트 pass → 의심 0, coverage 1.
    const fresh = report('PASS', [gate('typecheck', 'pass'), gate('test', 'pass'), gate('build', 'pass')], new Date().toISOString())
    seedReport(d, fresh)
    process.chdir(d)
    await review({ id: '9' })
    expect(process.exitCode).toBe(0)
    const merged = JSON.parse(fs.readFileSync(path.join(d, '.vhk', 'reports', 'latest.json'), 'utf-8'))
    expect(merged.review.confidence).toBe('high')
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('증거 불충분(미검증 다수 → coverage 낮음, 의심 0) → exit 1 (통과 취급 안 함)', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-review-'))
    seedGoal(d, 9, 'IN_PROGRESS', ['tsc 통과', '문서 업데이트', 'UX 개선'])
    seedReport(d, report('PASS', [gate('typecheck', 'pass')], new Date().toISOString()))
    process.chdir(d)
    await review({ id: '9' })
    expect(process.exitCode).toBe(1)
    const merged = JSON.parse(fs.readFileSync(path.join(d, '.vhk', 'reports', 'latest.json'), 'utf-8'))
    expect(merged.review.suspicions).toHaveLength(0)
    expect(merged.review.confidence).not.toBe('high')
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('stale 증거(의심 0, 커버리지 충분이라도) → exit 1', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-review-'))
    seedGoal(d, 9, 'IN_PROGRESS', ['tsc 통과'])
    // generatedAt 옛날 → stale → high 금지 → exit 1.
    seedReport(d, report('PASS', [gate('typecheck', 'pass')], '2020-01-01T00:00:00.000Z'))
    process.chdir(d)
    await review({ id: '9' })
    expect(process.exitCode).toBe(1)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('vacuous(체크 0) → exit 0', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-review-'))
    fs.mkdirSync(path.join(d, 'goals'), { recursive: true })
    fs.writeFileSync(
      path.join(d, 'goals', '9-x.md'),
      '---\nvhk_format: 1\ntype: goal\nid: 9\ntitle: x\nstatus: IN_PROGRESS\n---\n# x\n## Completion Check\n- [ ] 아직 미체크\n',
      'utf-8'
    )
    seedReport(d, report('PASS', [gate('typecheck', 'pass')], new Date().toISOString()))
    process.chdir(d)
    await review({ id: '9' })
    expect(process.exitCode).toBe(0)
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('자연어 경로(dispatchNlpRoute)로 review 실제 실행 → latest.json 에 review 병합', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-review-'))
    seedGoal(d, 9, 'IN_PROGRESS', ['tsc 통과'])
    seedReport(d, report('PASS', [gate('typecheck', 'pass')], new Date().toISOString()))
    process.chdir(d)
    await dispatchNlpRoute({ command: 'review', explanation: '', confidence: 'high' }, '거짓완료 없는지 검토해')
    const merged = JSON.parse(fs.readFileSync(path.join(d, '.vhk', 'reports', 'latest.json'), 'utf-8'))
    expect(merged.review).toBeTruthy()
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('review — 라우팅 (자연어/commander 둘 다)', () => {
  it('KNOWN_COMMAND_TOKENS 에 review/검토 → vhk review·vhk 검토 가 commander 로 (NLP 오탐 방지)', () => {
    expect(KNOWN_COMMAND_TOKENS.has('review')).toBe(true)
    expect(KNOWN_COMMAND_TOKENS.has('검토')).toBe(true)
  })
  it('자연어 → review 라우팅', () => {
    expect(routeNaturalLanguage('거짓완료 없는지 검토해')?.command).toBe('review')
    expect(routeNaturalLanguage('적대 검증해줘')?.command).toBe('review')
    expect(routeNaturalLanguage('검토')?.command).toBe('review')
  })
})
