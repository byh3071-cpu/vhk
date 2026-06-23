# 2026-06-23 — diff-cover 측정 결과 영속화 (#371)

## 한 일
`vhk diff-cover` 측정 결과가 콘솔로만 출력되고 휘발 → 커버리지 추세 분석이 불가능했다.
매 실행 시 결과를 `.vhk/events/diff-cover.jsonl` 에 **append**(append-only JSONL)로 영속화.

- 신규 `src/lib/diff-cover-log.ts`
  - `buildDiffCoverEntries(result, commit, ts)` — 순수. 파일 단위 1엔트리.
  - `appendDiffCoverLog(cwd, entries)` — 원자적 쓰기(temp→rename). 빈 배열이면 미생성·0 반환.
  - `readDiffCoverLog(cwd)` — JSONL 파싱(손상 줄 skip·BOM-safe·최소 스키마 검증).
  - 스키마: `{ts, sha, shortSha, dirty, file, added, uncovered, ratio, inCoverage}` — 측정치만(미커버 라인 원문은 안 남김).
- `src/commands/diff-cover.ts` — 측정·출력 직후 best-effort 로 영속(try-catch). exit code·콘솔 출력 불변.

## 결정
- **위치**: `.vhk/events/diff-cover.jsonl` (이슈 제안 그대로).
- **gitignore 정합 = 추적(gitignore 안 함)**. 근거: 측정치(커버율·SHA·라인 수)만 담고 검색어/사적 경로 원문은 안 남긴다 → recall-log(gitignore) 가 아니라 ledger/events(추적) 패턴.
  - `.gitattributes events/*.jsonl merge=union` 가 이미 커버(멀티PC append 분기 줄 보존).
  - `self-tracked.ts` 의 `.vhk/events/*.jsonl` prefix 제외 → diff-cover 가 스스로 append 해도 `getCommitInfo` dirty 판정에서 빠짐(자기참조 봉인, #315 동일 구조). 별도 코드 변경 불필요.
  - `vhk-dir.ts` 템플릿이 이미 events 추적·.gitattributes 를 스캐폴딩 → 템플릿 변경 불필요.

## 테스트
- `tests/diff-cover-log.test.ts` (신규) — build/append/read·append-only·빈배열·손상줄 skip·비-git null.
- `tests/diff-cover.test.ts` — git-repo·diff-cover-log mock 으로 부수효과 격리 + persist 호출 검증 + best-effort(throw 해도 exit 0·출력 불변) + 측정대상 없으면 미호출.
- `tests/self-tracked.test.ts` — `.vhk/events/diff-cover.jsonl → true` 명시 고정.

## 게이트
- `pnpm build` green · `pnpm lint` (eslint src) green · `pnpm test` 1973 pass(182 files).
- `node dist/index.js secure scan` CRITICAL:0 (INFO 1 = 테스트 픽스처).
- 샌드박스 e2e: diff-cover 실행 → 콘솔 출력·exit 0 불변 + jsonl 1줄 생성, 재실행 시 2줄(append 확인).

## 남은 위험/후속
- 멱등(같은 sha 중복 방지)은 이슈 수용기준상 후속(#branch 보강). 현재는 매 실행 append.
- `uncoveredBranch`·`classify` 필드는 후속 이슈에서 채움(line 기반 우선).
