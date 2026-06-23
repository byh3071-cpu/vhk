# 2026-06-23 — 멀티PC dirty-block 해소 (.gitattributes merge=union + verify 저소음 커밋)

> 진입점: 이 작업은 RFC0056 증거영속(events·ledger git 추적, #315)과 멀티PC 환경의
> 충돌 지점을 해소한다. 관련 파일 — `src/templates/vhk-dir.ts`(템플릿)·`src/commands/init.ts`(배선)·
> `src/lib/git-session.ts`(commitPaths)·`src/commands/verify.ts`(저소음 커밋 배선)·`.vhk/.gitattributes`(R1).

## 배경 (문제)

`.vhk/events/ai-actions.jsonl`·`.vhk/ledger.jsonl` 은 런타임 append 되면서 **git 추적**된다
(RFC0056 증거 영속·#315·goal 45/55/85 — untrack/gitignore 절대 금지, 증거영속 붕괴 방지).

멀티PC 에서 이게 두 가지 마찰을 일으킨다:
- (A) 양쪽 PC 가 각자 events/ledger 에 append → 분기 커밋 → 병합 시 줄 충돌 위험.
- (B) 한쪽의 미커밋 증거 변경이 외부 git pull 의 fast-forward 를 막음(DirtySkipped).

## 해결 (두 축)

### A축 — `.gitattributes` merge=union (템플릿 + init 배선 + R1)
- `VHK_GITATTRIBUTES_TEMPLATE()` 신규(`src/templates/vhk-dir.ts`) — `events/*.jsonl`·`ledger.jsonl`
  에만 `merge=union`. git 내장 드라이버라 별도 .gitconfig/merge driver 등록 불필요.
- `generateFiles()` 가 `.vhk/.gitattributes` 를 생성하도록 배선(`src/commands/init.ts`).
  `.vhk/.gitignore` 본문·루트 .gitignore·.vhkignore 는 불변(events/ledger 추적 유지).
- R1: 이 레포 자신의 `.vhk/.gitattributes` 도 생성(없으면 vhk 자신의 events/ledger 가
  union 적용 못 받음). `git check-attr merge -- .vhk/events/ai-actions.jsonl` → `union` 검증.

### B축 — verify 저소음 커밋 (`commitPaths`)
- `commitPaths(message, paths, cwd)` 신규(`src/lib/git-session.ts`) — `git add -- <paths>` →
  `git diff --cached --quiet -- <paths>`(변경 없으면 commit skip) → `git commit -m <msg> -- <paths>`.
  **stageAll(git add .) 미사용** — 명시 경로만. ExecResult 반환(throw 0, 비치명).
- `verify` 명령 본체에서 `verifyEvidence(cwd)` **직후** 1회 호출
  (`'.vhk/events/ai-actions.jsonl'`·`LEDGER_PATH_REL`).

## ★핵심 설계 — 커밋 위치 (receipt 무회귀)

커밋을 `verifyEvidence` 본체가 아니라 **verify 명령 함수 본체**에 둔다.
이유: `collectReceipt`(receipt.ts)는 `verifyEvidence` 호출 직후 `getCommitInfo` 로 HEAD SHA·
stale(작업시작 SHA≠HEAD) 를 읽는다. verifyEvidence 안에서 커밋하면 HEAD 가 영수증 평가 도중
이동 → receipt 의 ③stale 이 거짓 true → 거짓 CAUTION/BLOCK. dirty 값은 #315 가 events/ledger 를
제외하므로 불변 — 문제는 HEAD SHA 이동뿐. 그래서 verifyEvidence 본체는 손대지 않았다.

## 테스트 (TDD — 실패 테스트 먼저)
- `tests/git-session.test.ts` — commitPaths 단위(명시경로만 stage·"." 금지, staged 없으면
  skip, 변경 있으면 명시경로 commit, add 실패 즉시반환, cwd 통과).
- `tests/init.test.ts` — .gitattributes 씨앗 내용·과확장0·.gitignore 불변 + 실 git 레포에서
  `git check-attr` 로 events/ledger→union, context.md→unspecified 확정.
- `tests/verify.test.ts` — verify 1회→단일 커밋·직후 clean, 재실행 추가커밋≤1,
  ★verifyEvidence HEAD 불변(receipt stale 보호)★.

## 교훈
- 증거영속(추적 유지)과 멀티PC dirty 는 untrack 없이 양립 가능 — merge=union(병합)+저소음
  커밋(정리)으로 해결. untrack 은 증거영속을 붕괴시키므로 절대 금지.
- 부수효과(커밋)를 순수 평가 경로(verifyEvidence→receipt) 안에 넣으면 평가 입력(HEAD SHA)을
  오염시킨다. 커밋은 평가 바깥 명령 본체에 둬야 receipt stale 판정이 정직하다.

## 게이트
- pnpm build ✅ / pnpm test ✅ (180 files, 1908 tests) / secure scan CRITICAL:0 ✅
