# 2026-06-25 — Goal 87 PR1: receipt 의도 대조(intent) — 의도 장갑의 손바닥 잇기

> append-only dev log. RFC 0056 T1(receipt) 위에 **의도(mission) 검증 면**을 자동 루프에 합류시킨 작업.
> 진입점 기획: [2026-06-23 intent-glove-plan](2026-06-23-intent-glove-plan.md) · goal [87](../../goals/87-mission-verify-intent-check.md).

## 한 줄 결론

`vhk receipt` 가 `.vhk/mission.json`(scope/forbidden) 이 있으면 변경 파일을 자동 대조해 **forbidden 위반 → block · scope 밖 → caution** 을 decision 에 반영한다(5번째 증거 `intent`). 이전엔 receipt/verify 가 기계적 done(tsc·test·dirty·stale)만 보고 "시킨 범위(의도)를 지켰나"는 안 봤다 — 의도 장갑의 검증 면이 자동 루프에서 빠져 있던 구멍을 메웠다.

## 무엇을 / 어떻게 (옵션 A — receipt 5번째 증거)

선택지 A(receipt 에 `intent` 증거 추가) 채택 — 진입점 기획의 권장안. 이유: `checkMission` 이 이미 순수 함수라 글루만 필요하고, **latest.json 을 안 건드려** mission.ts:16 의 "별도 네임스페이스(latest.json 불변)" 격리 결정을 존중(옵션 B 는 이 격리를 깸).

- **`src/lib/receipt.ts` (순수)**
  - `ReceiptIntentEvidence { missionKnown, forbiddenHits, scopeWarnings }` 신설 + `ReceiptEvidence.intent?`(옵셔널 — `staleKnown` 패턴과 동형).
  - `decideReceipt`: 실차단에 `forbidden 위반(missionKnown && forbiddenHits>0)` 추가(red·dirty·stale 동급 — 변경 파일이 금지 glob 매치 = 결정론 사실). `scopeWarnings>0` 은 caution(advisory).
  - `receiptReasons`·`renderReceiptMarkdown` 에 의도 사유/⑤ intent 표행 추가(mission 없으면 행 자체가 없음).
  - 상단 불변식 주석 ① 갱신("실차단 3종"→"red·dirty·stale·forbidden 위반").
- **`src/commands/receipt.ts` (경계)**
  - `collectIntent(cwd)` — mission.json 있으면 `git status --porcelain -uall` → `parsePorcelainLines` → `filterSelfTrackedLines`(Goal 85 자기파일 제외 — dirty 와 **동일 기준**) → `porcelainPath` → `checkMission`. mission 없으면 `undefined`.
  - `collectReceipt` 가 `intent` 를 evidence 에 배선. (수동 `vhk mission check` 는 self-tracked 제외를 안 하므로 미세 차이 — 의도된 차이. receipt 자신이 남기는 .vhk/events 가 scope 경고를 만드는 자기참조 노이즈 방지.)

## 불변식 (수용 기준 충족)

- **하위호환**: mission.json 없으면 `intent=undefined` → decision·출력 변화 0.
- **단조성**: intent 는 block/caution 방향으로만 추가 — pass 격상 분기 없음(폭포 구조 유지).
- **과확장 0**: missionKnown 이어도 위반·경고 0 이면 pass(노이즈 유발 안 함).
- **GA**: 기존 시그니처 추가만(옵셔널 필드) — breaking 0. 신규 명령 0(등록 4지점 무영향).
- **latest.json 불변**: receipt 격리 경로만 사용 — mission 결과를 latest.json 에 안 박음.

## 검증

- `tsc --noEmit` EXIT=0 (strict 타입 안전) · `pnpm build` 성공(esbuild + DTS).
- **순수 판정 로직 12 assert 직접 검증 PASS**(tsx 로 `src/lib/receipt.ts` 동적 import — forbidden→block·scope→caution·하위호환·missionKnown=false 영향0·과확장0·단조성·실차단 우선·렌더 행·렌더 하위호환).
- **vitest 로컬은 worker 환경 crash**(Node25 + vitest4 forks on Windows, import 단계 0ms). **내 변경 무관 — stash 후 원본도 동일 crash 확인**(baseline). [[vhk-local-vitest-forks]] — CI(Linux)가 진실원.
- 추가한 `tests/receipt.test.ts` 통합 테스트(collectIntent: forbidden→block·scope→caution·하위호환·자기참조 회귀 4건)는 CI 에서 검증. `makeMissionRepo` 가 mission.json 을 커밋해 변경목록에서 빼는 함정 처리(안 그러면 mission.json 자체가 scope 밖으로 잡힘).

## 잔여 (후속 PR)

- **PR2**: `review` 가 forbidden 위반을 거짓완료 신호에 합류(confidence cap/경고 1줄).
- **PR3(선택)**: receipt `.md` 에 "의도 대조" 전용 섹션(scope/forbidden 상세).
- objective(목표 달성) 판정은 범위 밖 — 결정론(scope/forbidden)만. LLM judge 는 Goal 73.
