import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import {
  scanProjectForSecrets,
  MAX_SECRET_FINDINGS,
} from '../lib/scan-secrets.js'
import { MAX_SCAN_FILE_BYTES } from '../lib/scan-files.js'
import { scanLlmGuardrails } from '../lib/scan-llm-guardrails.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'

export async function secure() {
  console.log(chalk.bold(`\n${ko.secure.title}\n`))

  const cwd = process.cwd()
  const gitignorePath = path.join(cwd, '.gitignore')
  const hasGitignore = fs.existsSync(gitignorePath)

  if (!hasGitignore) {
    console.log(chalk.yellow(`  ${ko.secure.noGitignore}`))
    console.log(chalk.dim('  .env 파일이 커밋될 수 있습니다.\n'))
  } else {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8')
    if (!gitignoreContent.includes('.env')) {
      console.log(chalk.yellow(`  ${ko.secure.noEnvInGitignore}`))
      console.log(chalk.dim('  추가를 권장합니다.\n'))
    }
  }

  console.log(chalk.dim(`  ${ko.secure.scanning}\n`))

  // 두 스캔 모두 실행 후 각 섹션 출력 (early return 제거 → LLM 스캔 항상 실행)
  const { findings, scannedFiles, truncated, truncationReasons } = scanProjectForSecrets(cwd)
  const llmScan = scanLlmGuardrails(cwd)

  // --- 시크릿 스캔 결과 ---
  console.log(chalk.dim(`  📂 ${scannedFiles}개 파일 스캔 완료 (lock·node_modules·>${MAX_SCAN_FILE_BYTES / 1024}KB 제외)`))
  if (truncated) {
    // Goal 59: truncated 는 이제 findings-cap 뿐 아니라 file-size·line-length 도 포함 → 실제 사유를 정직하게 표기.
    const reasonText = truncationReasons
      .map((r) =>
        r === 'findings-cap'
          ? `발견 ${MAX_SECRET_FINDINGS}건 한도 도달`
          : r === 'file-size'
            ? `${MAX_SCAN_FILE_BYTES / 1024}KB 초과 파일 스킵`
            : r === 'line-length'
              ? '초장문(4000자 초과) 라인 스킵'
              : r
      )
      .join(', ')
    console.log(chalk.yellow(`  ⚠️  스캔 불완전 — 일부 미검사(${reasonText}). 결과가 완전하지 않을 수 있습니다.`))
  }
  console.log('')

  if (findings.length === 0) {
    console.log(chalk.green.bold(`  ${ko.secure.clean}`))
    console.log('')
  } else {
    const critical = findings.filter(f => f.severity === 'critical')
    const high = findings.filter(f => f.severity === 'high')
    const medium = findings.filter(f => f.severity === 'medium')

    if (critical.length > 0) {
      console.log(chalk.red.bold(`  🚨 CRITICAL — ${critical.length}건`))
      critical.forEach(f => {
        console.log(chalk.red(`    ✖ ${f.patternName}`))
        console.log(chalk.dim(`      ${f.file}:${f.line} → ${f.match}`))
      })
      console.log('')
    }

    if (high.length > 0) {
      console.log(chalk.yellow.bold(`  ⚠️ HIGH — ${high.length}건`))
      high.forEach(f => {
        console.log(chalk.yellow(`    ⚠ ${f.patternName}`))
        console.log(chalk.dim(`      ${f.file}:${f.line} → ${f.match}`))
      })
      console.log('')
    }

    if (medium.length > 0) {
      console.log(chalk.blue.bold(`  ℹ MEDIUM — ${medium.length}건`))
      medium.forEach(f => {
        console.log(chalk.blue(`    ℹ ${f.patternName}`))
        console.log(chalk.dim(`      ${f.file}:${f.line} → ${f.match}`))
      })
      console.log('')
    }

    console.log(chalk.bold(`  ${ko.secure.summary}`))
    console.log(`  총 ${chalk.red(String(findings.length))}건 감지 | CRITICAL: ${critical.length} | HIGH: ${high.length} | MEDIUM: ${medium.length}`)
    console.log('')
    console.log(chalk.dim('  💡 조치 방법:'))
    console.log(chalk.dim('    1. 해당 파일에서 시크릿을 제거하고 환경변수로 이동'))
    console.log(chalk.dim('    2. git history에서도 제거: git filter-branch 또는 BFG Repo-Cleaner'))
    console.log(chalk.dim('    3. 유출된 키는 즉시 폐기하고 재발급\n'))

    if (critical.length > 0 || high.length > 0) {
      process.exitCode = 1
    }
  }

  // --- LLM 가드레일 스캔 (goal72: PAT-001/002/004) ---
  console.log(chalk.bold('  🤖 LLM 가드레일 검사 (PAT-001/002/004)\n'))

  if (llmScan.findings.length === 0) {
    console.log(chalk.green(`  ✅ LLM 가드레일 이상 없음 (${llmScan.scannedFiles}개 파일)\n`))
  } else {
    const byPat = new Map<string, typeof llmScan.findings>()
    for (const f of llmScan.findings) {
      if (!byPat.has(f.pat)) byPat.set(f.pat, [])
      byPat.get(f.pat)!.push(f)
    }

    const patDesc: Record<string, string> = {
      'PAT-001': '닫힌어휘 allowlist — LLM 출력이 select/enum에 직접 기입',
      'PAT-002': 'JSON 3단 게이트 누락 — extract→parse→validate 없이 직접 파싱',
      'PAT-004': '입력 클램프 누락 — 노출 진입점 LLM 호출에 Math.min/CAP 없음',
    }

    for (const [pat, items] of byPat) {
      console.log(chalk.yellow(`  ⚠️  ${pat} — ${items.length}건 (${patDesc[pat] ?? ''})`))
      for (const item of items) {
        const loc = item.line ? `:${item.line}` : ''
        console.log(chalk.dim(`     ${item.file}${loc}`))
        if (item.evidence) console.log(chalk.dim(`       → ${item.evidence}`))
      }
      console.log('')
    }

    console.log(chalk.dim('  💡 휴리스틱 검출 — false-positive 가능. 각 파일 직접 확인 후 조치:'))
    console.log(chalk.dim('    PAT-001: ALLOWED_ 상수 + LLM 출력 필터링 추가'))
    console.log(chalk.dim('    PAT-002: extractJsonObject() 래퍼 + 필수키 검증 추가'))
    console.log(chalk.dim('    PAT-004: Math.min(input, CAP) 클램프 추가'))
    console.log(chalk.dim('    패턴 원본: yohan-brain/docs/patterns/PAT-00{1,2,4}-*.md\n'))
  }

  if (findings.length === 0 && llmScan.findings.length === 0) {
    printNextStep({
      message: '보안 이상 없음! 깨끗합니다.',
      command: 'vhk 정리',
      cursorHint: '오늘 한 일 정리해줘',
    })
  }
}
