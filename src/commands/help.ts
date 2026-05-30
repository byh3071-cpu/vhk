import chalk from 'chalk'

/**
 * 초보자용 quick actions — 자연어 "도움말/사용법/명령어" 라우팅의 **읽기전용** 대상.
 * (적대 리뷰 HIGH 수정: 이전엔 도움말이 start 마법사로 라우팅돼 빈 디렉터리에서
 *  scaffold 가 유발됐다. 도움말은 절대 상태를 바꾸지 않는다 — 출력만.)
 */
export const QUICK_ACTIONS: ReadonlyArray<{ say: string; does: string }> = [
  { say: '상태 알려줘', does: 'vhk status' },
  { say: '뭐 바뀌었어?', does: 'vhk diff' },
  { say: '저장해줘', does: 'vhk save' },
  { say: '오늘 한 일 정리해줘', does: 'vhk recap' },
  { say: '다음에 뭐 하면 돼?', does: 'vhk goal next' },
  { say: '규칙 동기화해줘', does: 'vhk sync' },
  { say: '백업 복원해줘', does: 'vhk restore' },
  { say: '보안 점검해줘', does: 'vhk secure scan' },
  { say: '새 프로젝트 시작', does: 'vhk start' },
  { say: '전체 명령어 보기', does: 'vhk --help' },
]

/** 자연어로 vhk 를 쓰는 법(quick actions) 출력. 부수효과 없음(콘솔 출력만). */
export function quickActions(): void {
  console.log(chalk.bold('\n🧭 VHK — 이렇게 말하면 됩니다 (quick actions)'))
  console.log(chalk.gray('─'.repeat(40)))
  for (const a of QUICK_ACTIONS) {
    console.log(`  "${chalk.cyan(a.say)}"  →  ${chalk.dim(a.does)}`)
  }
  console.log(chalk.gray('\n  전체 명령은 `vhk --help` 또는 COMMANDS.md 를 보세요.'))
  console.log('')
}
