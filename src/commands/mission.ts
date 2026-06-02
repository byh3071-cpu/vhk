import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { simpleGit } from 'simple-git'
import { readJsonFile } from '../lib/read-json.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { printNextStep } from '../lib/next-step.js'
import { isInteractive } from '../lib/interactive.js'

/**
 * Goal 17: vhk mission — Mission Contract (Trust Loop scope/intent 층).
 * 작업의 목표·허용범위·금지선을 계약(.vhk/mission.json)으로 선언하고, 현재 변경이 계약 안인지 검증.
 * 철학: ① 계약 먼저 ② **경로 glob 기준 v0**(objective 의미 검증 아님 — disclaimer 명시)
 *      ③ 신뢰도 신호지 하드블록 아님 ④ 별도 네임스페이스(.vhk/mission.json — latest.json 불변).
 */

export const MISSION_PATH_REL = join('.vhk', 'mission.json')
export const MISSION_SCHEMA_VERSION = 1
export const MISSION_DISCLAIMER =
  '⚠️  mission check 는 경로 glob 기준입니다 — objective 의미 부합은 검증하지 않습니다(신뢰도 신호, 보장 아님).'

export interface Mission {
  schemaVersion: number
  objective: string
  /** 허용 경로 glob (비면 scope 경고 안 함). */
  scope: string[]
  /** 금지 경로 glob (매칭 시 위반). */
  forbidden: string[]
  createdAt: string
  updatedAt: string
}

export interface MissionCheckResult {
  violations: { file: string; pattern: string }[]
  warnings: { file: string }[]
  disclaimer: string
}

/** glob → RegExp. `**`=경로 전체(슬래시 포함), `*`=세그먼트 내, `?`=한 글자. 외부 의존 0. */
export function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
        if (glob[i + 1] === '/') i++ // `**/` 는 0개 이상 디렉터리
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c
    } else {
      re += c
    }
  }
  return new RegExp('^' + re + '$')
}

/** 경로가 glob 목록 중 하나라도 매칭하는지. 경로 구분자는 posix(/)로 정규화. */
function matchesAny(file: string, globs: string[]): string | null {
  const norm = file.replace(/\\/g, '/')
  for (const g of globs) {
    if (globToRegExp(g).test(norm)) return g
  }
  return null
}

/**
 * 변경 파일 ↔ 계약 교차검증. **순수 함수**(fs/git 없음 → 테스트 용이).
 * forbidden 매칭 = 위반(강). scope 비어있지 않은데 scope 밖 = 경고. scope 비면 경고 안 함.
 */
export function checkMission(changedFiles: string[], mission: Mission): MissionCheckResult {
  const violations: MissionCheckResult['violations'] = []
  const warnings: MissionCheckResult['warnings'] = []
  for (const file of changedFiles) {
    const forbiddenHit = matchesAny(file, mission.forbidden)
    if (forbiddenHit) {
      violations.push({ file, pattern: forbiddenHit })
      continue
    }
    if (mission.scope.length > 0 && !matchesAny(file, mission.scope)) {
      warnings.push({ file })
    }
  }
  return { violations, warnings, disclaimer: MISSION_DISCLAIMER }
}

/** .vhk/mission.json 읽기 (BOM-safe). 없거나 손상이면 null. */
export function readMission(cwd: string = process.cwd()): Mission | null {
  const p = join(cwd, MISSION_PATH_REL)
  if (!existsSync(p)) return null
  try {
    const m = readJsonFile<Mission>(p)
    if (m && typeof m.objective === 'string') return m
    return null
  } catch {
    return null
  }
}

function writeMission(cwd: string, mission: Mission): void {
  mkdirSync(join(cwd, '.vhk'), { recursive: true })
  writeFileSync(join(cwd, MISSION_PATH_REL), JSON.stringify(mission, null, 2) + '\n', 'utf-8')
}

/** working tree + staged 변경 파일 경로 (simple-git status — 추가/수정/삭제/이름변경/미추적 포함). */
async function collectChangedFiles(cwd: string): Promise<string[]> {
  const status = await simpleGit(cwd).status()
  const set = new Set<string>()
  for (const f of status.files) if (f.path) set.add(f.path.replace(/\\/g, '/'))
  return [...set]
}

// ─── 서브커맨드 ───

export async function missionSet(opts: {
  objective?: string
  scope?: string[]
  forbidden?: string[]
  clearScope?: boolean
  clearForbidden?: boolean
  yes?: boolean
} = {}): Promise<void> {
  if (!ensureNotHardStopped('mission set')) return
  const cwd = process.cwd()
  const existing = readMission(cwd)

  let objective = opts.objective ?? existing?.objective ?? ''
  if (!objective) {
    if (isInteractive(opts)) {
      const ans = await inquirer.prompt<{ obj: string }>([
        { type: 'input', name: 'obj', message: '미션 목표(objective)는?' },
      ])
      objective = ans.obj.trim()
    }
    if (!objective) {
      console.error(chalk.red('  ❌ objective 가 필요합니다. --objective "..." 로 지정하세요(비대화형).'))
      process.exitCode = 1
      return
    }
  }

  // 보존 규칙: 옵션 미제공(undefined) → 기존 값 유지. 제공 → 새 배열로 교체.
  // 비우려면 명시적 --clear-scope / --clear-forbidden (실수로 비우는 사고 방지).
  const scope = opts.clearScope ? [] : opts.scope ?? existing?.scope ?? []
  const forbidden = opts.clearForbidden ? [] : opts.forbidden ?? existing?.forbidden ?? []

  const now = new Date().toISOString()
  const mission: Mission = {
    schemaVersion: MISSION_SCHEMA_VERSION,
    objective,
    scope,
    forbidden,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  try {
    writeMission(cwd, mission)
  } catch (e) {
    console.error(chalk.red(`  ❌ mission.json 기록 실패: ${e instanceof Error ? e.message : String(e)}`))
    process.exitCode = 1
    return
  }
  console.log(chalk.bold('\n🎯 미션 계약 저장'))
  console.log(chalk.dim(`  📄 ${MISSION_PATH_REL}`))
  console.log(`  objective: ${mission.objective}`)
  console.log(`  scope: ${mission.scope.length ? mission.scope.join(', ') : '(제한 없음)'}`)
  console.log(`  forbidden: ${mission.forbidden.length ? mission.forbidden.join(', ') : '(없음)'}`)
  printNextStep({ message: '변경이 계약 안인지 검증하려면:', command: 'vhk mission check', cursorHint: '미션 검증해줘' })
}

export async function missionShow(): Promise<void> {
  const cwd = process.cwd()
  const mission = readMission(cwd)
  if (!mission) {
    console.error(chalk.yellow('  ⚠️  미션 계약이 없습니다 (.vhk/mission.json).'))
    printNextStep({ message: '먼저 미션을 선언하세요:', command: 'vhk mission set --objective "..."', cursorHint: '미션 정해줘' })
    process.exitCode = 1
    return
  }
  console.log(chalk.bold('\n🎯 현재 미션 계약'))
  console.log(`  objective: ${mission.objective}`)
  console.log(`  scope: ${mission.scope.length ? mission.scope.join(', ') : '(제한 없음)'}`)
  console.log(`  forbidden: ${mission.forbidden.length ? mission.forbidden.join(', ') : '(없음)'}`)
  console.log(chalk.dim(`  생성 ${mission.createdAt} · 갱신 ${mission.updatedAt}`))
}

export async function missionCheck(): Promise<void> {
  const cwd = process.cwd()
  const mission = readMission(cwd)
  if (!mission) {
    console.error(chalk.yellow('  ⚠️  미션 계약이 없습니다 — 먼저 vhk mission set 으로 선언하세요.'))
    process.exitCode = 1
    return
  }
  const changed = await collectChangedFiles(cwd)
  const result = checkMission(changed, mission)

  console.log(chalk.bold('\n🎯 미션 계약 검증 (mission check)'))
  console.log(chalk.dim(`  objective: ${mission.objective}  ·  변경 파일 ${changed.length}개`))

  if (result.violations.length > 0) {
    console.log(chalk.red.bold(`\n  🚫 forbidden 위반 ${result.violations.length}건`))
    for (const v of result.violations) console.log(chalk.red(`   ✗ ${v.file}  (금지: ${v.pattern})`))
  }
  if (result.warnings.length > 0) {
    console.log(chalk.yellow.bold(`\n  ⚠️  scope 밖 변경 ${result.warnings.length}건 (경고)`))
    for (const w of result.warnings) console.log(chalk.yellow(`   ? ${w.file}`))
  }
  if (result.violations.length === 0 && result.warnings.length === 0) {
    console.log(chalk.green('\n  ✓ 변경이 계약(scope/forbidden) 안입니다.'))
  }
  console.log(chalk.yellow(`\n  ${result.disclaimer}`))

  // forbidden 위반만 실패(exit 1). scope 경고는 통과(0).
  process.exitCode = result.violations.length > 0 ? 1 : 0
}

export async function missionClear(): Promise<void> {
  const cwd = process.cwd()
  const p = join(cwd, MISSION_PATH_REL)
  if (!existsSync(p)) {
    console.log(chalk.dim('  미션 계약이 없습니다 — 지울 것 없음.'))
    return
  }
  try {
    rmSync(p)
    console.log(chalk.green('  ✅ 미션 계약 삭제됨 (.vhk/mission.json).'))
  } catch (e) {
    console.error(chalk.red(`  ❌ 삭제 실패: ${e instanceof Error ? e.message : String(e)}`))
    process.exitCode = 1
  }
}
