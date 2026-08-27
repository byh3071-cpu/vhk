import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  checkPolicyBaseline,
  writePolicyBaseline,
  POLICY_BASELINE_REL,
} from '../src/lib/policy-baseline.js'
import { POLICY_CONFIG_REL } from '../src/lib/policy-config.js'
import { removeDirSync } from '../src/lib/fs-remove.js'

/*
 * RFC 0066 §7.3 (1) — 런 밖 영속 해시 베이스라인.
 *
 * 이 검사는 `enforce` 와 **무관하게 항상 동작한다.** 스위치를 지키는 자물쇠가 스위치에
 * 딸려 있으면 자물쇠가 아니기 때문이다.
 *
 * 완전 방어가 아니라는 것도 명시돼 있다. 베이스라인 파일도 같은 디스크에 있어서 두 파일을
 * 같이 고치면 대조를 통과한다. 여기서 얻는 것은 **탐지 확률**이다 — 파일 하나만 고치면
 * 반드시 걸리고, 우발적 변조는 거의 다 잡힌다.
 */

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-policy-baseline-'))
  fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
})
afterEach(() => {
  removeDirSync(dir)
})

function writeConfig(content: string): void {
  fs.writeFileSync(path.join(dir, POLICY_CONFIG_REL), content, 'utf-8')
}

describe('정책 설정 해시 베이스라인 (RFC 0066 §7.3)', () => {
  it('설정 파일이 없으면 검사할 것도 없다', () => {
    expect(checkPolicyBaseline(dir)).toMatchObject({
      mutated: false,
      baselineMissing: true,
      configPresent: false,
    })
  })

  // 설정은 있는데 베이스라인이 없는 상태 — 아직 고정되지 않았다.
  it('베이스라인이 없으면 변조로 보지 않는다', () => {
    writeConfig('{"schemaVersion":1}')
    const r = checkPolicyBaseline(dir)
    expect(r.mutated).toBe(false)
    expect(r.baselineMissing).toBe(true)
    expect(r.configPresent).toBe(true)
  })

  it('고정한 뒤 그대로면 통과', () => {
    writeConfig('{"schemaVersion":1,"enforce":false}')
    writePolicyBaseline(dir)
    expect(checkPolicyBaseline(dir).mutated).toBe(false)
  })

  // 런과 런 사이에 파일이 바뀌면 다음 런 시작에서 걸린다 — "런 도중만" 보던 사각지대가 닫힌다.
  it('설정이 바뀌면 변조로 잡는다', () => {
    writeConfig('{"schemaVersion":1,"enforce":false}')
    writePolicyBaseline(dir)
    writeConfig('{"schemaVersion":1,"enforce":true}')
    const r = checkPolicyBaseline(dir)
    expect(r.mutated).toBe(true)
    expect(r.reasonCode).toBe('POLICY_CONFIG_MUTATED')
  })

  it('공백만 바뀌어도 잡는다 — 내용 해시다', () => {
    writeConfig('{"schemaVersion":1}')
    writePolicyBaseline(dir)
    writeConfig('{ "schemaVersion": 1 }')
    expect(checkPolicyBaseline(dir).mutated).toBe(true)
  })

  it('설정을 지워도 잡는다', () => {
    writeConfig('{"schemaVersion":1}')
    writePolicyBaseline(dir)
    fs.unlinkSync(path.join(dir, POLICY_CONFIG_REL))
    expect(checkPolicyBaseline(dir).mutated).toBe(true)
  })

  it('사람이 설정 부재를 다시 고정하면 default-off가 정상 상태가 된다', () => {
    writeConfig('{"schemaVersion":1,"record":true}')
    writePolicyBaseline(dir)
    fs.unlinkSync(path.join(dir, POLICY_CONFIG_REL))
    expect(checkPolicyBaseline(dir).mutated).toBe(true)

    writePolicyBaseline(dir)
    expect(checkPolicyBaseline(dir)).toMatchObject({
      configPresent: false,
      mutated: false,
      baselineMissing: false,
    })
    expect(JSON.parse(fs.readFileSync(path.join(dir, POLICY_BASELINE_REL), 'utf-8'))).toEqual({ hash: null })
  })

  it('default-off 기준선 뒤 설정이 다시 생기면 변조로 잡는다', () => {
    writePolicyBaseline(dir)
    writeConfig('{"schemaVersion":1,"record":false}')
    expect(checkPolicyBaseline(dir).mutated).toBe(true)
  })

  it('베이스라인이 깨졌으면 변조로 취급한다 — 판단 불가는 통과가 아니다', () => {
    writeConfig('{"schemaVersion":1}')
    fs.writeFileSync(path.join(dir, POLICY_BASELINE_REL), '{ broken', 'utf-8')
    expect(checkPolicyBaseline(dir).mutated).toBe(true)
  })

  it('라이브러리 writer 직접 호출도 손상 설정을 신뢰 기준으로 고정하지 않는다', () => {
    writeConfig('{ broken')
    expect(() => writePolicyBaseline(dir)).toThrow()
    expect(fs.existsSync(path.join(dir, POLICY_BASELINE_REL))).toBe(false)
  })

  it('hash가 null·SHA-256 문자열 외 타입이면 fail-closed', () => {
    for (const invalid of [123, false, '짧은해시']) {
      fs.writeFileSync(path.join(dir, POLICY_BASELINE_REL), JSON.stringify({ hash: invalid }), 'utf-8')
      expect(checkPolicyBaseline(dir).mutated).toBe(true)
    }
  })

  it('갱신하면 다시 통과한다 — 갱신은 사람 명령으로만', () => {
    writeConfig('{"schemaVersion":1,"enforce":false}')
    writePolicyBaseline(dir)
    writeConfig('{"schemaVersion":1,"enforce":true}')
    expect(checkPolicyBaseline(dir).mutated).toBe(true)
    writePolicyBaseline(dir)
    expect(checkPolicyBaseline(dir).mutated).toBe(false)
  })

  it('베이스라인 파일은 비추적 대상 경로에 쓴다', () => {
    expect(POLICY_BASELINE_REL).toContain('.vhk')
    writeConfig('{"schemaVersion":1}')
    writePolicyBaseline(dir)
    expect(fs.existsSync(path.join(dir, POLICY_BASELINE_REL))).toBe(true)
  })
})
