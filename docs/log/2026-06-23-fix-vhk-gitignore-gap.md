# 2026-06-23 — .vhk/.gitignore 갭 수정 (#331 + 갭⑤)

## 한 일
일회성/사적 산출물 4종이 git 으로 새던 갭을 막음.

- `src/templates/vhk-dir.ts` `VHK_GITIGNORE_TEMPLATE`: `recall-log.jsonl`·`eval/recall-eval.json` 추가
  (`ops-prompt.md`·`sell-prompt.md` 는 이미 템플릿에 있었음 — 확인). README 트래킹 표에도 2행 추가.
- 런타임 자기방어(이미 init 된 기존 프로젝트도 보호): `logRecall`(recall-log.ts) 와
  `memoryEvalInit`(memory-eval.ts) 가 쓰기 시 `ensureVhkIgnored` 로 멱등 등록.
  verify.ts 의 `reports/` 자기방어 패턴 답습.

## 경계(준수)
`.vhk/ledger.jsonl`·`.vhk/events/*` 는 repo 영속 증거(goal 45/82/85)라 의도적 추적 → gitignore 에
넣지 않음. 회귀 가드 테스트로 고정(템플릿에 ledger·events 가 들어가면 실패).

## 테스트
- init.test.ts: 4종 등록 + ledger/events 미등록 회귀 가드
- recall-log.test.ts: logRecall 자동 등록 + 멱등(라인 1개)

## 후속(범위 밖)
- #326 슬래시 변형 중복 추가(`backups` vs `backups/` 외 변형)는 별 이슈.
- 메인 repo 자체 `.vhk/.gitignore` 는 stale(work-prompt.md 등 독립 항목 존재) — 다음 recall/eval
  실행 시 런타임 자기방어로 자가치유됨.
