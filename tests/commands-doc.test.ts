import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { TOP_LEVEL_COMMANDS, CONTAINER_SUBCOMMANDS } from '../src/lib/command-registry.js'

// Goal 64 — COMMANDS.md 커버리지 강제 (registry SoT 기반, v0 파일명 휴리스틱 대체).
// 새 명령을 registry 에 추가하면 COMMANDS.md 에도 행을 추가해야 이 테스트가 통과한다 —
// "만들어놓고 사용자가 모르는 명령" 재발 차단. 매칭은 [\w-] 토큰 단위
// (diff-cover 등장이 diff 를 커버하지 않게 — governance check-commands-doc 와 동일 규칙).

const doc = fs.readFileSync(path.join(process.cwd(), 'COMMANDS.md'), 'utf-8')
const tokens = new Set(doc.split(/[^\w-]+/))

describe('COMMANDS.md ↔ command-registry 전수 일치 (Goal 64)', () => {
  it('TOP_LEVEL_COMMANDS 전 명령이 COMMANDS.md 에 등장', () => {
    const missing = TOP_LEVEL_COMMANDS.map((c) => c.name).filter((n) => !tokens.has(n))
    expect(missing, `COMMANDS.md 미등장 명령 — 카탈로그 표에 행 추가 필요: ${missing.join(', ')}`).toEqual([])
  })

  it('컨테이너 서브커맨드도 전부 등장 (goal/memory/cost 등 사용법 노출)', () => {
    const missing: string[] = []
    for (const [container, subs] of Object.entries(CONTAINER_SUBCOMMANDS)) {
      for (const s of subs) {
        // 서브커맨드 토큰은 짧고 흔한 단어(add/list/check)라 컨테이너 등장 + 서브 토큰 동시 요구
        if (!tokens.has(container) || !tokens.has(s)) missing.push(`${container} ${s}`)
      }
    }
    expect(missing, `미등장 서브커맨드: ${missing.join(', ')}`).toEqual([])
  })
})
