import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { atomicWriteFile } from '../lib/atomic-write.js'
import { join } from 'node:path'
import chalk from 'chalk'
import { prompt } from '../lib/prompt.js'
import { simpleGit } from 'simple-git'
import { readJsonFile } from '../lib/read-json.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { printNextStep } from '../lib/next-step.js'
import { isInteractive } from '../lib/interactive.js'
import { ko } from '../i18n/ko.js'

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
  unsupportedForbiddenPatterns: string[]
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

// glob 패턴이 globToRegExp 로 지원되지 않는 문법을 포함하는지 검출. 포함하면 패턴 문자열(비null) 반환.
//
// 검출 규칙:
// - `!` — 어느 위치에든 포함 시 미지원(negation glob 은 globToRegExp 가 처리 안 함).
// - `{` — 중괄호 확장({a,b}) 미지원. `.+^${}()|[]\\` escape 목록에 `{` 가 있어 리터럴로 처리됨.
// - `[` — 문자 클래스([abc]·[!abc]) 미지원. escape 처리돼 리터럴 `[` 로만 매칭됨.
// - 후행 `/` — 디렉터리 한정 glob. globToRegExp 가 trailing slash 를 그대로 re 에 붙여
//   "경로가 /로 끝나야 매칭" 조건을 만들므로 파일 경로와 절대 매칭 안 됨.
//
// why: `?` 는 `[^/]` 로 변환돼 지원됨 → 검출 대상 아님(L-2).
//      `*`·`**` 도 지원. [abc]·[!abc] 는 escape돼 리터럴로 처리되므로 둘 다 미지원 경고 대상.
export function detectUnsupportedGlob(g: string): string | null {
  if (g.includes('!')) return g
  if (g.includes('{')) return g
  if (g.includes('[')) return g
  if (g.endsWith('/')) return g
  return null
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
  const unsupportedForbiddenPatterns = mission.forbidden.filter((g) => detectUnsupportedGlob(g) !== null)
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
  return { violations, warnings, disclaimer: MISSION_DISCLAIMER, unsupportedForbiddenPatterns }
}

/**
 * .vhk/mission.json 읽기 (BOM-safe). 없거나 손상이면 null.
 * why: objective 뿐 아니라 scope/forbidden 이 배열인지도 검증한다. 구조 무효 객체(scope/forbidden
 * 누락·비배열)를 그대로 흘리면 checkMission 의 `mission.forbidden.filter` 가 TypeError 로 죽어
 * collectIntent(try/catch 밖 호출) 를 통해 vhk receipt/ mission check 전체가 크래시한다
 * — "원장/수집 실패는 본 판정을 막지 않는다" 설계와 정면 충돌. 손상은 여기서 null 로 흡수.
 */
export function readMission(cwd: string = process.cwd()): Mission | null {
  const p = join(cwd, MISSION_PATH_REL)
  if (!existsSync(p)) return null
  try {
    const m = readJsonFile<Mission>(p)
    if (m && typeof m.objective === 'string' && Array.isArray(m.scope) && Array.isArray(m.forbidden)) {
      return m
    }
    return null
  } catch {
    return null
  }
}

export function writeMission(cwd: string, mission: Mission): void {
  mkdirSync(join(cwd, '.vhk'), { recursive: true })
  atomicWriteFile(join(cwd, MISSION_PATH_REL), JSON.stringify(mission, null, 2) + '\n')
}

/** 미설정 상태를 의미하는 placeholder objective — init 스캐폴드가 박고, 사용자가 mission set 으로 채운다. */
export const MISSION_SCAFFOLD_OBJECTIVE = '(작업 전 vhk mission set 으로 선언)'

/**
 * init 스캐폴드용 빈 미션 계약 — 순수 팩토리(fs 없음). scope/forbidden 빈 배열, objective 는 placeholder.
 * 의도: mission.json 을 미리 깔아 "미설정 0" 상태(거짓 안전)를 없애고, work/receipt 가 합류 지점을 갖게 한다.
 */
export function scaffoldMission(_projectName: string): Mission {
  const now = new Date().toISOString()
  return {
    schemaVersion: MISSION_SCHEMA_VERSION,
    objective: MISSION_SCAFFOLD_OBJECTIVE,
    scope: [],
    forbidden: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** working tree + staged 변경 파일 경로 (simple-git status — 추가/수정/삭제/이름변경/미추적 포함). */
export async function collectChangedFiles(cwd: string): Promise<string[]> {
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
      const ans = await prompt<{ obj: string }>([
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
  if (result.unsupportedForbiddenPatterns.length > 0) {
    console.log(chalk.yellow.bold(`\n  ⚠️  ${ko.receipt.unsupportedForbiddenGlob(result.unsupportedForbiddenPatterns.length)}`))
    for (const p of result.unsupportedForbiddenPatterns) console.log(chalk.yellow(`   ? ${p}`))
  }
  // 미지원 패턴이 있으면 "✓ 통과"와 "⚠️ 미지원" 모순 메시지를 동시 출력하지 않는다(critic L-1).
  if (result.violations.length === 0 && result.warnings.length === 0 && result.unsupportedForbiddenPatterns.length === 0) {
    console.log(chalk.green('\n  ✓ 변경이 계약(scope/forbidden) 안입니다.'))
  }
  console.log(chalk.yellow(`\n  ${result.disclaimer}`))

  // forbidden 위반만 실패(exit 1). scope 경고는 통과(0).
  process.exitCode = result.violations.length > 0 ? 1 : 0
}

export async function missionClear(): Promise<void> {
  if (!ensureNotHardStopped('mission clear')) return
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
