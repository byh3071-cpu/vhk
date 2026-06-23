import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { getRegisteredToolNames } from './helpers/mcp-introspect.js'
import { getMcpToolNames, getMcpToolCount } from '../src/mcp/server.js'
import { getVhkDescription, normalizeMcpToolCount } from '../src/lib/version.js'

// #342 #343: MCP 도구 수가 표면마다 따로 하드코딩돼 드리프트(help '30 tools' vs mcp 명령 '29 tool'
//   vs 실제 35). 실 등록 도구 수를 런타임 단일 SoT(등록 맵 length)에서 도출해 모든 표면이 같은
//   값을 쓰게 한다. 도구 추가/삭제 시 자동 반영되며, 이 가드가 드리프트 재발을 봉쇄한다.
describe('MCP 도구 수 단일 SoT — 표면 정합 (#342 #343)', () => {
  it('getMcpToolNames() 가 실제 등록 도구 셋과 일치 (런타임 SoT)', async () => {
    const introspected = (await getRegisteredToolNames()).slice().sort()
    const sot = getMcpToolNames().slice().sort()
    expect(sot).toEqual(introspected)
  })

  it('getMcpToolCount() = 등록 도구 수 (length 파생)', () => {
    expect(getMcpToolCount()).toBe(getMcpToolNames().length)
    // 현재 35개 — 우발 증감 방지 (mcp-cli-contract A 와 동일 baseline).
    expect(getMcpToolCount()).toBe(35)
  })

  it('mcp 명령 description 에 하드코딩 숫자 없음 → SoT 파생 (#342)', () => {
    const idx = readFileSync('src/index.ts', 'utf-8')
    // 'MCP 서버 시작 (29 tool …' 같은 정적 숫자 하드코딩 금지.
    expect(idx).not.toMatch(/MCP 서버 시작 \(\d+ tool/)
    // getMcpToolCount() 로 도출돼야 함.
    expect(idx).toMatch(/getMcpToolCount\(\)/)
  })

  it('package.json.description 의 "MCP N tools" 가 실제 등록 수와 일치 (#343)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { description?: string }
    const m = pkg.description?.match(/MCP\s+(\d+)\s+tools/)
    expect(m, 'package.json.description 에 "MCP N tools" 표기가 있어야 함').not.toBeNull()
    expect(
      Number(m![1]),
      `package.json description MCP tool 수(${m![1]}) ≠ 실제 등록(${getMcpToolCount()}) — 도구 증감 시 갱신하세요`,
    ).toBe(getMcpToolCount())
  })

  it('normalizeMcpToolCount() 가 어긋난 숫자를 실 등록 수로 자가 교정 (CLI --help 정합 · 드리프트 0)', () => {
    // package.json 숫자가 stale(예: 99)이어도 주입 단계에서 실 등록 수로 교정돼야 한다.
    const stale = 'VHK — …, MCP 99 tools, … 게이트.'
    const fixed = normalizeMcpToolCount(stale, getMcpToolCount())
    const m = fixed.match(/MCP\s+(\d+)\s+tools/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(getMcpToolCount())

    // 실제 주입 경로(getVhkDescription → normalize)도 SoT 와 일치.
    const injected = normalizeMcpToolCount(getVhkDescription(), getMcpToolCount())
    const m2 = injected.match(/MCP\s+(\d+)\s+tools/)
    expect(m2, '주입된 설명에 "MCP N tools" 표기가 있어야 함').not.toBeNull()
    expect(Number(m2![1])).toBe(getMcpToolCount())
  })
})
