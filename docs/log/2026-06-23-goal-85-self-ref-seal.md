# 2026-06-23 — Goal 85 (#315) 자기참조 봉인: dirty 판정에서 자기 산출 추적파일 제외

## 문제
`vhk verify` 종료 시 `appendLedgerEntry`(`.vhk/ledger.jsonl`)·`appendActionEntry`(`.vhk/events/ai-actions.jsonl`)가
증거를 무조건 append 한다. 이 두 파일은 RFC 0056(증거 영속)을 위해 **의도적으로 git 추적**된다.
그래서 verify 직후 작업트리가 늘 dirty → `getCommitInfo().dirty=true` → `checkEvidenceFreshness`/review/receipt 가
"낡은 증거(dirty)"로 늘 block 되는 자기모순(#315, severity:high). 소스를 커밋까지 끝낸 clean 상태에서도
vhk 자신이 남긴 ledger 한 줄 때문에 영원히 빨강.

## 해결
- **SoT 단일 모듈** `src/lib/self-tracked.ts` 신설 — vhk 자기 산출 추적파일 화이트리스트(`.vhk/ledger.jsonl`·`.vhk/events/*.jsonl`)와
  `isSelfTrackedPath`/`porcelainPath`/`filterSelfTrackedLines`. 향후 receipt decision 경로도 같은 SoT 재사용.
- `src/lib/git-repo.ts` `getCommitInfo`: `git status --porcelain` 출력을 `filterSelfTrackedLines` 로 거른 뒤 dirty 판정.
  이 **단일 통로**가 verify 증거·`checkEvidenceFreshness`(현재/증거 dirty)·review 신선도 전부에 반영 → 분산 0.

## 핵심 교훈
- **porcelain collapse 함정**: 기본 `git status --porcelain` 은 미추적 디렉터리를 `?? .vhk/` 로 접어(collapse) 개별
  파일 경로를 안 준다. 접힌 `.vhk/` 안엔 config.json 같은 비-자기파일이 섞일 수 있어 통째 제외하면 과확장.
  → `--untracked-files=all` 로 개별 파일을 펴서 정확히 자기파일만 필터(testmap.ts 와 동일 이유). 이게 없었으면
  "fresh 프로젝트 첫 verify" 케이스에서 과확장/오판이 났다.
- 필터 지점은 `dirty` 가 태어나는 한 곳(`getCommitInfo`)에 둬야 3개 소비처(verify·check-fresh·review)에 한 번에 반영된다.
  순수함수(self-tracked.ts)로 분리해 테스트로 과확장 0 을 고정.

## 한계(정직 — ②자기참조 사각지대)
자기파일을 dirty 판정에서 빼면 **vhk 가 자기 ledger/events 를 위조·조작해도 자기 도구로는 못 잡는다**.
→ 화이트리스트를 최소·정확(두 종류만)하게 하고 테스트로 과확장 0 고정. self-tracked.ts·git-repo.ts 주석에 명시.
RFC 0056 ②자기참조 문제의 연장 — "자기 거짓완료 정직 공개" 톤과 일치.

## 산출물
- 신규: `src/lib/self-tracked.ts`, `tests/self-tracked.test.ts`, `scripts/check-goal-85.mjs`
- 수정: `src/lib/git-repo.ts`(getCommitInfo 필터), `tests/verify-sha.test.ts`(퇴행·과확장 0 회귀)
- 게이트: `pnpm build` ✓ · 전체 테스트 1819 pass(standup e2e 1건 타임아웃 플레이크 — 격리 재실행 green) · check-goal-85 ✓ · check-goal-44 ✓(회귀 0)
