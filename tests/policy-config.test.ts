import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  loadPolicyConfig,
  POLICY_CONFIG_REL,
  POLICY_SCHEMA_VERSION,
  readPolicyConfigSnapshot,
} from '../src/lib/policy-config.js'
import { removeDirSync } from '../src/lib/fs-remove.js'

/*
 * RFC 0066 §7.4 — 권한 정책 설정 로더 (124-T4 전제).
 *
 * 단일 규칙: **설정을 신뢰할 수 없으면 자율 레인 fail-closed(전부 거부) · 사람 CLI 무영향.**
 * "off 폴백"·"집행 없음" 같은 표현을 쓰지 않는 이유는 그게 "아무 일도 안 일어남"으로 읽히기
 * 때문이다. 설정이 깨졌을 때 자율 레인이 조용히 예전처럼 도는 것은 안전한 상태가 아니다.
 * 깨지면 멈춘다.
 */

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-policy-config-'))
  fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
})
afterEach(() => {
  removeDirSync(dir)
})

function write(content: string): void {
  fs.writeFileSync(path.join(dir, POLICY_CONFIG_REL), content, 'utf-8')
}

describe('policy-config 로더 (RFC 0066 §7.4)', () => {
  // 파일이 없는 것은 손상이 아니다 — 기본 off 상태이고 자율 레인은 계속 돈다.
  it('파일이 없으면 기본 off — 신뢰할 수 없는 상태가 아니다', () => {
    const c = loadPolicyConfig(dir)
    expect(c.record).toBe(false)
    expect(c.enforce).toBe(false)
    expect(c.maxLevel).toBeUndefined()
    expect(c.failClosed).toBe(false)
  })

  it('정상 설정을 읽는다', () => {
    write(JSON.stringify({ schemaVersion: POLICY_SCHEMA_VERSION, record: true, enforce: false, maxLevel: 'L2' }))
    const c = loadPolicyConfig(dir)
    expect(c.record).toBe(true)
    expect(c.enforce).toBe(false)
    expect(c.maxLevel).toBe('L2')
    expect(c.failClosed).toBe(false)
  })

  it('키가 없으면 false — 명시하지 않은 것은 꺼진 것이다', () => {
    write(JSON.stringify({ schemaVersion: POLICY_SCHEMA_VERSION }))
    const c = loadPolicyConfig(dir)
    expect(c.record).toBe(false)
    expect(c.enforce).toBe(false)
    expect(c.failClosed).toBe(false)
  })

  // enforce 는 record 를 함의한다 — 집행하면서 이력을 안 남기는 경로는 만들지 않는다(§7.1).
  it('enforce 가 켜지면 record 도 켜진 것으로 본다', () => {
    write(JSON.stringify({ schemaVersion: POLICY_SCHEMA_VERSION, enforce: true }))
    const c = loadPolicyConfig(dir)
    expect(c.enforce).toBe(true)
    expect(c.record).toBe(true)
  })

  describe('신뢰할 수 없으면 멈춘다', () => {
    it('JSON 이 깨졌으면 fail-closed', () => {
      write('{ not json')
      const c = loadPolicyConfig(dir)
      expect(c.failClosed).toBe(true)
      expect(c.reasonCode).toBe('POLICY_CONFIG_UNREADABLE')
    })

    it('대상이 끊긴 정책 링크는 파일 부재가 아니라 fail-closed다', () => {
      const policyPath = path.join(dir, POLICY_CONFIG_REL)
      try {
        fs.symlinkSync(path.join(dir, '.vhk', 'missing-policy.json'), policyPath, 'file')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EPERM') return
        throw error
      }
      const snapshot = readPolicyConfigSnapshot(dir)
      expect(snapshot.configPresent).toBe(true)
      expect(snapshot.contentHash).toBeNull()
      expect(snapshot.config).toMatchObject({
        failClosed: true,
        reasonCode: 'POLICY_CONFIG_UNREADABLE',
      })
    })

    it('record·enforce 가 boolean 이 아니면 fail-closed', () => {
      write(JSON.stringify({ schemaVersion: POLICY_SCHEMA_VERSION, enforce: 'yes' }))
      expect(loadPolicyConfig(dir).failClosed).toBe(true)
    })

    // L0~L3 밖은 "미설정" 이 아니라 판단 불가다 — 낙관 추정하지 않는다.
    it('maxLevel 이 L0~L3 밖이면 fail-closed', () => {
      write(JSON.stringify({ schemaVersion: POLICY_SCHEMA_VERSION, maxLevel: 'L9' }))
      const c = loadPolicyConfig(dir)
      expect(c.failClosed).toBe(true)
      expect(c.reasonCode).toBe('POLICY_CONFIG_INVALID_MAX_LEVEL')
    })

    it('미지원 스키마 버전이면 fail-closed', () => {
      write(JSON.stringify({ schemaVersion: POLICY_SCHEMA_VERSION + 1, enforce: false }))
      const c = loadPolicyConfig(dir)
      expect(c.failClosed).toBe(true)
      expect(c.reasonCode).toBe('POLICY_CONFIG_UNSUPPORTED_VERSION')
    })

    // fail-closed 여도 플래그는 꺼진 값으로 준다 — 깨진 설정으로 집행이 켜지면 안 된다.
    it('fail-closed 일 때 집행 플래그는 꺼진 상태다', () => {
      write('{ broken')
      const c = loadPolicyConfig(dir)
      expect(c.enforce).toBe(false)
      expect(c.record).toBe(false)
    })
  })

  // 다른 섹션(0067 의 allow·limits)이 깨져도 이 세 키는 독립 파싱된다.
  it('알 수 없는 섹션이 섞여 있어도 세 키를 읽는다', () => {
    write(JSON.stringify({
      schemaVersion: POLICY_SCHEMA_VERSION,
      record: true,
      allow: { 완전히: '깨진 모양' },
      limits: 12345,
    }))
    const c = loadPolicyConfig(dir)
    expect(c.record).toBe(true)
    expect(c.failClosed).toBe(false)
  })

  it('읽기 전용이다 — 로더가 파일을 만들지 않는다', () => {
    loadPolicyConfig(dir)
    expect(fs.existsSync(path.join(dir, POLICY_CONFIG_REL))).toBe(false)
  })
})

/*
 * RFC 0067 §3.3 — allow·limits 섹션 (125a-T2).
 *
 * limits 필수화는 적대 검증 치명 5 다. 초안은 세 값을 전부 optional 로 뒀는데,
 * 기존 evaluateBudget 은 한도가 없으면 allow 를 반환하고 시간 비교도 undefined 와의 비교라
 * 통과한다 — **한도를 안 쓰면 한도가 없어지는 fail-open** 이었다.
 * 자율 레인의 한도는 "안 쓰면 없음" 이 아니라 "안 쓰면 못 돎" 이어야 한다.
 */
describe('allow·limits 섹션 (RFC 0067 §3.3)', () => {
  const valid = {
    schemaVersion: 1,
    allow: [{ id: 'lint', bin: 'pnpm', args: ['lint'], minLevel: 'L1' }],
    limits: { perRunSec: 3600, perCommandSec: 900, perRunCommandCount: 40 },
  }

  it('정상 섹션을 읽는다', () => {
    write(JSON.stringify(valid))
    const c = loadPolicyConfig(dir)
    expect(c.allow).toHaveLength(1)
    expect(c.limits?.perRunSec).toBe(3600)
    expect(c.sectionsUsable).toBe(true)
  })

  // 섹션이 깨져도 record·enforce·maxLevel 해석은 살아 있어야 한다(0066 §7.4 독립 파싱).
  it('allow 가 깨져도 세 키는 독립 파싱된다', () => {
    write(JSON.stringify({ ...valid, record: true, allow: 'not-an-array' }))
    const c = loadPolicyConfig(dir)
    expect(c.record).toBe(true)
    expect(c.failClosed).toBe(false)
    expect(c.sectionsUsable).toBe(false) // 자율 레인만 fail-closed
  })

  it('limits 가 없으면 자율 레인 사용 불가', () => {
    write(JSON.stringify({ schemaVersion: 1, allow: valid.allow }))
    expect(loadPolicyConfig(dir).sectionsUsable).toBe(false)
  })

  it('limits 세 값 중 하나라도 없으면 사용 불가', () => {
    write(JSON.stringify({ ...valid, limits: { perRunSec: 10, perCommandSec: 5 } }))
    expect(loadPolicyConfig(dir).sectionsUsable).toBe(false)
  })

  // "안 쓰면 없음" 이 아니라 "안 쓰면 못 돎".
  it('limits 값이 0 이하면 사용 불가 — 한도가 사라지지 않는다', () => {
    write(JSON.stringify({ ...valid, limits: { ...valid.limits, perRunSec: 0 } }))
    expect(loadPolicyConfig(dir).sectionsUsable).toBe(false)
    write(JSON.stringify({ ...valid, limits: { ...valid.limits, perRunCommandCount: -1 } }))
    expect(loadPolicyConfig(dir).sectionsUsable).toBe(false)
  })

  it('allow 항목 하나가 무효면 섹션 전체 무효', () => {
    write(JSON.stringify({ ...valid, allow: [valid.allow[0], { id: 'bad', bin: 'pnpm' }] }))
    const c = loadPolicyConfig(dir)
    expect(c.allow).toEqual([])
    expect(c.sectionsUsable).toBe(false)
  })

  it('perRunUsd 는 참고 지표라 판정에 안 쓴다 — 있어도 sectionsUsable 에 영향 없음', () => {
    write(JSON.stringify({ ...valid, limits: { ...valid.limits, perRunUsd: 5 } }))
    expect(loadPolicyConfig(dir).sectionsUsable).toBe(true)
  })

  it('섹션이 아예 없으면 사용 불가 — 빈 허용목록은 전부 거부다', () => {
    write(JSON.stringify({ schemaVersion: 1, record: true }))
    const c = loadPolicyConfig(dir)
    expect(c.record).toBe(true)
    expect(c.sectionsUsable).toBe(false)
  })
})
