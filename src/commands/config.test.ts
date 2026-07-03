import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readHomeConfig } from '../lib/home-config.js'
import { loadCoreRuleset } from '../lib/core-rules.js'
import { configSetBrainRoot } from './config.js'

// goal 92 — `vhk config set-brain-root <path>` 저장 직후 즉시 loadCoreRuleset() 재호출해
// 결과를 알려준다("저장은 됐는데 실제로 됐는지 모른다" 혼란 방지).

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-config-cmd-'))
}

function writeBrainYaml(dir: string, version: string): void {
  const yamlPath = path.join(dir, 'memory', 'core', 'core-ruleset.yaml')
  fs.mkdirSync(path.dirname(yamlPath), { recursive: true })
  fs.writeFileSync(yamlPath, `version: "${version}"\nnon_negotiable:\n  - x\n`, 'utf-8')
}

describe('configSetBrainRoot', () => {
  let logs: string[]
  let origBrain: string | undefined

  beforeEach(() => {
    logs = []
    vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { logs.push(String(m)) })
    // critic 지적(M1): YOHAN_BRAIN_ROOT 가 테스트 실행 셸에 실제로 설정돼 있으면
    // loadCoreRuleset() 이 그 값을 먼저 읽어 아래 단언들이 환경에 따라 뒤집힐 수 있었음 — 격리.
    origBrain = process.env.YOHAN_BRAIN_ROOT
    delete process.env.YOHAN_BRAIN_ROOT
  })
  afterEach(() => {
    if (origBrain === undefined) delete process.env.YOHAN_BRAIN_ROOT
    else process.env.YOHAN_BRAIN_ROOT = origBrain
    vi.restoreAllMocks()
  })

  it('유효한 core-ruleset.yaml 이 있는 경로 → 저장 + 즉시 live 확인 메시지', async () => {
    const home = tmpHome()
    const brainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-brain-cmd-'))
    writeBrainYaml(brainDir, '9.9.9')

    await configSetBrainRoot(brainDir, home)

    expect(readHomeConfig(home)).toEqual({ brainRoot: brainDir })
    const joined = logs.join('\n')
    expect(joined).toContain('9.9.9')
    expect(joined).toMatch(/live|성공|반영/)

    fs.rmSync(home, { recursive: true, force: true })
    fs.rmSync(brainDir, { recursive: true, force: true })
  })

  it('경로는 저장되지만 그 경로에 core-ruleset.yaml 이 없으면 정직하게 경고', async () => {
    const home = tmpHome()
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-empty-cmd-'))

    await configSetBrainRoot(emptyDir, home)

    // 저장 자체는 사용자가 명시한 그대로 이뤄진다(경로가 지금 비어있어도 나중에 채울 수 있음).
    expect(readHomeConfig(home)).toEqual({ brainRoot: emptyDir })
    const joined = logs.join('\n')
    expect(joined).toMatch(/못|실패|없|경고/)

    fs.rmSync(home, { recursive: true, force: true })
    fs.rmSync(emptyDir, { recursive: true, force: true })
  })

  // critic 지적(M2): YOHAN_BRAIN_ROOT 가 다른 유효 경로로 설정돼 있으면, 방금 저장한 경로가
  // 유효해도 지금 당장은 env 가 우선이라 안 쓰인다 — "성공"이라고만 말하면 사용자가 속는다.
  it('YOHAN_BRAIN_ROOT 가 다른 경로를 가리키면 "지금은 안 쓰인다"고 정직하게 경고', async () => {
    const home = tmpHome()
    const newBrain = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-newbrain-'))
    const envBrain = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-envbrain-cmd-'))
    writeBrainYaml(newBrain, '5.5.5')
    writeBrainYaml(envBrain, '1.1.1')
    process.env.YOHAN_BRAIN_ROOT = envBrain

    await configSetBrainRoot(newBrain, home)

    expect(readHomeConfig(home)).toEqual({ brainRoot: newBrain }) // 저장 자체는 정상
    const joined = logs.join('\n')
    expect(joined).toMatch(/안 쓰|우선 적용|YOHAN_BRAIN_ROOT/) // "성공했다"고 오도하지 않음
    expect(joined).not.toMatch(/✅.*성공/) // 성공 체크마크는 안 뜸

    fs.rmSync(home, { recursive: true, force: true })
    fs.rmSync(newBrain, { recursive: true, force: true })
    fs.rmSync(envBrain, { recursive: true, force: true })
  })

  // critic 재검증(2026-07-03, main 병합 후) 발견: brainRootPath 를 path.resolve 없이 그대로
  // 저장 + 저장 직후 검증도 "저장 명령 실행 시점의 cwd" 기준이라, 상대경로로 저장하면 그 순간엔
  // "✅ 성공"이 뜨지만 나중에 다른 프로젝트 디렉터리(다른 cwd)에서 loadCoreRuleset() 이 같은
  // 상대경로를 다르게 해석해 조용히 bundled 로 폴백 — M2 가 잡았던 "안내가 실제 결과와 어긋남"
  // 클래스가 cwd 경로로 재현됨. path.resolve 로 저장 시점에 절대경로 정규화해 수정.
  it('상대경로로 저장해도 절대경로로 정규화되어 이후 다른 cwd 에서도 안 깨짐', async () => {
    const home = tmpHome()
    const brainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-relbrain-'))
    writeBrainYaml(brainDir, '7.7.7')
    const brainBasename = path.basename(brainDir)
    const brainParent = path.dirname(brainDir)

    const originalCwd = process.cwd()
    try {
      process.chdir(brainParent)
      await configSetBrainRoot(brainBasename, home)
    } finally {
      process.chdir(originalCwd)
    }

    const saved = readHomeConfig(home)
    expect(path.isAbsolute(saved?.brainRoot ?? '')).toBe(true)

    // 복원된(=brainDir 와 무관한) cwd 에서도 live 로 로드돼야 cwd 독립성이 증명됨.
    const loaded = loadCoreRuleset(home)
    expect(loaded.source).toBe('live')
    expect(loaded.version).toBe('7.7.7')

    fs.rmSync(home, { recursive: true, force: true })
    fs.rmSync(brainDir, { recursive: true, force: true })
  })
})
