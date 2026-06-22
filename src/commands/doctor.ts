import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { printNextStep } from '../lib/next-step.js'
import { ko } from '../i18n/ko.js'
import { projectMaturity } from '../lib/project-maturity.js'
import { readJsonFile } from '../lib/read-json.js'
import { safeExecFile } from '../lib/exec.js'
import { checkRuleDrift, checkContextDrift } from '../lib/drift.js'
import os from 'node:os'
import type { Runner } from '../lib/preflight.js'
import { runDiagnostics } from '../doctor/runner.js'
import { formatDiagnostics, formatDiagnosticsJson } from '../doctor/report.js'
import { diagNode } from '../doctor/diagnostics/node.js'
import { diagNpm } from '../doctor/diagnostics/npm.js'
import { diagPnpm } from '../doctor/diagnostics/pnpm.js'
import { diagGit } from '../doctor/diagnostics/git.js'
import { diagOs } from '../doctor/diagnostics/os.js'
import { buildVhkDiag } from '../doctor/diagnostics/vhk.js'
import { buildMcpDiag, mcpToolCount } from '../doctor/diagnostics/mcp.js'
import { buildAuditDiag } from '../doctor/diagnostics/audit.js'
import { readSelectedPM } from '../doctor/pm.js'
import type { DiagDeps, DoctorOptions, DiagFn } from '../doctor/types.js'
// 업데이트 체크 함수는 version-check.ts 단일 소스로 이동(메뉴와 공용). 여기선 import + re-export
// (doctor.test.ts 의 `from doctor.js` import 경로 보존) + 내부 사용.
import { fetchLatestNpmVersion, compareSemver, recordLatest } from '../lib/version-check.js'
export { fetchLatestNpmVersion, compareSemver }

/**
 * Goal 84: doctor 통과 시 next-step — 신규/기존 레포 맥락 분기(D9).
 *   established: "이제 프로젝트를 시작하세요(vhk 시작)" 대신 이어서 작업(vhk work).
 *   new: 기존 온보딩 멘트 유지(퇴행 0 — Forbidden). 진단 항목 자체는 불변.
 */
export function selectDoctorOkNextStep(maturity: 'new' | 'established'): {
  message: string
  command: string
  cursorHint: string
} {
  if (maturity === 'established') {
    return {
      message: ko.doctor.nextEstablishedMessage,
      command: 'vhk work',
      cursorHint: ko.doctor.nextEstablishedCursor,
    }
  }
  return {
    message: ko.doctor.nextOkMessage,
    command: 'vhk 시작',
    cursorHint: '프로젝트 만들어줘',
  }
}

export interface CheckResult {
  name: string
  command: string
  version?: string
  ok: boolean
  hint: string
}

export function checkCommand(name: string, command: string, hint: string): CheckResult {
  const result = safeExecFile(command, ['--version'])
  if (!result.ok) return { name, command, ok: false, hint }
  const version = result.out.split('\n')[0]
  return { name, command, version, ok: true, hint }
}

function getVhkVersion(): string | undefined {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(dir, '../package.json'),
    path.join(dir, '../../package.json'),
  ]

  for (const pkgPath of candidates) {
    try {
      if (fs.existsSync(pkgPath)) {
        const pkg = readJsonFile<{ version?: string }>(pkgPath)
        return pkg.version
      }
    } catch {
      continue
    }
  }
  return undefined
}

export async function doctor(opts: DoctorOptions = {}) {
  // 읽기전용 진단 — HARD_STOP 으로 막지 않는다(가드 docstring: '제외: 읽기전용(status 등)').
  // 오히려 HARD_STOP 켜진 순간이 환경 진단이 가장 필관리자 때.
  const cwd = process.cwd()

  // 환경 진단 — doctor 엔진(throw 격리, 진단만). Node 판정은 Goal 29 nodeMeetsShimSafe 재사용.
  const run: Runner = (cmd, args) => {
    const r = safeExecFile(cmd, args)
    return r.ok ? { ok: true, out: r.out } : { ok: false, out: r.out, err: r.err }
  }
  const deps: DiagDeps = {
    run,
    nodeVersion: process.version,
    platform: process.platform,
    osRelease: os.release(),
    selectedPM: readSelectedPM(process.cwd()), // #175 — 미사용 PM 부재를 fail 로 올리지 않게
  }
  // Phase 2: VHK 설치/업데이트 · MCP 서버 무결성 · 의존성 audit(--audit 시) 추가.
  const auditPm = fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : fs.existsSync(path.join(cwd, 'yarn.lock'))
      ? 'yarn'
      : 'npm'
  const diagnostics: DiagFn[] = [
    diagNode, diagNpm, diagPnpm, diagGit, diagOs,
    () => {
      const version = getVhkVersion()
      const latest = version ? (fetchLatestNpmVersion('@byh3071/vhk') ?? null) : null
      if (latest) recordLatest(latest) // 메뉴(getUpdateInfo) 캐시 적재
      return buildVhkDiag({ version, latest })
    },
    async () => buildMcpDiag(await mcpToolCount()),
    (o) => buildAuditDiag(o, () => run(auditPm, ['audit'])),
  ]
  const diags = await runDiagnostics(diagnostics, opts, deps)

  // --json: 기계가독 출력만(제목·프로젝트파일·드리프트 생략) — Phase 2.
  if (opts.json) {
    console.log(formatDiagnosticsJson(diags))
    return
  }

  console.log(chalk.bold(`\n${ko.doctor.title}\n`))
  for (const line of formatDiagnostics(diags)) console.log(line)
  const anyFail = diags.some((d) => d.status === 'fail')
  const warnCount = diags.filter((d) => d.status === 'warn').length

  console.log('')
  console.log(chalk.bold(`  ${ko.doctor.projectFiles}`))

  const projectFiles = [
    { name: 'RULES.md', hint: 'vhk init으로 생성 가능' },
    { name: 'COMMANDS.md', hint: 'vhk init으로 생성 가능' },
    { name: 'package.json', hint: '프로젝트 폴더에서 실행하세요' },
    { name: '.gitignore', hint: '보안을 위해 추가 권장' },
    { name: '.env', hint: '.gitignore에 포함되어 있는지 확인' },
  ]

  for (const file of projectFiles) {
    const exists = fs.existsSync(path.join(cwd, file.name))
    if (exists) {
      console.log(chalk.green(`    ✅ ${file.name}`))
      if (file.name === '.env') {
        const gitignorePath = path.join(cwd, '.gitignore')
        if (fs.existsSync(gitignorePath)) {
          const gitignore = fs.readFileSync(gitignorePath, 'utf-8')
          if (!gitignore.includes('.env')) {
            console.log(chalk.yellow(`    ${ko.doctor.envNotIgnored}`))
          }
        }
      }
    } else if (file.name === '.env' && fs.existsSync(path.join(cwd, '.env.local'))) {
      // VHK-009: .env 없어도 .env.local 있으면 정상(Vite 관례) — 모호한 부재 안내 대신 인식.
      console.log(chalk.green('    ✅ .env.local') + chalk.dim(' — 로컬 env 사용 중 (.env 없어도 정상)'))
    } else {
      console.log(chalk.dim(`    ⚫ ${file.name}`) + chalk.dim(` — ${file.hint}`))
    }
  }

  // 드리프트 점검 (passive — doctor 안에서 자동 경고, 읽기 전용)
  console.log('')
  console.log(chalk.bold(`  ${ko.doctor.driftTitle}`))
  const ruleDrift = checkRuleDrift(cwd)
  // --strict 게이트용 — 규칙 드리프트 발생 여부만 추적(context 드리프트는 제외: 생성물이라 비차단).
  let ruleDrifted = false
  if (!ruleDrift.checked) {
    console.log(chalk.dim(`    ${ko.doctor.driftNoRules}`))
  } else {
    const drifted = ruleDrift.results.filter(r => r.status === 'drifted')
    if (drifted.length === 0) {
      console.log(chalk.green(`    ${ko.doctor.driftRuleClean}`))
    } else {
      console.log(chalk.yellow(`    ${ko.doctor.driftRuleWarn(drifted.map(d => d.path).join(', '))}`))
      ruleDrifted = true
    }
  }
  const ctxDrift = checkContextDrift(cwd)
  if (ctxDrift.checked && ctxDrift.stale) {
    console.log(chalk.yellow(`    ${ko.doctor.driftContextWarn}`))
  }

  console.log('')
  if (anyFail) {
    // 치명(fail) — 도구 부재 등. exit 1.
    console.log(chalk.yellow.bold(`  ${ko.doctor.missing} ${ko.doctor.missingHint}`))
    printNextStep({
      message: ko.doctor.nextRetryMessage,
      command: 'vhk doctor',
      cursorHint: '환경 다시 점검해줘',
    })
    process.exitCode = 1
  } else if (warnCount > 0) {
    // 경고(warn) — '준비 완료' 로 묻지 않고 권장 조치를 안내. exit 0 유지(권고).
    console.log(chalk.yellow.bold(`  ${ko.doctor.warnSummary(warnCount)}`))
    printNextStep({
      message: '위 권장 조치 확인 (필수는 아님).',
      command: 'vhk doctor',
      cursorHint: '환경 다시 점검해줘',
    })
  } else {
    console.log(chalk.green.bold(`  ${ko.doctor.allOk}`))
    // Goal 84: 활성(기존) 레포면 "프로젝트를 시작하세요" 대신 맥락 맞는 다음 행동(D9).
    printNextStep(selectDoctorOkNextStep(projectMaturity(cwd)))
  }

  // SoT(3층) CI 게이트: --strict 면 규칙 드리프트를 실패로 승격(exit 1). 기본 호출은 경고만 유지.
  if (opts.strict && ruleDrifted) {
    console.log('')
    console.log(chalk.red.bold('  ❌ --strict: 규칙 드리프트 발견 → 실패 처리 (vhk sync 로 동기화 후 다시 실행)'))
    process.exitCode = 1
  }
}
