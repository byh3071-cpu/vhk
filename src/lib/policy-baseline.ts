/*
 * policy-baseline.ts — 정책 설정의 런 밖 영속 해시 베이스라인 (RFC 0066 §7.3 (1)).
 *
 * **이 검사는 `enforce` 와 무관하게 항상 동작한다.** 스위치를 지키는 자물쇠가 스위치에
 * 딸려 있으면 자물쇠가 아니기 때문이다. 설정이 꺼져 있어도 대조는 돌고, 불일치는 표시된다.
 *
 * 무엇을 얻고 무엇을 못 얻는지 (정직하게):
 *
 *   얻는 것 — policy.json 하나만 고치면 반드시 걸린다. 우발적 변조는 거의 다 잡힌다.
 *             런과 런 사이의 편집도 다음 런 시작에서 걸린다("런 도중만" 보던 사각지대가 닫힌다).
 *   못 얻는 것 — 베이스라인 파일도 같은 디스크에 있다. policy.json 과 policy-baseline.json 을
 *             **같이** 고치면 대조를 통과한다. 이 순환은 저장소 밖에 신뢰 기점이 있어야 닫히고
 *             그것은 이번 계열 범위가 아니다.
 *
 * 즉 여기서 얻는 것은 차단이 아니라 **탐지 확률**이다. 진짜 방어선은 여전히 `enforce` 가
 * 기본 off 이고 켜는 것이 사람이라는 사실이다. 그 상한을 알고 켠다.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readJsonFile } from './read-json.js'
import { POLICY_CONFIG_REL } from './policy-config.js'

export const POLICY_BASELINE_REL = join('.vhk', 'policy-baseline.json')

export interface BaselineCheck {
  /** 설정이 베이스라인과 다르다 → 자율 레인 fail-closed */
  mutated: boolean
  /** 아직 고정된 적이 없다. 변조와 구분한다 */
  baselineMissing: boolean
  reasonCode?: 'POLICY_CONFIG_MUTATED'
}

/** 설정 파일 내용 해시. 파일이 없으면 null — "없음" 도 하나의 상태다. */
function configHash(cwd: string): string | null {
  const p = join(cwd, POLICY_CONFIG_REL)
  if (!existsSync(p)) return null
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}

/**
 * 런 시작 시 대조 (§7.3).
 *
 * 설정이 아예 없으면 검사할 대상이 없다. 설정은 있는데 베이스라인이 없는 것은 아직 고정하지
 * 않은 상태이며 변조가 아니다 — 이 기능을 막 도입한 저장소를 멈춰세우지 않는다.
 * 베이스라인이 깨져 읽을 수 없으면 변조로 취급한다. 판단 불가는 통과가 아니다.
 */
export function checkPolicyBaseline(cwd: string): BaselineCheck {
  const current = configHash(cwd)
  const baselinePath = join(cwd, POLICY_BASELINE_REL)

  if (current === null && !existsSync(baselinePath)) {
    return { mutated: false, baselineMissing: true }
  }
  if (!existsSync(baselinePath)) {
    return { mutated: false, baselineMissing: true }
  }

  let recorded: unknown
  try {
    recorded = readJsonFile<unknown>(baselinePath)
  } catch {
    return { mutated: true, baselineMissing: false, reasonCode: 'POLICY_CONFIG_MUTATED' }
  }

  const expected =
    typeof recorded === 'object' && recorded !== null && 'hash' in recorded
      ? recorded.hash
      : undefined
  if (typeof expected !== 'string') {
    return { mutated: true, baselineMissing: false, reasonCode: 'POLICY_CONFIG_MUTATED' }
  }

  // 설정을 지운 경우도 여기서 걸린다 — current 가 null 이라 문자열 해시와 절대 같지 않다.
  if (current !== expected) {
    return { mutated: true, baselineMissing: false, reasonCode: 'POLICY_CONFIG_MUTATED' }
  }
  return { mutated: false, baselineMissing: false }
}

/**
 * 베이스라인 고정 — **사람 명령으로만 호출한다.** 자율 레인에는 이 경로가 없다.
 * 자율 레인이 스스로 갱신할 수 있으면 변조를 스스로 승인하는 것과 같다.
 */
export function writePolicyBaseline(cwd: string): void {
  const hash = configHash(cwd)
  const p = join(cwd, POLICY_BASELINE_REL)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, `${JSON.stringify({ hash }, null, 2)}\n`, 'utf-8')
}
