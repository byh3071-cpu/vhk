import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Command } from 'commander'
import { program } from '../src/index.js'

// 스킬 ↔ CLI 드리프트 가드 (VHK-023 / #309).
// 증상이었던 것: vhk-auto 스킬이 옛/미구현 명령(`vhk loop-brief`·`vhk remind`)을 가리켜
//   오토파일럿 앵커 단계가 unknown command 로 깨졌다(2.6.0). 명령은 이후(#273·#282, 2.7.0)
//   실제로 추가돼 스킬은 지금 정합하지만, "스킬이 부르는 명령이 실재하나"를 기계로 잡는 가드가
//   없어 재발 위험이 남아 있었다. 이 테스트가 그 구멍을 막는다 — 진실원은 commander 실등록 표면.
//
// why 추출을 "인라인 코드스팬(백틱) 안"으로 한정한다(CodeRabbit #417 Major 대응):
//   마크다운에서 명령은 항상 `vhk x` 처럼 백틱으로 감싼다. 반면 "vhk 레포 전용"·"vhk 헌법"은
//   제품명을 명사로 쓴 *산문*이다. 백틱 유무가 명령 호출 ↔ 산문을 가르는 유일하게 신뢰할 신호다.
//   그래서 토큰을 \p{L}(한글 포함)로 넓혀 별칭 참조(`vhk 리마인드`)까지 잡으면서도, 백틱 밖
//   한글 산문(vhk 레포)을 오탐하지 않는다. 컨테이너(goal·mission 등)는 서브토큰(next·check)까지
//   검증한다 — 서브 rename/삭제도 #309 와 똑같이 앵커를 깨므로(G4).
//
// 한계(정직): 이 가드는 레포의 정본 스킬(.claude/skills/*/SKILL.md)만 본다. 원래 2.6.0 사고는
//   사용자의 전역 사본(~/.claude/skills/, 버전관리 밖)이었다 — 거기까진 여기서 가드 못 한다.

const SKILLS_DIR = '.claude/skills'

// 스킬이 의도적으로 가리키는 '아직 없는' 명령(미구현·미래 비전). 실재 명령이 아니라 화이트리스트.
//  - auto: 2단계 `vhk auto`(외부 발송·이슈 등록 자동화) 비전 + 스킬 트리거 문구. 1단계 MVP 엔 미구현.
const KNOWN_UNIMPLEMENTED = new Set(['auto'])

// 인라인 코드스팬(한 줄 백틱). \n 제외라 ```펜스 블록```·산문은 매칭에서 빠진다.
const CODE_SPAN = /`([^`\n]+)`/g
// 코드스팬 안에서 `vhk <명령> [<서브>]`. \p{L} 로 첫 토큰에 한글 별칭까지 포함(u 플래그 필수).
//   서브토큰도 같은 문자셋 — 단 `--flag`·`"<인자>"` 는 [\p{L}\d] 시작이 아니라 자연히 빠진다.
const VHK_INVOCATION = /^vhk\s+([\p{L}\d][\p{L}\d-]*)(?:\s+([\p{L}\d][\p{L}\d-]*))?/u

interface Invocation {
  command: string
  sub: string | null
}

function extractInvocations(content: string): Invocation[] {
  const out: Invocation[] = []
  for (const m of content.matchAll(CODE_SPAN)) {
    const v = VHK_INVOCATION.exec(m[1].trim())
    if (v) out.push({ command: v[1], sub: v[2] ?? null })
  }
  return out
}

// 명령 이름 또는 별칭으로 commander 명령 노드를 찾는다(없으면 null) = 진짜 `vhk --help` 표면.
function findCommand(token: string): Command | null {
  return program.commands.find((c) => c.name() === token || c.aliases().includes(token)) ?? null
}

// 실재하지 않는 참조(명령 미존재 OR 컨테이너인데 서브 미존재)를 사람이 읽을 사유 문자열로 반환.
function driftReasons(content: string): string[] {
  const reasons: string[] = []
  for (const { command, sub } of extractInvocations(content)) {
    if (KNOWN_UNIMPLEMENTED.has(command)) continue
    const cmd = findCommand(command)
    if (!cmd) {
      reasons.push(`vhk ${command} — 그런 명령 없음`)
      continue
    }
    // 컨테이너(서브커맨드 보유)에 서브토큰이 붙었는데 실재 서브가 아니면 드리프트.
    // leaf 명령의 둘째 토큰은 인자(`vhk blocker "<증상>"`)라 검증 대상 아님.
    if (sub && cmd.commands.length > 0) {
      const ok = cmd.commands.some((s) => s.name() === sub || s.aliases().includes(sub))
      if (!ok) reasons.push(`vhk ${command} ${sub} — '${sub}' 서브커맨드 없음`)
    }
  }
  return [...new Set(reasons)]
}

function listSkillFiles(): { name: string; path: string }[] {
  if (!existsSync(SKILLS_DIR)) return []
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, path: join(SKILLS_DIR, d.name, 'SKILL.md') }))
    .filter((s) => existsSync(s.path))
}

describe('스킬 ↔ CLI 드리프트 가드 (VHK-023 / #309)', () => {
  const skills = listSkillFiles()

  it('스킬 파일을 실제로 찾는다 (글롭이 깨져 침묵 통과하는 것 방지)', () => {
    const names = skills.map((s) => s.name)
    expect(names, '.claude/skills/vhk-auto/SKILL.md 를 못 찾음 — 경로·체크아웃 확인').toContain(
      'vhk-auto',
    )
  })

  it('모든 SKILL.md 의 `vhk <명령> [<서브>]` 참조가 실재한다', () => {
    for (const skill of skills) {
      const reasons = driftReasons(readFileSync(skill.path, 'utf-8'))
      expect(
        reasons,
        `${skill.path} 드리프트: ${reasons.join(' / ')} — 스킬을 실재 명령으로 고치거나(권장) 미구현 비전이면 KNOWN_UNIMPLEMENTED 갱신`,
      ).toEqual([])
    }
  })

  // 메타(테스트의 테스트): 가드가 원래 버그 클래스를 진짜로 잡는지. 가짜엔 실패, 실재엔 통과해야.
  it('가드가 가짜 명령·한글 별칭·가짜 서브는 잡고, 산문·실재 참조는 통과시킨다', () => {
    // 영문 가짜 명령 → 잡음
    expect(driftReasons('`vhk ghostcmd`').length).toBeGreaterThan(0)
    // 한글 가짜 별칭 → 잡음 (CodeRabbit #417 Major 회귀 방지 — 별칭 문자셋 커버)
    expect(driftReasons('`vhk 없는별칭`').length).toBeGreaterThan(0)
    // 컨테이너 가짜 서브커맨드 → 잡음 (G4: 서브 드리프트도 #309 동일 버그류)
    expect(driftReasons('`vhk goal 없는서브`').some((r) => r.includes('없는서브'))).toBe(true)
    // 백틱 밖 산문("vhk 레포 전용"류)은 명령이 아니므로 무시 — false positive 0
    expect(driftReasons('머지만 자동 — vhk 레포 전용. 이 스킬은 vhk 헌법 의존.')).toEqual([])
    // 회귀: 실재 명령·서브·한글 별칭(`리마인드`=remind 별칭)은 전부 통과
    expect(
      driftReasons('`vhk loop-brief` `vhk remind` `vhk goal next` `vhk mission check` `vhk 리마인드`'),
    ).toEqual([])
  })
})
