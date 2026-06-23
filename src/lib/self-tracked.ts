// Goal 85 (#315): vhk 자기 산출 추적파일의 dirty 판정 화이트리스트 — 단일 SoT.
//
// 문제(자기참조 봉인): vhk verify 는 종료 시 .vhk/ledger.jsonl(evidence-ledger)·
// .vhk/events/ai-actions.jsonl(action-ledger) 에 증거를 append 한다. 이 두 파일은
// RFC 0056(증거 영속)을 위해 **의도적으로 git 추적**된다(gitignore 제외 안 함).
// 그래서 verify 직후엔 작업트리가 늘 dirty → freshness/receipt 가 "낡은 증거(dirty)"로
// 늘 block 되는 자기모순(#315, severity:high). 소스를 커밋까지 끝낸 clean 상태에서도
// vhk 자신이 남긴 ledger 한 줄 때문에 영원히 빨강이 된다.
//
// 해결: dirty 판정(getCommitInfo) 에서 이 자기 산출 추적파일만 제외한다. 추적은 유지하되
// (gitignore 로 빼면 0056 증거영속이 붕괴) dirty "판정"에서만 무시한다.
//
// ★사각지대(정직 — Goal 85 ②자기참조 한계):
//   이 파일들을 dirty 판정에서 빼면, vhk 가 자기 ledger/events 를 위조·조작해도
//   freshness/receipt 가 그 변경을 dirty 로 잡지 못한다. 즉 "vhk 가 자기 증거를
//   날조해도 자기 도구로는 못 잡는다"는 자기참조 사각지대가 구조적으로 남는다.
//   그래서 화이트리스트는 **최소·정확**하게(아래 두 종류만), 테스트로 과확장 0 을 고정한다.
//   이 한계는 RFC 0056 의 ②자기참조 문제의 연장이며 정직하게 공개한다.

import { join } from 'node:path'

/**
 * vhk 가 verify 종료 시 스스로 갱신하는 **git 추적되는** 산출 파일 목록.
 * dirty 판정에서만 제외 대상. 향후 receipt decision 경로도 이 SoT 를 재사용한다.
 *
 * - `.vhk/ledger.jsonl`        — 증거 원장(evidence-ledger, Goal 45). LEDGER_PATH_REL 과 동일 경로.
 * - `.vhk/events/ai-actions.jsonl` — 행동 원장(action-ledger, Goal 55). ACTION_LEDGER_PATH_REL 과 동일.
 *
 * 경로는 git porcelain 출력 규칙(항상 POSIX `/` 슬래시)에 맞춰 슬래시로 보관.
 * `.vhk/events/` 하위의 *.jsonl 전반을 미래 확장 대비로 prefix 매칭한다(아래 isSelfTrackedPath).
 */
export const SELF_TRACKED_FILES: readonly string[] = [
  '.vhk/ledger.jsonl',
  '.vhk/events/ai-actions.jsonl',
] as const

/** `.vhk/events/` 하위 *.jsonl 은 vhk 자기 산출 이벤트 원장 → prefix 로 일괄 제외. */
const SELF_TRACKED_DIR_PREFIX = '.vhk/events/'

/** 경로를 비교 정규화: Windows 백슬래시 → `/`, 선행 `./` 제거. */
function normalizeRel(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * 주어진 (레포 루트 상대) 경로가 vhk 자기 산출 추적파일인가.
 * 정확 일치(SELF_TRACKED_FILES) 또는 `.vhk/events/*.jsonl` prefix 매칭.
 * 과확장 방지: 그 외 `.vhk` 파일(config.json·context.md 등)·소스 파일은 false.
 */
export function isSelfTrackedPath(rel: string): boolean {
  const n = normalizeRel(rel)
  if (SELF_TRACKED_FILES.includes(n)) return true
  // .vhk/events/ 하위의 .jsonl 만(다른 확장자·다른 디렉터리는 제외 — 최소·정확).
  return n.startsWith(SELF_TRACKED_DIR_PREFIX) && n.endsWith('.jsonl')
}

/**
 * `git status --porcelain` 한 줄에서 경로를 추출.
 * 형식: `XY <path>` (XY=2자 상태코드). rename/copy 는 `XY orig -> new` → 도착지(new) 사용.
 * 따옴표 경로(공백/특수문자, core.quotepath)는 보수적으로 그대로 둔다(매칭 실패 시 dirty 유지 = 안전측).
 */
export function porcelainPath(line: string): string {
  // 상태코드 2자 + 공백 1자 이후가 경로부. (porcelain v1 고정폭)
  const body = line.slice(3)
  const arrow = body.indexOf(' -> ')
  return arrow >= 0 ? body.slice(arrow + 4) : body
}

/**
 * porcelain 출력 라인 배열에서 vhk 자기 산출 추적파일 변경만 걸러낸다.
 * @returns 자기파일을 제외한 나머지 변경 라인(이게 비어 있으면 "자기 ledger 만 dirty" → clean 취급).
 */
export function filterSelfTrackedLines(lines: string[]): string[] {
  return lines.filter((line) => !isSelfTrackedPath(porcelainPath(line)))
}

/** join() 한 절대/상대 경로가 자기 산출 파일인지 비교용 — 다른 모듈이 경로 상수로 재사용. */
export const SELF_TRACKED_LEDGER_REL = join('.vhk', 'ledger.jsonl')
export const SELF_TRACKED_EVENTS_DIR_REL = join('.vhk', 'events')
