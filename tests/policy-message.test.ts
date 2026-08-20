import { describe, it, expect } from 'vitest'
import { ko } from '../src/i18n/ko.js'

/*
 * RFC 0066 은 원장 라인에 사람 문장·원문을 넣지 말라고 한다 — 공개 경계가 라인마다 새로 생기기
 * 때문이다. 그건 **기록**의 규칙이고 **화면 출력**은 별개다.
 *
 * 코드만 노출하면 `LEDGER_EMPTY` 를 보고 사람이 무슨 상태인지 알 수 없다.
 * 코드를 없애지 않고(추적성) 한 줄 설명을 붙인다(가독성).
 */

const REASON_CODES = [
  'LEDGER_EMPTY',
  'NO_NEW_JUDGED_RUN',
  'INSUFFICIENT_SAMPLE',
  'DEMOTE_ROLLING_FAILURES',
  'INFRA_ABUSE_SUSPECTED',
  'SELF_REPORT_GAP',
  'PROMOTE_ROLLING_CLEAN',
  'HOLD_HYSTERESIS',
]

describe('policy 출력 가독성', () => {
  it('판정 사유 코드 전부에 사람이 읽을 설명이 있다', () => {
    for (const code of REASON_CODES) {
      const text = ko.policy.levelReason(code)
      expect(text).not.toBe('사유 미상')
      expect(text.length).toBeGreaterThan(5)
    }
  })

  it('모르는 코드는 조용히 빈 문자열이 아니라 미상으로 표시한다', () => {
    expect(ko.policy.levelReason('WHAT_IS_THIS')).toBe('사유 미상')
  })

  // 코드를 지우면 원장 라인과 화면을 대조할 수 없다 — 추적성이 끊긴다.
  it('설명을 붙이되 코드 자체는 출력에 남는다', () => {
    const line = ko.policy.currentLevel('L1', 'LEDGER_EMPTY')
    expect(line).toContain('LEDGER_EMPTY')
    expect(line).toContain('판정 이력이 없어')
  })
})
