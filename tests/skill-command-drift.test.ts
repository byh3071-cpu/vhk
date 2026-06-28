import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { program } from '../src/index.js'

// 스킬 ↔ CLI 드리프트 가드 (VHK-023 / #309).
// 증상이었던 것: vhk-auto 스킬이 옛/미구현 명령(`vhk loop-brief`·`vhk remind`)을 가리켜
//   오토파일럿 앵커 단계가 unknown command 로 깨졌다(2.6.0). 명령은 이후(#273·#282, 2.7.0)
//   실제로 추가돼 스킬은 지금 정합하지만, "스킬이 부르는 명령이 실재하나"를 기계로 잡는 가드가
//   없어 재발 위험이 남아 있었다. 이 테스트가 그 구멍을 막는다 — 진실원은 commander 실등록 표면.
//
// 한계(정직): 이 가드는 레포의 정본 스킬(.claude/skills/*/SKILL.md)만 본다. 원래 2.6.0 사고는
//   사용자의 전역 사본(~/.claude/skills/, 버전관리 밖)이었다 — 거기까진 여기서 가드 못 한다.

const SKILLS_DIR = '.claude/skills'

// 스킬이 의도적으로 가리키는 '아직 없는' 명령(미구현·미래 비전). 실재 명령이 아니라 화이트리스트.
//  - auto: 2단계 `vhk auto`(외부 발송·이슈 등록 자동화) 비전 + 스킬 트리거 문구. 1단계 MVP 엔 미구현.
const KNOWN_UNIMPLEMENTED = new Set(['auto'])

/** commander 에 실제 등록된 top-level 명령 + 별칭 = 진짜 `vhk --help` 표면. */
function liveCommandSurface(): Set<string> {
  const names = new Set<string>()
  for (const c of program.commands) {
    names.add(c.name())
    for (const a of c.aliases()) names.add(a)
  }
  return names
}

/**
 * SKILL.md 본문에서 `vhk <token>` 의 첫 토큰을 추출.
 * `\s+` 덕에 `.vhk/loop-brief.md` 경로나 스킬명 `vhk-auto`(공백 없음)는 잡히지 않는다.
 */
function extractVhkCommands(content: string): string[] {
  const out: string[] = []
  const re = /\bvhk\s+([a-z][a-z-]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) out.push(m[1])
  return out
}

/** 실재하지도, 화이트리스트에도 없는 참조 명령만 반환(중복 제거·등장 순서 유지). */
function unknownCommands(content: string, surface: Set<string>): string[] {
  return [...new Set(extractVhkCommands(content))].filter(
    (cmd) => !surface.has(cmd) && !KNOWN_UNIMPLEMENTED.has(cmd),
  )
}

function listSkillFiles(): { name: string; path: string }[] {
  if (!existsSync(SKILLS_DIR)) return []
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, path: join(SKILLS_DIR, d.name, 'SKILL.md') }))
    .filter((s) => existsSync(s.path))
}

describe('스킬 ↔ CLI 드리프트 가드 (VHK-023 / #309)', () => {
  const surface = liveCommandSurface()
  const skills = listSkillFiles()

  it('스킬 파일을 실제로 찾는다 (글롭이 깨져 침묵 통과하는 것 방지)', () => {
    const names = skills.map((s) => s.name)
    expect(names, '.claude/skills/vhk-auto/SKILL.md 를 못 찾음 — 경로·체크아웃 확인').toContain(
      'vhk-auto',
    )
  })

  it('모든 SKILL.md 의 `vhk <명령>` 참조가 실재 명령이다', () => {
    for (const skill of skills) {
      const content = readFileSync(skill.path, 'utf-8')
      const unknown = unknownCommands(content, surface)
      expect(
        unknown,
        `${skill.path} 가 실재하지 않는 명령 참조: ${unknown.join(', ')} — 스킬을 실재 명령으로 고치거나(권장) 미구현 비전이면 KNOWN_UNIMPLEMENTED 갱신`,
      ).toEqual([])
    }
  })

  // 메타(테스트의 테스트): 가드가 원래 버그 클래스를 진짜로 잡는지. 가짜 명령엔 반드시 실패해야 함.
  it('가드가 실재하지 않는 명령을 실제로 잡는다', () => {
    expect(unknownCommands('run `vhk loop-brief-nope` then `vhk ghostcmd`', surface)).toEqual([
      'loop-brief-nope',
      'ghostcmd',
    ])
    // 회귀 포인트: 한때 부재였던 loop-brief·remind 가 지금은 실재 → 통과해야 함.
    expect(unknownCommands('`vhk loop-brief` and `vhk remind`', surface)).toEqual([])
  })
})
