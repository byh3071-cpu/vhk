import { describe, it, expect } from 'vitest'
import { preflight, exitCodeOf, type PreflightContext } from '../src/lib/execution-preflight.js'
import type { AllowEntry } from '../src/lib/command-allowlist.js'

/*
 * RFC 0067 §4 — 실행 전 결정론 검사 (125a-T5).
 *
 * 순서가 계약이다: 중단신호 → 허용목록 → 호출수 → 시간 → 권한단계.
 * 단락 평가라 첫 거부에서 멈춘다.
 *
 * ⑤가 마지막인 이유(치명 9): 단계 검사를 하드리밋보다 앞에 두면 require-human 이 먼저
 * 반환돼 예산·시간이 한 번도 계산되지 않은 채 사람이 승인한다. 사람이 "응" 한 순간
 * 한도 없는 실행이 된다. ①~④는 사람 승인으로도 풀리지 않는다.
 */

const allowlist: AllowEntry[] = [
  { id: 'lint', bin: 'pnpm', args: ['lint'], minLevel: 'L1' },
  { id: 'deploy', bin: 'pnpm', args: ['deploy'], minLevel: 'L3' },
]

function ctx(over: Partial<PreflightContext> = {}): PreflightContext {
  return {
    hardStopActive: false,
    allowlist,
    limits: { perRunSec: 3600, perCommandSec: 900, perRunCommandCount: 40 },
    level: 'L2',
    runCommandCount: 0,
    startedAtUtc: '2026-08-21T00:00:00.000Z',
    lastSeenUtc: '2026-08-21T00:00:00.000Z',
    nowUtc: '2026-08-21T00:05:00.000Z',
    ...over,
  }
}

describe('판정 순서 — 단락 평가 (§4.4)', () => {
  it('전부 통과하면 allow', () => {
    const r = preflight({ bin: 'pnpm', args: ['lint'] }, ctx())
    expect(r.verdict).toBe('allow')
    expect(r.reasonCode).toBe('PREFLIGHT_PASSED')
    expect(r.matchedId).toBe('lint')
    expect(r.commandCapSec).toBe(900)
  })

  // ①이 첫 자리 — HARD_STOP 은 최상위 트립와이어다. 사람만 해제한다.
  it('중단 신호가 최우선 — 허용목록에 있어도 거부', () => {
    const r = preflight({ bin: 'pnpm', args: ['lint'] }, ctx({ hardStopActive: true }))
    expect(r.reasonCode).toBe('HARD_STOP_ACTIVE')
  })

  it('중단 신호는 허용목록에 없는 명령보다도 먼저 잡힌다', () => {
    const r = preflight({ bin: 'rm', args: ['-rf'] }, ctx({ hardStopActive: true }))
    expect(r.reasonCode).toBe('HARD_STOP_ACTIVE')
  })

  it('허용목록에 없으면 거부', () => {
    const r = preflight({ bin: 'rm', args: ['-rf', '/'] }, ctx())
    expect(r.verdict).toBe('deny')
    expect(r.reasonCode).toBe('NOT_IN_ALLOWLIST')
  })

  it('호출 수 상한에 도달하면 거부', () => {
    const r = preflight({ bin: 'pnpm', args: ['lint'] }, ctx({ runCommandCount: 40 }))
    expect(r.reasonCode).toBe('CALL_BUDGET_EXCEEDED')
  })

  it('런 시간이 다 됐으면 거부', () => {
    const r = preflight({ bin: 'pnpm', args: ['lint'] }, ctx({ nowUtc: '2026-08-21T02:00:00.000Z' }))
    expect(r.reasonCode).toBe('TIME_LIMIT_EXCEEDED')
  })

  // 끝날 수 없는 명령은 시작하지 않는다 — 어차피 죽일 실행에 토큰과 시계를 쓰지 않는다.
  it('이번 명령이 끝날 수 없으면 띄우기 전에 거부', () => {
    const r = preflight({ bin: 'pnpm', args: ['lint'] }, ctx({ nowUtc: '2026-08-21T00:50:00.000Z' }))
    expect(r.reasonCode).toBe('TIME_LIMIT_WOULD_EXCEED')
  })

  it('권한 단계가 모자라면 require-human', () => {
    const r = preflight({ bin: 'pnpm', args: ['deploy'] }, ctx({ level: 'L2' }))
    expect(r.verdict).toBe('require-human')
    expect(r.reasonCode).toBe('LEVEL_TOO_LOW')
  })

  it('단계가 충분하면 통과', () => {
    const r = preflight({ bin: 'pnpm', args: ['deploy'] }, ctx({ level: 'L3' }))
    expect(r.verdict).toBe('allow')
  })
})

describe('치명 9 — 하드리밋이 사람 승인보다 먼저다', () => {
  // 단계가 모자라면서 예산도 넘은 경우. 순서가 뒤바뀌면 require-human 이 나오고,
  // 사람이 승인하는 순간 한도 없는 실행이 된다.
  it('단계 부족 + 호출 수 초과 → 사람이 못 푸는 거부가 나온다', () => {
    const r = preflight({ bin: 'pnpm', args: ['deploy'] }, ctx({ level: 'L1', runCommandCount: 40 }))
    expect(r.verdict).toBe('deny')
    expect(r.reasonCode).toBe('CALL_BUDGET_EXCEEDED')
  })

  it('단계 부족 + 시간 초과 → 거부', () => {
    const r = preflight(
      { bin: 'pnpm', args: ['deploy'] },
      ctx({ level: 'L1', nowUtc: '2026-08-21T02:00:00.000Z' }),
    )
    expect(r.verdict).toBe('deny')
  })

  it('이상 시계는 단계와 무관하게 거부', () => {
    const r = preflight({ bin: 'pnpm', args: ['lint'] }, ctx({ clockAnomaly: true }))
    expect(r.verdict).toBe('deny')
    expect(r.reasonCode).toBe('CLOCK_ANOMALY')
  })
})

describe('종료 코드 (§4.3)', () => {
  // require-human 을 0 으로 두면 호출부가 종료 코드만 보고 진행해 승인 절차가 생략된다.
  it('require-human 은 0 이 아니다', () => {
    expect(exitCodeOf('allow')).toBe(0)
    expect(exitCodeOf('require-human')).toBe(2)
    expect(exitCodeOf('deny')).toBe(1)
  })
})

describe('결정론 (§4.5)', () => {
  it('같은 입력에 항상 같은 결과', () => {
    const req = { bin: 'pnpm', args: ['lint'] }
    const a = preflight(req, ctx())
    const b = preflight(req, ctx())
    expect(a).toEqual(b)
  })

  it('빈 허용목록에는 아무것도 통과하지 않는다 — fail-closed', () => {
    const r = preflight({ bin: 'pnpm', args: ['lint'] }, ctx({ allowlist: [] }))
    expect(r.reasonCode).toBe('NOT_IN_ALLOWLIST')
  })
})
