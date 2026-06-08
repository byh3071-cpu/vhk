import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { callTool, getRegisteredToolNames } from './helpers/mcp-introspect.js'

/**
 * MCP↔CLI 계약 테스트 (작업 2.1) — MCP 표면이 CLI 와 어긋나지 않음을 봉쇄한다.
 *
 * 배경: 과거 버그 #150 / #152 / #161 이 전부 "MCP ≠ CLI 드리프트"였다.
 *   - #161 check : MCP 가 CLI 와 다른 의미(정적 파일 체크리스트)를 재구현 → 에이전트에 거짓 신호.
 *   - #152 deploy: MCP 가 감지 key('cloudflare')를 명령으로 오용(`cloudflare --version`).
 *   - #150       : win32 전역설치 시 'vhk' shim 미해석 → ENOENT (exec.test.ts #150 에서 단위 커버).
 *
 * 설계 선택 — "CLI stdout == MCP 출력" 직접 비교는 채택하지 않는다:
 *   · 위임 도구(check 등)는 MCP 가 곧 `vhk <cmd>` 서브프로세스를 돌리므로 출력 비교가 동어반복.
 *   · harness 는 비결정적(벽시계 duration·spinner·실툴 spawn+사이드이펙트)이라 문자열 비교 불가.
 *   대신 *실제 버그를 잡는* 계약을 단언한다:
 *     A. 레지스트리 정확 셋(29)   — 도구 우발 추가/삭제 봉쇄
 *     B. 위임 매트릭스            — 모든 위임 도구가 올바른 CLI 인자로 위임(재구현 회귀 봉쇄, #161 일반화)
 *     C. 래퍼 충실도(runVhkCli)   — ANSI strip + 한글 본문 보존 + ✅/❌ prefix 유지
 *     D. 공유함수 패리티          — deploy/publish 가 CLI 와 동일한 공유 lib 결과를 표면화(#152 cross-단언)
 *
 * 중복 회피(기존 커버리지): exec.test.ts(#150 platformCmd), deploy.test.ts(#152 순수함수),
 *   publish.test.ts(bumpVersion), mcp-server.test.ts(check 위임 spot · version sync).
 */

vi.mock('node:child_process')

async function mockedExecFileSync() {
  const cp = await import('node:child_process')
  return vi.mocked(cp.execFileSync)
}

const text = (r: { content: Array<{ text: string }> }) => r.content.map((c) => c.text).join('\n')

// ─── A. 레지스트리 정확 셋 ───────────────────────────────────────────────
const EXPECTED_TOOLS = [
  'save', 'undo', 'status', 'diff', 'ship', 'doctor', 'check', 'recap', 'env', 'env-check',
  'sync', 'secure', 'audit', 'harness', 'context', 'brief', 'deploy', 'publish', 'migrate', 'update',
  'ref-list', 'memory-list', 'learn', 'context-show', 'mcp-init',
  'pattern-detect', 'pattern-list', 'evolve-suggest', 'evolve-list',
].slice().sort()

describe('MCP↔CLI 계약 — A. 레지스트리 정확 셋', () => {
  it('등록 도구가 정확히 29개이며 기대 셋과 일치 (우발 추가/삭제 봉쇄)', async () => {
    const names = (await getRegisteredToolNames()).slice().sort()
    expect(names).toEqual(EXPECTED_TOOLS)
    expect(names.length).toBe(29)
  })
})

// ─── B. 위임 매트릭스 ────────────────────────────────────────────────────
// 각 위임 도구가 어떤 CLI 인자로 위임돼야 하는지의 단일 표. cli = 위임 argv 의 *정확한* 꼬리.
// (부분 문자열 includes 가 아니라 꼬리 배열 동등 비교 — 추가 인자 오염·순서 변경까지 잡는다.
//  win32 는 `cmd.exe /d /s /c vhk.cmd <cli>`, linux/fallback 은 `[node] [localCli] <cli>` 라
//  앞쪽 wrapper/prefix 는 길이가 달라지므로 '꼬리'만 비교해야 크로스플랫폼 견고.)
const DELEGATIONS: Array<{ tool: string; args?: Record<string, unknown>; cli: string[] }> = [
  { tool: 'check', cli: ['check'] },
  { tool: 'sync', cli: ['sync'] },
  { tool: 'secure', cli: ['secure'] },
  { tool: 'harness', cli: ['harness'] },
  { tool: 'context', cli: ['context'] },
  { tool: 'brief', cli: ['brief'] },
  { tool: 'ref-list', cli: ['ref', 'list'] },
  { tool: 'memory-list', cli: ['memory', 'list'] },
  { tool: 'context-show', cli: ['context-show'] },
  { tool: 'mcp-init', cli: ['mcp-init'] },
  { tool: 'learn', args: { lesson: '교훈XYZ' }, cli: ['learn', '교훈XYZ'] },
  { tool: 'pattern-detect', cli: ['pattern', 'detect', '--json'] },
  { tool: 'pattern-detect', args: { min: 5 }, cli: ['pattern', 'detect', '--json', '--min', '5'] },
  { tool: 'pattern-list', cli: ['pattern', 'list', '--json'] },
  {
    tool: 'pattern-list',
    args: { kind: 'avoid', all: true },
    cli: ['pattern', 'list', '--json', '--kind', 'avoid', '--all'],
  },
  { tool: 'evolve-suggest', cli: ['evolve', 'suggest', '--json'] },
  { tool: 'evolve-list', cli: ['evolve', 'list', '--json'] },
  { tool: 'evolve-list', args: { status: 'pending' }, cli: ['evolve', 'list', '--json', '--status', 'pending'] },
]

describe('MCP↔CLI 계약 — B. 위임 매트릭스 (재구현 회귀 봉쇄 · #161 일반화)', () => {
  let execFileSync: Awaited<ReturnType<typeof mockedExecFileSync>>

  beforeAll(async () => {
    execFileSync = await mockedExecFileSync()
    execFileSync.mockReturnValue(Buffer.from('ok'))
    // 캐시 워밍: 첫 callTool 의 `vhk --version` 프로브를 미리 소진(cachedCli 고정) →
    // 이후 각 매트릭스 단언의 mock.calls 가 위임 호출만 담겨 깨끗해진다.
    await callTool('check')
  })

  beforeEach(() => {
    execFileSync.mockClear()
    execFileSync.mockReturnValue(Buffer.from('ok'))
  })

  // 실행된 어떤 argv 든 그 *꼬리* 가 기대 cli 와 정확히 일치하면 통과 (`vhk --version` 프로브 등은 무시).
  const delegatedWith = (cli: string[]) =>
    execFileSync.mock.calls.some((c) => {
      const argv = (c[1] as string[]) ?? []
      const tail = argv.slice(-cli.length)
      return tail.length === cli.length && tail.every((v, i) => v === cli[i])
    })

  for (const d of DELEGATIONS) {
    it(`${d.tool}${d.args ? ' ' + JSON.stringify(d.args) : ''} → \`vhk ${d.cli.join(' ')}\` 로 위임`, async () => {
      await callTool(d.tool, d.args ?? {})
      expect(delegatedWith(d.cli)).toBe(true)
    })
  }
})

// ─── C. 래퍼 충실도 (runVhkCli) ──────────────────────────────────────────
describe('MCP↔CLI 계약 — C. 래퍼 충실도 (ANSI strip · 한글 보존 · prefix)', () => {
  let execFileSync: Awaited<ReturnType<typeof mockedExecFileSync>>

  beforeEach(async () => {
    execFileSync = await mockedExecFileSync()
    execFileSync.mockReset()
  })

  it('성공: ANSI escape 제거 + 한글 본문 보존 + `✅ <headline>` prefix', async () => {
    // 초록색 ANSI + 한글 — CLI 성공 출력 흉내
    execFileSync.mockReturnValue(Buffer.from('\x1B[32m✅ RULES 5/5 통과 — 규칙 점검 완료\x1B[0m'))
    const res = await callTool('secure')
    const out = text(res)
    expect(out).toContain('RULES 5/5 통과 — 규칙 점검 완료') // 한글 본문 보존
    expect(out).not.toMatch(/\x1B\[/) // ANSI escape 제거됨
    expect(out.startsWith('✅ secure')).toBe(true) // 성공 prefix
  })

  it('실패: CLI 가 throw 하면 `❌ <headline> 실패` prefix', async () => {
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error('boom'), { stdout: '', stderr: 'err' })
    })
    const out = text(await callTool('secure'))
    expect(out.startsWith('❌ secure 실패')).toBe(true)
  })
})

// ─── D. 공유함수 패리티 (#152 cross-단언) ────────────────────────────────
describe('MCP↔CLI 계약 — D. 공유함수 패리티 (deploy/publish)', () => {
  let origCwd: string
  let dir = ''

  beforeEach(async () => {
    origCwd = process.cwd()
    const execFileSync = await mockedExecFileSync()
    execFileSync.mockReturnValue(Buffer.from('1.0.0')) // CLI 가용성 프로브 — 결과는 단언 대상 아님
  })

  afterEach(() => {
    process.chdir(origCwd) // Windows: 삭제 전 cwd 복원(잠금 회피)
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
  })

  it('deploy: Cloudflare Pages 에서 MCP 출력이 resolveDeployTarget 결과와 일치, 감지 key 명령 오용 없음(#152)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vhk-mcpcontract-'))
    writeFileSync(join(dir, 'wrangler.toml'), 'name = "x"\npages_build_output_dir = "dist"\n')
    process.chdir(dir)

    const { resolveDeployTarget } = await import('../src/commands/deploy.js')
    const target = resolveDeployTarget()
    expect(target).not.toBeNull()
    const cfg = target!.config

    // 리터럴 앵커 — 공유함수와 MCP 가 *동시에* 드리프트해도 잡히도록 기대값을 고정(동어반복 차단).
    expect(cfg.name).toBe('Cloudflare Pages')
    expect(cfg.commandArgs).toEqual(['wrangler', 'pages', 'deploy'])

    const out = text(await callTool('deploy'))
    // MCP 가 공유 resolver 결과를 그대로 표면화하는지 cross-단언
    expect(out).toContain(cfg.name) // 'Cloudflare Pages'
    expect(out).toContain(cfg.commandArgs.join(' ')) // 'wrangler pages deploy'
    // #152 회귀 봉쇄: 감지 key 를 실행 명령으로 오용하면 안 됨
    expect(out).not.toContain('cloudflare --version')
  })

  it('publish: MCP bump 후보가 공유 bumpVersion 결과와 일치', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vhk-mcpcontract-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.2.3' }))
    process.chdir(dir)

    const { bumpVersion } = await import('../src/commands/publish.js')
    const out = text(await callTool('publish'))
    expect(out).toContain(`v${bumpVersion('1.2.3', 'patch')}`) // v1.2.4
    expect(out).toContain(`v${bumpVersion('1.2.3', 'minor')}`) // v1.3.0
    expect(out).toContain(`v${bumpVersion('1.2.3', 'major')}`) // v2.0.0
  })
})
