---
vhk_format: 1
type: goal
id: 52
title: 테스트 사정거리 보강 — Notion 실API 경로 + restore 커맨드 — P2
status: DONE
priority: P2
created: 2026-06-08
completed: 2026-06-10
leads_to: 테스트 4→5 · 미커버 핵심경로 봉쇄
---

# Goal 52: 테스트 사정거리 보강

> 출처: RFC 0048 §3 · 13-에이전트 감사(2026-06-08) 테스트 차원 medium/low.

## 근거 (실측)
- Notion 실 API 경로 무테스트 — `src/lib/notion-import.ts`: `importNotionPrd`(NOTION_TOKEN 누락 throw), `fetchAllBlocks`(has_more 페이지네이션 재귀, :50-75), `pages.retrieve` 실패 경로. `tests/notion.test.ts`는 순수함수(extractPageId/parseBlocks)만 검증.
- `src/commands/restore.ts` 전용 테스트 부재 — 백업 복원은 데이터 복구 경로라 1~2케이스 가치 있음(`restoreBackup` try/catch :47-59).

## 동작
- `@notionhq/client`를 `vi.mock`으로: (a) NOTION_TOKEN 없을 때 throw (b) `blocks.children.list` has_more 누적 (c) `retrieve` reject 시 메시지 — 3케이스.
- restore: 정상복원 1케이스 + 미존재 id시 `process.exitCode=1`·notFound 메시지 1케이스(backup 헬퍼는 backup.test.ts에 이미 있으니 커맨드 셸만).
- (옵션) mutation/property 샘플 1~2개로 단언 강도 검증.

## 수용 기준
- Notion 실API 3경로 + restore 2케이스 테스트 추가. 회귀 0.

## Completion Check
- [x] notion-import vi.mock 3케이스(auth throw·페이지네이션·retrieve 실패) — tests/notion.test.ts
- [x] restore 커맨드 2케이스(정상복원·미존재 id exitCode=1) — tests/restore.test.ts
- [ ] (옵션) mutation/property 샘플 — 스코프 아웃(3+2 핵심경로로 충분)
- [x] 공통 게이트 통과, 회귀 0
- [x] check-goal-52.mjs 통과

## ✅ Completion (2026-06-10)
- **구현부 무수정** — 테스트만 추가(미커버 핵심경로 봉쇄).
- **Notion**(tests/notion.test.ts 확장, `vi.mock('@notionhq/client')` class mock): ① NOTION_TOKEN 누락 throw ② fetchAllBlocks `has_more` 페이지네이션 2회 누적 ③ pages.retrieve reject 전파. mock 은 `new Client` 생성자 호환 위해 class 사용, beforeEach 리셋으로 케이스 격리.
- **restore**(tests/restore.test.ts 신규): tmpdir chdir + saveBackup 헬퍼 재사용. ① id 지정 정상 복원(파일 검증) ② 미존재 id → process.exitCode=1 + notFound 안내. 구현부 catch 분리 불요(현 구조로 exitCode 검증 가능).
- **게이트**: build ✓ · tsc ✓ · test:run 1400 pass(+5, 회귀 0) · check-goal-52 ✓. backup.test 회귀 0.

## Mandatory Reading
- src/lib/notion-import.ts · src/commands/restore.ts · tests/notion.test.ts · tests/backup.test.ts
