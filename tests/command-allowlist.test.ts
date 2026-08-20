import { describe, it, expect } from 'vitest'
import {
  normalizeBin,
  parseAllowlist,
  matchAllowEntry,
  DEFAULT_MIN_LEVEL,
  type AllowEntry,
} from '../src/lib/command-allowlist.js'

/*
 * RFC 0067 §3 — 명령 허용목록 (125a-T1).
 *
 * 셸 문자열도 패턴 매칭도 받지 않는다. **argv 토큰 배열의 정확 일치**다.
 * 매칭 로직이 배열 비교 한 줄이라 우회할 파서가 없다 — 파서를 두면 그 파서가 곧 우회 표면이 된다.
 *
 * 정규화는 Windows 때문이다. `exec.ts` 의 `resolveCmd()` 가 `pnpm` 을 `cmd.exe /d /s /c pnpm.cmd`
 * 로 재작성하므로, 집행 지점은 그 이전이어야 하고 비교는 소문자·확장자 제거·basename 기준이다.
 */

function entry(over: Partial<AllowEntry> = {}): AllowEntry {
  return { id: 'typecheck', bin: 'pnpm', args: ['typecheck'], minLevel: 'L1', ...over } as AllowEntry
}

describe('normalizeBin (§3.4)', () => {
  it('소문자로 맞춘다 — Windows 파일명은 대소문자를 구분하지 않는다', () => {
    expect(normalizeBin('PNPM')).toBe('pnpm')
  })

  it('확장자를 뗀다 — .cmd·.exe 가 붙거나 안 붙는다', () => {
    expect(normalizeBin('pnpm.cmd')).toBe('pnpm')
    expect(normalizeBin('node.exe')).toBe('node')
  })

  it('basename 만 취한다 — 호출부가 절대경로를 넘길 수 있다', () => {
    expect(normalizeBin('C:\\Program Files\\nodejs\\pnpm.cmd')).toBe('pnpm')
    expect(normalizeBin('/usr/local/bin/pnpm')).toBe('pnpm')
  })
})

describe('parseAllowlist — 섹션 단위 무효화 (§3.3)', () => {
  it('정상 목록을 읽는다', () => {
    const r = parseAllowlist([{ id: 'a', bin: 'pnpm', args: ['lint'], minLevel: 'L1' }])
    expect(r.ok).toBe(true)
    expect(r.entries).toHaveLength(1)
  })

  it('배열이 아니면 무효', () => {
    expect(parseAllowlist({ nope: true }).ok).toBe(false)
  })

  // 부분 로드는 "내가 쓴 3개 중 2개만 살아 있는데 어느 게 죽었는지 모르는" 상태를 만든다.
  it('항목 하나만 무효여도 섹션 전체를 무효화한다', () => {
    const r = parseAllowlist([
      { id: 'ok', bin: 'pnpm', args: ['lint'], minLevel: 'L1' },
      { id: 'bad', bin: 'pnpm' }, // args 없음
    ])
    expect(r.ok).toBe(false)
    expect(r.entries).toEqual([])
  })

  it('id 중복이면 섹션 전체 무효', () => {
    const r = parseAllowlist([
      { id: 'dup', bin: 'pnpm', args: ['lint'], minLevel: 'L1' },
      { id: 'dup', bin: 'pnpm', args: ['test'], minLevel: 'L1' },
    ])
    expect(r.ok).toBe(false)
  })

  it('minLevel 이 L0~L3 밖이면 섹션 전체 무효', () => {
    expect(parseAllowlist([{ id: 'a', bin: 'pnpm', args: [], minLevel: 'L9' }]).ok).toBe(false)
  })

  // 사람이 명시하지 않은 명령은 가장 높은 단계에서만 돈다 — fail-closed(중대 11).
  it('minLevel 미지정이면 기본값이 L3 다', () => {
    const r = parseAllowlist([{ id: 'a', bin: 'pnpm', args: ['lint'] }])
    expect(r.ok).toBe(true)
    expect(r.entries[0].minLevel).toBe(DEFAULT_MIN_LEVEL)
    expect(DEFAULT_MIN_LEVEL).toBe('L3')
  })

  it('bin 에 경로 구분자나 상위 참조가 있으면 무효', () => {
    expect(parseAllowlist([{ id: 'a', bin: '../evil', args: [], minLevel: 'L1' }]).ok).toBe(false)
    expect(parseAllowlist([{ id: 'a', bin: 'dir/cmd', args: [], minLevel: 'L1' }]).ok).toBe(false)
    expect(parseAllowlist([{ id: 'a', bin: 'C:\\x\\y', args: [], minLevel: 'L1' }]).ok).toBe(false)
  })

  it('빈 args 배열은 허용한다', () => {
    expect(parseAllowlist([{ id: 'a', bin: 'node', args: [], minLevel: 'L1' }]).ok).toBe(true)
  })

  it('빈 목록도 유효하다 — 기본값이 빈 목록이다(§12 Q1)', () => {
    const r = parseAllowlist([])
    expect(r.ok).toBe(true)
    expect(r.entries).toEqual([])
  })
})

describe('matchAllowEntry — argv 토큰 정확 일치 (§3.1~3.2)', () => {
  const list = [entry(), entry({ id: 'test', args: ['test:run'] })]

  it('bin·args 가 전부 같아야 매칭된다', () => {
    expect(matchAllowEntry(list, 'pnpm', ['typecheck'])?.id).toBe('typecheck')
  })

  it('정규화된 bin 으로 매칭된다 — Windows shim 경로도 통과', () => {
    expect(matchAllowEntry(list, 'PNPM.CMD', ['typecheck'])?.id).toBe('typecheck')
  })

  // 접두사 일치를 쓰면 pnpm publish 가 통과한다. 발행은 사람만 하는 일이다.
  it('인자가 하나라도 더 붙으면 매칭되지 않는다', () => {
    expect(matchAllowEntry(list, 'pnpm', ['typecheck', '--watch'])).toBeNull()
  })

  it('인자가 빠져도 매칭되지 않는다', () => {
    expect(matchAllowEntry(list, 'pnpm', [])).toBeNull()
  })

  it('순서가 다르면 매칭되지 않는다', () => {
    const l = [entry({ args: ['a', 'b'] })]
    expect(matchAllowEntry(l, 'pnpm', ['b', 'a'])).toBeNull()
  })

  it('다른 bin 이면 매칭되지 않는다', () => {
    expect(matchAllowEntry(list, 'npm', ['typecheck'])).toBeNull()
  })

  it('빈 목록에는 아무것도 매칭되지 않는다 — fail-closed', () => {
    expect(matchAllowEntry([], 'pnpm', ['typecheck'])).toBeNull()
  })

  // 와일드카드·정규식이 없다는 것을 문자 그대로 고정한다.
  it('args 의 별표는 리터럴이지 와일드카드가 아니다', () => {
    const l = [entry({ args: ['*'] })]
    expect(matchAllowEntry(l, 'pnpm', ['*'])?.id).toBe('typecheck')
    expect(matchAllowEntry(l, 'pnpm', ['anything'])).toBeNull()
  })
})
