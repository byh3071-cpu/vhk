import { safeExecFile, type ExecResult } from './exec.js'

// Goal 48: MCP↔CLI 단일 진실원 — 세션 git 동작의 *유일한* git 인보케이션 SoT.
//
// 배경: MCP(src/mcp/server.ts)가 save/undo/status/diff(+ship/recap/doctor)의 git 호출을
// CLI(src/commands/*)와 따로 인라인 재구현했고, 이 중복이 #150/#152/#161 드리프트 버그를
// 출하했다. 이제 "같은 git 질문 = 함수 하나" — CLI 명령과 MCP 핸들러가 아래 함수를 공유한다.
//
// 설계: 각 함수는 safeExecFile(Goal 46 단일 git 통로) 위에서 ExecResult 를 그대로 반환한다.
//   · throw 하지 않음 → MCP(.ok 검사) 와 CLI(필요 시 throw 로 승격) 둘 다 자연스럽게 소비.
//   · cwd 기본 process.cwd() → MCP(인자 생략)·CLI(gitRoot 전달) 파리티.
//   · porcelain 만 raw 보존(trimOutput:false) — 선행 공백(" M file")이 파싱에 load-bearing.

/** git status --porcelain — 선행 공백 보존(raw). 변경 파일 파싱의 SoT. */
export function statusPorcelain(cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['status', '--porcelain'], { cwd, trimOutput: false })
}

/** git branch --show-current — 현재 브랜치명. */
export function currentBranch(cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['branch', '--show-current'], { cwd })
}

/** git log --oneline -n — 최근 커밋 n개(한 줄 요약). */
export function recentCommits(n: number, cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['log', '--oneline', `-${n}`], { cwd })
}

/** git add . — 전체 스테이징. */
export function stageAll(cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['add', '.'], { cwd })
}

/** git commit -m <message>. */
export function commit(message: string, cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['commit', '-m', message], { cwd })
}

/** git push — 현재 브랜치 업로드. */
export function push(cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['push'], { cwd })
}

/** git reset --soft HEAD~n — 최근 n개 커밋 되돌리기(변경은 스테이징 보존). */
export function softReset(n: number, cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['reset', '--soft', `HEAD~${n}`], { cwd })
}

/** git diff --stat — unstaged 변경 통계. */
export function unstagedStat(cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['diff', '--stat'], { cwd })
}

/** git diff --cached --stat — staged 변경 통계. */
export function stagedStat(cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['diff', '--cached', '--stat'], { cwd })
}

/** git ls-files --others --exclude-standard — 추적 안 된 새 파일. */
export function untrackedFiles(cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['ls-files', '--others', '--exclude-standard'], { cwd })
}

/** git diff --numstat HEAD — HEAD 대비 총 증감(파일/추가/삭제 합산용). */
export function numstatHead(cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['diff', '--numstat', 'HEAD'], { cwd })
}

/** git log --format=%h %ad %s --date=short -n — recap 용 날짜 포함 히스토리. */
export function recapLog(n: number, cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['log', '--format=%h %ad %s', '--date=short', `-${n}`], { cwd })
}

/** git --version — doctor 환경 점검. */
export function gitVersion(): ExecResult {
  return safeExecFile('git', ['--version'])
}

/** ExecResult → 성공이면 out, 실패면 빈 문자열. diff 등 에러를 삼키고 ''로 처리하는 소비자용. */
export function okOut(r: ExecResult): string {
  return r.ok ? r.out : ''
}
