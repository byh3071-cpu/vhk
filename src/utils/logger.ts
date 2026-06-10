import chalk from 'chalk'

// 출력 SoT(Goal 51): 모든 렌더가 이 단일 sink 를 거친다.
// → 조용한 모드(setQuiet)·테스트 출력 캡처(setSink)를 한 지점에서 제어 가능.
//   raw `console.log(chalk…)` 직접 호출은 이 단일 지점을 우회하므로
//   scripts/check-no-raw-output.mjs 가드가 신규 도입을 차단한다.

let quiet = false
let sink: (line: string) => void = (line) => console.log(line)

/** 조용한 모드 토글. true 면 일반 출력 억제(error 는 예외 — 실패 은폐 금지). */
export function setQuiet(value: boolean): void {
  quiet = value
}

export function isQuiet(): boolean {
  return quiet
}

/**
 * 출력 sink 를 교체한다(테스트 캡처·리다이렉트용). 이전 sink 로 되돌리는 복원 함수를 반환.
 */
export function setSink(fn: (line: string) => void): () => void {
  const prev = sink
  sink = fn
  return () => {
    sink = prev
  }
}

// force=true 면 quiet 여도 출력(error 전용 — 실패는 항상 노출).
function emit(line: string, force = false): void {
  if (quiet && !force) return
  sink(line)
}

export const log = {
  success: (msg: string) => emit(chalk.green(`✅ ${msg}`)),
  error: (msg: string) => emit(chalk.red(`❌ ${msg}`), true),
  warn: (msg: string) => emit(chalk.yellow(`⚠️ ${msg}`)),
  info: (msg: string) => emit(chalk.blue(`ℹ️ ${msg}`)),
  step: (msg: string) => emit(chalk.bold(`\n▸ ${msg}`)),
  // 렌더 프린터 4종 확장: 장식 없는 본문 / 흐린 보조문구 / 강조 / 목록 항목.
  plain: (msg: string) => emit(msg),
  dim: (msg: string) => emit(chalk.dim(msg)),
  bold: (msg: string) => emit(chalk.bold(msg)),
  list: (msg: string) => emit(`  • ${msg}`),
}
