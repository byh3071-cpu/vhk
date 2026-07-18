#!/usr/bin/env node
// #292-G3 스파이크: vhk work 래퍼 타당성 — 자식 프로세스 TTY 패스스루 육안 채점용.
// 원본(2026-07-13)이 미커밋 로컬로 소실돼 재생성(2026-07-18). 채점 결과에 따라 G3 강행/축소/보류.
// 사용: node scripts/spike-g3-process-wrap.mjs [명령...]   (기본: powershell)
import { spawn } from 'node:child_process'

const argv = process.argv.slice(2)
const cmd = argv[0] ?? 'powershell'
const args = argv.slice(1)

console.log('━━━ G3 스파이크: 프로세스 랩 육안 채점 ━━━')
console.log(`래핑 대상: ${cmd} ${args.join(' ')}`)
console.log('')
console.log('채점 체크리스트 (자식 셸 안에서 직접 해보고 O/X):')
console.log('  1. 색상   — ls·git status 등 출력 색이 살아있는가')
console.log('  2. Ctrl+C — 자식 안의 명령만 끊기고 래퍼는 안 죽는가')
console.log('  3. 리사이즈 — 창 크기 바꿔도 레이아웃이 따라오는가')
console.log('  4. 대화형 — 방향키·탭완성·한글 입력이 되는가')
console.log('  5. 종료감지 — 자식 exit 시 아래 스냅샷 라인이 찍히는가')
console.log('')
console.log('자식 셸 시작 — 채점 끝나면 exit 로 나오세요.')
console.log('─'.repeat(50))

const startedAt = Date.now()
const child = spawn(cmd, args, { stdio: 'inherit', shell: false })

// Ctrl+C는 자식에게만 — 래퍼는 자식 종료로만 끝난다 (체크리스트 2번 검증 지점)
process.on('SIGINT', () => {})

child.on('error', (err) => {
  console.error(`\n[G3] spawn 실패: ${err.message}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  const sec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log('─'.repeat(50))
  console.log(`[G3 종료감지 스냅샷] exit=${code} signal=${signal ?? '없음'} 세션 ${sec}s`)
  console.log('→ 이 라인이 보였다면 체크리스트 5번 = O')
  console.log('→ 채점 결과는 docs/state/next-task.md 사람 큐에 O/X 로 기록')
  process.exit(code ?? 0)
})
