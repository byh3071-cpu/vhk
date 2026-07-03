# 2026-07-03 — SEO goal(21~26) 재조사 + report.ts HARD_STOP 가드 수정

> append-only. 추가만, 수정·삭제 금지.

## 한 일

goal 88~91 배포 로드맵 합의 중 사용자가 "SEO goal 처리가 됐는지, 빠트린 게 없는지 다시 조사해줘"라고 요청 — Explore 에이전트(88 tool-use)로 심층 재조사.

## 발견

- goal 21(`vhk seo init`)만 실사용 검증까지 됨(이 저장소 자체 `.vhk/seo/config.json`에 실제 도메인 등록 확인).
- goal 22~26(`submit`/`check`/`report`/`automate`)은 GSC·GA4·AdSense·Bing·Notion 5개 서비스 전부에 실제 HTTP/SDK 호출이 0줄(`fetch`/`axios`/`googleapis` grep 0건). RFC 0054(2026-06-20, "VHK는 자문형 — 외부 실행 0, 사람이 최종 버튼")로 공식 결정된 프로젝트 전체 철학의 산물 — 버그 아님.
- 그런데 goal 22~26 카드 자체엔 이 근거가 안 적혀 있어(RFC 0054·blockers.md·CHANGELOG·dev log 4곳을 다 뒤져야 전모 파악) Completion Check 체크박스 14개가 전부 `[ ]` 미체크인 채 `status: DONE`으로 방치돼 있었음 — goal 88/89에서 이미 겪은 완료선언·상태갱신 프로세스 갭의 3번째 재현.
- **`src/commands/seo/report.ts`에 HARD_STOP 가드 누락 발견** — #335/#336(seo init/submit, 이미 고쳐진 실제 버그)과 동일한 근본원인 패턴. HARD_STOP 활성 중에도 `.vhk/seo/report.html`을 무조건 디스크에 씀.

## 변경

- `src/commands/seo/report.ts` — `ensureNotHardStopped('seo report')` 가드 추가(TDD, RED→GREEN).
- `tests/seo-hardstop.test.ts` — 신규 회귀 테스트 1개(HARD_STOP 활성 + 유효 latest.json 상태에서 report.html 미생성 확인).
- `goals/archive/22~26-seo-*.md` — 각각 "완료 처리 정정" 섹션 추가, RFC 0054 근거를 goal 파일 자체에 명시. goal 25는 실제로 구현된 부분이 많아 체크박스도 정직하게 체크(렌더링 엔진은 8개 테스트로 검증된 진짜 완성물).
- `docs/state/blockers.md`의 SEO 관련 블로커는 **정정 불필요로 확인** — 이미 정확한 서술이었음(append-only라 안 건드림).

## 게이트

`pnpm vitest run tests/seo-*.test.ts` 54/54 pass. `check-goal-25.mjs` 8개 고유 검증 + typecheck + lint 전부 통과.

## 교훈

- **"자문형(외부 실행 0)"이라는 프로젝트 전체 철학이 goal 카드 하나하나에 자동으로 반영되진 않는다** — RFC 한 번 쓰는 걸로 끝이 아니라, 그 RFC가 재정의한 각 goal의 완료 기준을 goal 파일 자체에도 옮겨 적어야 다음 사람(AI)이 그 goal만 보고 오해 안 한다.
- **"버그가 아니라 의도된 설계"라는 사실이 "고칠 게 없다"를 의미하지 않는다** — RFC 0054의 자문형 철학 자체는 문제없지만, 그와 별개로 HARD_STOP 가드 누락이라는 진짜 버그가 같은 코드 안에 섞여 있었다. "이건 의도된 거야"라는 설명에 안심해서 코드를 더 안 파면 이런 걸 놓친다.
