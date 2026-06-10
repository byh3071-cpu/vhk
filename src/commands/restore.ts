import chalk from 'chalk'
import { prompt } from '../lib/prompt.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { listBackups, restoreBackup } from '../lib/backup.js'

/**
 * 백업 복원 — `.vhk/backups/<id>/` 로컬 복사본에서 파일 복원 (git 무관).
 * undo 가 못 메우는 구멍(언커밋 sync 덮어쓰기)을 복구한다.
 * 대화형: 목록 선택. 비대화형(TTY 아님): id 인자 필수 — 멈추지 않고 안내 후 종료.
 */
export async function restore(id?: string): Promise<void> {
  console.log(chalk.bold(`\n${ko.restore.title}`))
  console.log(chalk.gray('─'.repeat(40)))
  console.log(chalk.dim(`  ${ko.restore.notGitNote}`))

  const cwd = process.cwd()
  const backups = listBackups(cwd)
  if (backups.length === 0) {
    console.log(chalk.yellow(`\n${ko.restore.noBackups}`))
    return
  }

  let targetId = id
  if (!targetId) {
    // id 미지정 — 비대화형이면 선택 불가, 목록+안내 후 종료 (멈춤 금지)
    if (!process.stdout.isTTY) {
      console.log(chalk.cyan(`\n${ko.restore.listHeader}`))
      for (const b of backups) console.log(`  ${b.id} (${b.files.length}개 파일)`)
      console.log(chalk.yellow(`\n${ko.restore.nonTtyHint}`))
      return
    }
    const { picked } = await prompt<{ picked: string }>([
      {
        type: 'list',
        name: 'picked',
        message: ko.restore.selectPrompt,
        choices: backups.map((b) => ({
          name: `${b.id} (${b.files.length}개 파일)`,
          value: b.id,
        })),
      },
    ])
    targetId = picked
  }

  try {
    const restored = restoreBackup(targetId, cwd)
    console.log(chalk.green(`\n${ko.restore.restored(restored.length, targetId)}`))
    for (const r of restored) console.log(chalk.gray(`   ${r}`))
    printNextStep({
      message: '백업 복원 완료! 변경 내용을 확인하세요.',
      command: 'vhk diff',
      cursorHint: '변경사항 보여줘',
    })
  } catch {
    console.log(chalk.red(`\n${ko.restore.notFound(targetId)}`))
    process.exitCode = 1
  }
}
