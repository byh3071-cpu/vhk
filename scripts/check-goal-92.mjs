#!/usr/bin/env node
// scripts/check-goal-92.mjs — 자동 생성 (vhk goal sync).
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역에 추가.
// sync 재실행해도 기존 파일은 덮어쓰지 않습니다 (idempotent).
//
// Env: VHK_GATES_SKIP_DEEP=1  → test + build 스킵 (빠른 typecheck-only 패스)

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])
function run(cmd, args) {
  let bin = cmd, argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) {
    // Windows: .cmd shim 직접 spawn 은 Node CVE-2024-27980 으로 EINVAL → cmd.exe 래핑.
    bin = 'cmd.exe'; argv = ['/d', '/s', '/c', cmd + '.cmd', ...args]
  }
  try {
    // maxBuffer 상향: 큰 빌드/테스트 로그(>1MB)에서 성공해도 ENOBUFS 거짓실패 방지.
    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return true
  } catch (e) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')
    if (out.trim()) console.log(out.split('\n').slice(-25).join('\n'))
    return false
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 92 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 92] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
const must = (cond, label) => { console.log((cond ? '    ✓ ' : '    ✗ ') + label); if (!cond) pass = false }

// typecheck (스크립트 우선, 없으면 tsc --noEmit)
if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))
else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))
if (scripts.lint) gate('lint', run(pm, ['run', 'lint']))
if (!skipDeep) {
  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))
  else if (scripts.test && /vitest/.test(scripts.test)) gate('test', run(pm, ['run', 'test', '--', '--run']))
  else if (scripts.test) gate('test', run(pm, ['run', 'test']))
  if (scripts.build) gate('build', run(pm, ['run', 'build']))
}

// ─── goal 92 고유 검증 (직접 추가) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

const homeConfigTs = read('src/lib/home-config.ts')
must(homeConfigTs?.includes('export function getHomeConfigPath'), 'home-config.ts 가 getHomeConfigPath export')
must(homeConfigTs?.includes('export function readHomeConfig'), 'home-config.ts 가 readHomeConfig export')
must(homeConfigTs?.includes('export function writeHomeConfig'), 'home-config.ts 가 writeHomeConfig export')
// critic 재검증 지적: 단어 존재만 보면 주석/import 만으로도 헛통과 — 실제 콜사이트(atomicWriteFile(p, ...)) 확인.
must(/atomicWriteFile\(p,/.test(homeConfigTs ?? ''), 'home-config.ts 가 writeHomeConfig 내부에서 실제로 atomicWriteFile(p, ...) 호출 (raw writeFileSync 아님 — 손상 시 복구 불가한 사용자 설정값)')

const coreRulesTs = read('src/lib/core-rules.ts')
must(coreRulesTs?.includes('export function tryLoadLive'), 'core-rules.ts 가 tryLoadLive export (config.ts 가 독립적으로 재사용, critic M2 수정)')
// critic 재검증 지적(main 병합 후): path.join 이 try 밖에 있으면 비문자열 brainRoot(손상된 홈
// 설정파일)가 ERR_INVALID_ARG_TYPE 로 크래시 — "실패 시 항상 null" 계약 위반. try 블록이
// yamlPath 대입보다 앞에 오는지 위치 비교로 확인(주석 줄 수에 안 흔들리는 방식).
{
  const fnStart = (coreRulesTs ?? '').indexOf('export function tryLoadLive')
  const body = fnStart >= 0 ? coreRulesTs.slice(fnStart) : ''
  const tryIdx = body.indexOf('try {')
  const yamlIdx = body.indexOf('const yamlPath = path.join')
  must(fnStart >= 0 && tryIdx >= 0 && yamlIdx > tryIdx, 'tryLoadLive — path.join 이 try 블록 안에 있음(비문자열 brainRoot 크래시 방지)')
}
must(
  /export function loadCoreRuleset\(homeDir: string = os\.homedir\(\)\)/.test(coreRulesTs ?? ''),
  'loadCoreRuleset() 이 homeDir 인자를 받음(기본값 os.homedir(), 하위호환)'
)
must(coreRulesTs?.includes("readHomeConfig(homeDir)"), 'loadCoreRuleset() 이 readHomeConfig 로 홈 설정파일을 2순위 조회')

const configCmdTs = read('src/commands/config.ts')
must(configCmdTs?.includes('export async function configSetBrainRoot'), 'config.ts 가 configSetBrainRoot export')
must(
  configCmdTs?.includes('tryLoadLive(resolvedPath)') && !/^\s*loadCoreRuleset\(\)/m.test(configCmdTs?.split('const saved')[0] ?? ''),
  'configSetBrainRoot 이 저장한 경로 자체를 tryLoadLive 로 독립 판정 (critic M2 — loadCoreRuleset() 전체 결과로 오판정 안 함)'
)
must(configCmdTs?.includes('envOverrides'), 'configSetBrainRoot 이 env var 우선 여부를 별도로 계산해 3-way 피드백')
// critic 재검증 지적(main 병합 후): 상대경로를 그대로 저장하면 저장 시점 cwd 에서만 맞아, 다른
// cwd(다른 프로젝트)에서 loadCoreRuleset() 이 조용히 bundled 로 폴백 — path.resolve 정규화 확인.
must(
  configCmdTs?.includes('path.resolve(brainRootPath)') && configCmdTs?.includes('writeHomeConfig({ brainRoot: resolvedPath }'),
  'configSetBrainRoot 이 저장 전 path.resolve 로 절대경로 정규화(cwd 의존성 제거)'
)

const configTestTs = read('src/commands/config.test.ts')
must(
  configTestTs?.includes('delete process.env.YOHAN_BRAIN_ROOT') && configTestTs?.includes('origBrain = process.env.YOHAN_BRAIN_ROOT'),
  'config.test.ts 가 YOHAN_BRAIN_ROOT 를 격리 (critic M1 — 실사용자 환경에서 거짓 실패 방지)'
)
must(
  configTestTs?.includes("not.toMatch(/✅.*성공/)"),
  'config.test.ts 에 M2 회귀 가드(env 가 다른 경로 가리키면 거짓 성공 표시 안 함) 존재'
)

const koTs = read('src/i18n/ko.ts')
must(koTs?.includes('setBrainRootTitle'), 'ko.ts 에 config 블록(setBrainRootTitle) 존재')
must(koTs?.includes('vhk config set-brain-root'), 'ko.ts coreRulesBundledWarn 이 재시작 불필요 대안(vhk config set-brain-root) 병기')

const warnTest = read('tests/init-core-rules-warn.test.ts')
must(
  warnTest?.includes("toContain('vhk config set-brain-root')"),
  'init-core-rules-warn.test.ts 에 goal 92 대안 안내 회귀 가드 테스트 존재'
)

// 명령 등록 4지점
const indexTs = read('src/index.ts')
must(
  /program\s*\.command\('config'\)/.test(indexTs ?? '') && indexTs?.includes("set-brain-root <path>"),
  "index.ts 에 config/set-brain-root 커맨드 배선"
)

const registryTs = read('src/lib/command-registry.ts')
must(registryTs?.includes("config: ['set-brain-root']"), 'command-registry.ts CONTAINER_SUBCOMMANDS 에 config 등록')
must(registryTs?.includes("설정: 'config'"), 'command-registry.ts CONTAINER_ALIASES 에 설정→config 등록')
must(/name: 'config'/.test(registryTs ?? ''), 'command-registry.ts TOP_LEVEL_COMMANDS 에 config 항목 존재')

const cliArgsTs = read('src/lib/cli-args.ts')
must(/'config',\s*'설정',/.test(cliArgsTs ?? ''), "cli-args.ts KNOWN_COMMAND_TOKENS 에 'config'·'설정' 등록")

const commandsMd = read('COMMANDS.md')
must(commandsMd?.includes('Goal 92'), 'COMMANDS.md 에 config 섹션(Goal 92) 문서화')

if (pass) { console.log('✅ goal 92 gate passes'); process.exit(0) }
console.log('❌ goal 92 gate failed'); process.exit(1)
