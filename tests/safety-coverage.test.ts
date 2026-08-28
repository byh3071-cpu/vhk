import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  HIGH_RISK_ACTIONS,
  STRICT_EXTRA_ACTIONS,
  NL_GUARDED_ACTIONS,
  isHighRisk,
} from '../src/lib/risk-policy.js'

// 가드가 필관리자 action 전체 = high-risk ∪ strict-extra(save/sync).
const GUARDED = new Set<string>([...HIGH_RISK_ACTIONS, ...STRICT_EXTRA_ACTIONS])

// 가드 대상 핸들러 함수명 → action. dispatch/메뉴에서 이 함수를 호출하면 위험 작업이 실행된다.
const HANDLER_ACTION: Record<string, string> = {
  undo: 'undo', deploy: 'deploy', publish: 'publish', migrate: 'migrate',
  cloudPull: 'cloud-pull', env: 'env-write', save: 'save', sync: 'sync', resume: 'resume',
  restore: 'restore',
  policyBaseline: 'policy-baseline',
}

describe('완전성 가드 — high-risk 무바이패스 (적대리뷰 R2)', () => {
  it('NL_GUARDED_ACTIONS 의 모든 action 은 가드대상(HIGH_RISK ∪ STRICT_EXTRA)', () => {
    for (const a of Object.values(NL_GUARDED_ACTIONS)) {
      expect(GUARDED.has(a), `${a} 가 가드대상 아님`).toBe(true)
    }
  })

  it('자연어 dispatch: 가드대상 핸들러 호출 case 는 전부 NL_GUARDED_ACTIONS 등록(caller 가 runGuarded)', () => {
    const src = readFileSync('src/lib/nlp-run.ts', 'utf-8')
    const cases = [...src.matchAll(/case\s+'([^']+)':\s*\n?\s*return\s+(\w+)\(/g)]
    for (const [, cmd, handler] of cases) {
      const action = HANDLER_ACTION[handler]
      if (action && GUARDED.has(action)) {
        expect(Object.keys(NL_GUARDED_ACTIONS), `NL '${cmd}'→${handler}() 가드 미경유`).toContain(cmd)
      }
    }
    expect(src).toContain("route.command === 'policy' && route.args?.[0] === 'baseline'")
    expect(src).toContain("? 'policy-baseline'")
  })

  it('CLI 등록: 가드대상 + CLI 커맨드 있는 action 은 전부 guardCli/guardCliDefer 경유 (index.ts)', () => {
    const idx = readFileSync('src/index.ts', 'utf-8')
    const CLI_ACTIONS = ['deploy', 'publish', 'migrate', 'env-write', 'cloud-pull', 'undo', 'resume', 'save', 'sync', 'restore', 'policy-baseline']
    for (const a of CLI_ACTIONS) {
      // undo/resume 는 guardCliDefer(명령 자체확인 위임), 나머지는 guardCli
      expect(new RegExp(`guardCli(Defer)?\\(\\s*'${a}'`).test(idx), `CLI '${a}' 가드 미경유`).toBe(true)
    }
  })

  it('가드대상 action(예약 delete 제외)은 전부 HANDLER_ACTION 에 핸들러 매핑됨 (완전성 매핑 누락 방지)', () => {
    // 새 high-risk action 이 risk-policy 에 추가되면 HANDLER_ACTION 도 갱신해야 dispatch/직접호출 검사가 동작.
    const mapped = new Set(Object.values(HANDLER_ACTION))
    for (const a of GUARDED) {
      if (a === 'delete') continue // 진입점 없는 예약 액션
      expect(mapped.has(a), `action '${a}' 핸들러 매핑 없음 → 완전성 검사 누락(드리프트)`).toBe(true)
    }
  })

  it('인라인 메뉴 switch 등: 가드대상 핸들러 직접 호출 없음(전부 guardCli 경유)', () => {
    const idx = readFileSync('src/index.ts', 'utf-8')
    const direct = [...idx.matchAll(/return\s+(undo|save|sync|deploy|publish|migrate|env|cloudPull|resume|policyBaseline)\(/g)]
    expect(direct.map((m) => m[1]), '가드 미경유 직접 호출 발견').toEqual([])
  })

  it('mode 강등은 NL/MCP 로 불가 — 조회전용(NL mode() 무인자 + MCP mode 툴 없음)', () => {
    const nlp = readFileSync('src/lib/nlp-run.ts', 'utf-8')
    // 자연어 dispatch 의 mode 는 무인자 호출(조회) — mode('lite') 같은 변경 호출 없음
    expect(nlp).toMatch(/case 'mode':\s*\n?\s*return mode\(\)/)
    const server = readFileSync('src/mcp/server.ts', 'utf-8')
    expect(/registerTool\(\s*['"]mode['"]/.test(server), 'MCP mode 툴 존재 → 강등 가능').toBe(false)
  })

  it("'delete' 는 진입점 없는 예약 액션(라이브 바이패스 아님)", () => {
    const idx = readFileSync('src/index.ts', 'utf-8')
    expect(idx.includes("guardCli('delete'")).toBe(false)
    expect(idx.includes(".command('delete'")).toBe(false)
    expect(Object.keys(NL_GUARDED_ACTIONS)).not.toContain('delete')
  })

  it('restore 는 high-risk (백업 덮어쓰기)', () => {
    expect(isHighRisk('restore')).toBe(true)
  })

  it('high-risk 별도 나열 리스트는 risk-policy 외에 없음(드리프트 소스 감사)', () => {
    const files = ['src/lib/nlp-run.ts', 'src/index.ts', 'src/mcp/server.ts']
    const names = ['undo', 'deploy', 'publish', 'migrate', 'cloud-pull', 'resume', 'env-write']
    for (const f of files) {
      const src = readFileSync(f, 'utf-8')
      for (const lit of src.match(/\[[^\]]*\]/g) ?? []) {
        const hit = names.filter((n) => lit.includes(`'${n}'`))
        expect(hit.length, `${f} 에 high-risk 별도 나열 의심: ${lit.slice(0, 60)}`).toBeLessThan(3)
      }
    }
  })
})

// HIGH_RISK_ACTIONS 를 risk-policy 원본에서 직접 순회 — 위 CLI_ACTIONS(손관리 미러)와 달리
// 새 high-risk 액션이 추가되면 자동으로 검사 대상에 포함되어 가드 누락 드리프트를 차단한다.
describe('HIGH_RISK 완전성 — index.ts guard 경유', () => {
  const idx = readFileSync('src/index.ts', 'utf-8')
  // env-write 는 env 명령에서 guardCli('env-write'...) 로 등록.
  // delete 는 현재 CLI 직접 명령 없음(진입점 없는 예약 액션) → 예외.
  //   (safety-coverage 의 "'delete' 는 진입점 없는 예약 액션" 테스트가 .command('delete')/guardCli('delete') 부재를 별도 검증)
  const EXEMPT = new Set(['delete'])
  for (const a of HIGH_RISK_ACTIONS) {
    if (EXEMPT.has(a)) continue
    it(`${a} 는 index.ts 에서 guard 경유`, () => {
      expect(new RegExp(`guardCli(Defer)?\\(\\s*'${a}'`).test(idx)).toBe(true)
    })
  }
})
