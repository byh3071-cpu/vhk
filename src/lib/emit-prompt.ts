import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { copyToClipboard } from './clipboard.js'

const VHK_DIR = '.vhk'

/**
 * Claude 에게 줄 프롬프트를 클립보드에 복사 + 항상 `.vhk/<fileName>` 사본 저장.
 * 클립보드 실패 시 화면에 프롬프트 전문 출력(사용자가 직접 복사).
 *
 * work(시작/인수인계) + 뒷단 트랙(content/launch/sell/ops) 공용 단일 SoT — 재구현 0 (RFC 0052 §3).
 */
export function emitPrompt(prompt: string, fileName: string, label: string): void {
  let savedPath = ''
  try {
    mkdirSync(VHK_DIR, { recursive: true })
    savedPath = join(VHK_DIR, fileName)
    writeFileSync(savedPath, prompt, 'utf-8')
  } catch {
    savedPath = ''
  }

  const copied = copyToClipboard(prompt)
  if (copied) {
    console.log(chalk.green(`\n📋 Claude에게 줄 '${label}'을 클립보드에 복사했습니다! ✅`))
    if (savedPath) console.log(chalk.dim(`   (사본 저장: ${savedPath})`))
  } else {
    console.log(chalk.yellow(`\n⚠️ 클립보드 복사에 실패했어요 — 아래 프롬프트를 직접 복사하세요:`))
    if (savedPath) console.log(chalk.dim(`   (파일로도 저장됨: ${savedPath} — 열어서 복사 가능)`))
    console.log(chalk.gray('────────────────────────────────────────'))
    console.log(prompt)
    console.log(chalk.gray('────────────────────────────────────────'))
  }
}
