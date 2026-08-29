import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  SAFETY_MODES,
  DEFAULT_SAFETY_MODE,
  isSafetyMode,
} from '../src/lib/safety-mode.js'
import {
  HIGH_RISK_ACTIONS,
  isHighRisk,
  resolveGuard,
} from '../src/lib/risk-policy.js'
import { spawnSync } from 'node:child_process'
import { readConfig, readConfigFromProjectRoot, writeConfig, DEFAULT_CONFIG, CONFIG_PATH } from '../src/lib/config.js'

function tmp(label: string): string {
  const dir = join(tmpdir(), `vhk-safety-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('safety-mode — 모드 정의', () => {
  it('세 모드 lite/standard/strict', () => {
    expect(SAFETY_MODES).toEqual(['lite', 'standard', 'strict'])
  })
  it('기본 모드는 standard', () => {
    expect(DEFAULT_SAFETY_MODE).toBe('standard')
  })
  it('isSafetyMode 검증', () => {
    expect(isSafetyMode('strict')).toBe(true)
    expect(isSafetyMode('nope')).toBe(false)
    expect(isSafetyMode(undefined)).toBe(false)
  })
})

describe('risk-policy — high-risk 11종 + 채널/모드 정책', () => {
  it('high-risk 11종 포함 (save 는 ADR-021/#611 승격)', () => {
    for (const a of ['undo', 'deploy', 'publish', 'migrate', 'cloud-pull', 'resume', 'env-write', 'delete', 'restore', 'policy-baseline', 'save']) {
      expect(HIGH_RISK_ACTIONS).toContain(a)
    }
    expect(HIGH_RISK_ACTIONS.length).toBe(11)
  })

  it('isHighRisk 판정', () => {
    expect(isHighRisk('deploy')).toBe(true)
    expect(isHighRisk('status')).toBe(false)
  })

  it('standard: CLI=confirm, MCP/자연어=preview', () => {
    expect(resolveGuard('deploy', 'standard', 'cli')).toBe('confirm')
    expect(resolveGuard('deploy', 'standard', 'mcp')).toBe('preview')
    expect(resolveGuard('deploy', 'standard', 'nl')).toBe('preview')
  })

  it('lite: 위험 작업도 막지 않고 경고만(warn)', () => {
    expect(resolveGuard('deploy', 'lite', 'cli')).toBe('warn')
    expect(resolveGuard('deploy', 'lite', 'mcp')).toBe('warn')
  })

  it('strict: 추가 작업(sync)도 가드 — save 는 이제 모드 무관 high-risk (ADR-021)', () => {
    expect(resolveGuard('save', 'standard', 'cli')).toBe('confirm')
    expect(resolveGuard('save', 'strict', 'cli')).toBe('confirm')
    expect(resolveGuard('sync', 'standard', 'cli')).toBe('allow')
    expect(resolveGuard('sync', 'strict', 'mcp')).toBe('preview')
  })

  it('저위험 작업은 allow', () => {
    expect(resolveGuard('status', 'standard', 'cli')).toBe('allow')
    expect(resolveGuard('status', 'strict', 'cli')).toBe('allow')
  })
})

describe('config — .vhk/config.json 읽기/쓰기', () => {
  let origCwd: string
  let dir: string
  beforeEach(() => {
    origCwd = process.cwd()
    dir = tmp('config')
    process.chdir(dir)
  })
  afterEach(() => {
    process.chdir(origCwd)
    rmSync(dir, { recursive: true, force: true })
  })

  it('파일 없으면 기본값(standard)', () => {
    expect(readConfig()).toEqual(DEFAULT_CONFIG)
    expect(readConfig().safetyMode).toBe('standard')
  })

  it('write → read 왕복', () => {
    writeConfig({ safetyMode: 'strict' })
    expect(existsSync(CONFIG_PATH)).toBe(true)
    expect(readConfig().safetyMode).toBe('strict')
  })

  it('손상된 모드 값은 기본값으로 폴백', () => {
    mkdirSync('.vhk', { recursive: true })
    writeFileSync(CONFIG_PATH, JSON.stringify({ safetyMode: 'garbage' }), 'utf-8')
    expect(readConfig().safetyMode).toBe('standard')
  })

  it('write 결과는 JSON 파싱 가능', () => {
    writeConfig({ safetyMode: 'lite' })
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    expect(parsed.safetyMode).toBe('lite')
  })

  it('#611: 하위 폴더 실행에서도 git 루트의 strict 를 잃지 않는다 (가드 우회 방지)', () => {
    // 비-git 임시 디렉터리에선 cwd 폴백으로 동작
    expect(readConfigFromProjectRoot().safetyMode).toBe('standard')
    // git 저장소 루트에 strict 설정 → 하위 폴더로 이동해도 루트 설정을 읽어야 한다
    const git = (args: string[]) => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' })
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
    }
    git(['init'])
    writeConfig({ safetyMode: 'strict' }, dir)
    const sub = join(dir, 'src', 'deep')
    mkdirSync(sub, { recursive: true })
    process.chdir(sub)
    expect(readConfig().safetyMode).toBe('standard') // cwd 기준(구 동작)은 strict 를 놓친다
    expect(readConfigFromProjectRoot().safetyMode).toBe('strict') // 가드가 쓰는 해석
  })
})
