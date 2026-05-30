# 현재 스프린트 로드맵 & 세션 조율

> 작성: 2026-05-30 · 컨텍스트: v1.4.0 출시 직후, 포지셔닝/포터빌리티 강화 단계.
> 이 문서 목적: **여러 세션이 동시에 작업할 때 충돌 없이 참조**하는 단일 보드.
> SoT 보조 문서 — 작업 끝나면 갱신. `vhk goal next` 가 덮어쓰는 `next-task.md` 와 별개.

---

## 1. 로드맵 (실행 순서)

원칙: **한 번에 다 시키지 않는다 (AI 독주 방지).** 순차 진행, 각 STEP = Audit → Plan → Execute + 개별 PR.

| STEP | 작업 | 종류 | 상태 | 담당 | 비고 |
|------|------|------|------|------|------|
| 2 | npm publish (v1.4.0) | 배포 | ✅ 완료 | — | 이미 published |
| 1 | README 포지셔닝 (포터빌리티 전면화) | 문서 | 🟡 진행 중 | 세션 A | 히어로/포터빌리티 섹션 적용됨, 커밋 대기 |
| 1.5 | sync 확대 (Antigravity·Copilot) | 코드 | ⬜ 대기 | 세션 A | **0단계서 실제 포맷 확인 필수, 근거 없으면 제외** |
| 3 | GitHub Actions CI | 설정 | ⬜ 대기 | 세션 A | 출시했으니 초록불 신뢰 기본값 |
| 4 | 드리프트 감지 (L2) | 코드 | ⏸ 보류 | — | 출시 반응 후 확정 |
| — | .vhk RFC 공개 | 문서 | ⬜ 대기 | — | docs/spec.md 기반 초안 |
| — | Pain 블로그 | 콘텐츠 | ⬜ 대기 | — | 초안만, 게시는 사람 |
| — | Product Hunt / 커뮤니티 | 마케팅 | ⬜ 대기 | 사람 | AI 작업 아님 (문구는 지원 가능) |

**현재 활성 순서:** README(1) → sync 확대(1.5) → CI(3). 이후 4·RFC·블로그 별도.

---

## 2. 세션별 파일 경계 (동시 작업 시 충돌 방지)

같은 repo·같은 `main`·같은 working tree 를 공유하므로 **파일이 겹치면 충돌**. 각 세션은 자기 영역만.

### 세션 A — 로드맵 트랙 (README → sync → CI)
잠그는 파일:
- `README.md`, `CLAUDE.md`, `COMMANDS.md`  (문서)
- `src/commands/sync.ts`, `tests/sync.test.ts`  (sync 코드)
- `src/i18n/ko.ts`  ⚠️ **핫스팟** (sync 메시지)
- `src/index.ts`, `src/nlp-router.ts`  ⚠️ 중앙 등록 파일

### 다른 세션 — 위 파일 손대지 말 것
위 목록 외 파일만. 특히 `ko.ts`·`index.ts`·`README`·`COMMANDS.md` 는 **세션 A 전용.**

---

## 3. 병렬 작업 규칙 (지켜야 충돌 0)

1. **`git add` 는 자기 파일만 명시.** `git add -A` / `git commit -am` **금지** (남의 미커밋 파일까지 쓸어담음 = 커밋 오염).
2. 커밋 메시지·PR 은 트랙별로 분리.
3. 공유 파일(`ko.ts` 등)을 꼭 둘 다 만져야 하면 → **git worktree 로 working tree 자체를 분리** (구조적으로 충돌 불가능).
4. `npm run build` 동시 실행 시 `dist/` 경쟁 — 한 번에 한 세션만.

---

## 4. Deferred — goal 엣지케이스 보강 (로드맵에 없던 곁가지)

> 대화 중 `vhk goal` 코드 감사로 발견한 견고성 버그 3개. **로드맵보다 우선순위 낮음** — 기록만, sync/CI 끝난 뒤 정리 패스로 처리.

| # | 구멍 | 현재 동작 | 보강 방향 | 파일 |
|---|------|-----------|-----------|------|
| ① | goal id 중복 | 같은 id 파일 2개면 조용히 첫 매치만 사용, 경고 없음 | 중복 감지 시 경고 출력 | `src/lib/goal-frontmatter.ts` (감지) + `ko.ts` (메시지) |
| ② | 없는 `--id` 동작 불일치 | `check` = "스크립트 없음", `done` = "파일 없음" (같은 실수에 딴 메시지) | 둘 다 "goal id N 없음" 으로 먼저 검사·통일 | `src/commands/goal.ts` |
| ③ | title 의 콜론 | `title: a: b` 면 첫 콜론에서 잘림 | 첫 콜론만 키 분리, 나머지 값 보존 | `src/lib/goal-frontmatter.ts` |

작업 시 규칙: 각 케이스 **실패 테스트부터(TDD)** → 구현. `npm run build && npm test` 통과. **새 의존성 금지**(정규식 파싱 유지), **frontmatter 키 이름 변경 금지**(vspec/vooster 호환).

**충돌 노트:** ① 의 경고 메시지는 `ko.ts` 를 건드림 → 세션 A 의 sync 작업과 겹침. 따라서 이 작업은 (a) sync 완료 후 순차로, 또는 (b) worktree 분리 후에만 안전. `goal-frontmatter.ts` 파서 부분(① 감지 + ③)은 공유 파일 안 건드려서 단독 진행 가능.

---

## 5. 우선순위 판단 근거 (요약)

- **스테이지:** v1.4.0 출시 직후 = 포지셔닝 싸움(rulesync 상대). 보이는 것(포터빌리티 셀링·CI 초록불)이 출시 바늘을 움직임.
- **goal 보강:** 견고성은 좋으나 사용자 눈에 안 보이고, 3개 모두 크래시·데이터손실 없는 구석 papercut. 당장 안 부딪힘.
- **결론:** 로드맵(sync/CI) 먼저. goal 보강은 적어두고 정리 패스로.

---

## 6. Deferred — 적대 자기검증(PR #52) 잔여 MED

> PR #52(배치1-3, goals 3·4·5) 머지 전 적대 자기검증으로 확인된 MED 6건. **머지 안 막음**(실손실 없음·단위테스트가 실보호). HIGH 1건(도움말→start scaffold)은 PR #52 에서 수정·머지 완료.

### 배치4 대상 (R1 관련 2건 — 먼저)

| # | 구멍 | 현재 동작 | 보강 방향 | 파일 |
|---|------|-----------|-----------|------|
| ① | `COMMAND_SUBCOMMANDS` 핸드싱크 | commander 서브커맨드 정의의 하드코딩 복제본 → 새 서브커맨드 추가 시 누락하면 R1(자연어 라우터가 명령 가로채기) 재발 | 단일 소스화(추출) 또는 드리프트 감지 스냅샷 가드 테스트 | `src/lib/cli-args.ts` (+ 테스트) |
| ② | `check-goal-5.mjs` R1 게이트가 주석 grep | 가드 코드 삭제돼도 주석에 "가로채" 남으면 통과(거짓 게이트). 실제 보호는 단위테스트(cli-args)가 함 | grep → `isRealSubcommandPath` 정의+호출 코드구조 검증으로 교체 | `scripts/check-goal-5.mjs` |

### 후속 (③④⑤⑥) — ✅ PR #58 + 마무리 PR 로 완료

| # | 구멍 | 보강 방향 | 상태 |
|---|------|-----------|------|
| ③ | sync 가 미매칭 섹션(`## 프로젝트 정체성`)을 조용히 누락 | `findUnmappedSections()` → **syncCore.result.unmapped** 노출 + sync()/MCP 경고(누락 발생 지점) | ✅ 회귀테스트(syncCore 경로): 조용히 사라지면 FAIL |
| ④ | init adopt 대화형 경로 e2e 무테스트 | `tests/init-adopt.test.ts` inquirer mock e2e(감지→adopt→RULES.md 채택, 채택본 판별) | ✅ |
| ⑤ | MCP `runVhkCli` fallback 실행 경로 무테스트 | `composeInvocation()` 순수 추출 + server 사용 + 단위테스트(인자 합성) | ✅ |
| ⑥ | rules-import 첫 `##` 이전 인트로 손실·빈 섹션 오염 | 인트로 → `PREAMBLE_TITLE`('서문') 보존, 빈 섹션 생성 금지, 서문은 sync 미매칭 경고 제외(노이즈 0) | ✅ |

> ✅ **배치4 대상(R1 2건)은 PR #55(goal 6)에서 완료** — `command-registry.ts` 단일소스 + program-introspect 드리프트 가드, check-goal-5 코드구조 검증.

### 배치4 적대리뷰(PR #55) 후속 — R2 MED (이번 범위 X, 기록만)

> goal 6 안전가드 R2 적대검증 수렴 후 남긴 MED. **머지 안 막음**(설계상 의도/known, '보장 아님' 표기). 모두 후속 배치 후보.

| # | 구멍 | 보강 방향 | 파일 |
|---|------|-----------|------|
| ⑦ | `HANDLER_ACTION` 테스트-로컬 매핑 — 완전성 가드가 *이 목록에도* 빠진 신규 핸들러는 못 잡음 | risk-policy 소스에서 파생하거나 "모든 risk-policy 액션에 핸들러 매핑 존재" 체크 추가 | `tests/safety-coverage.test.ts` |
| ⑧ | 머지 게이트에 "untracked 무관 파일 0개" 미검증 — 리뷰 에이전트 stray 파일(theme-toggle 등) 재발 가능 | 게이트/CI 에 untracked 무관 파일 0개 체크 추가 | `scripts/check-*.mjs` 또는 CI |
| ⑨ | undo/resume 가 `guardCli`(runGuarded) 경유하나 내부 자체 confirm(`--confirm`/대화형)과 중복 — 이중 가드 | undo/resume 의 가드 로직을 runGuarded 로 통합(일관성) | `src/commands/undo.ts`·`agent.ts` |

작업 규칙(§4 와 동일): 각 케이스 **실패 테스트부터(TDD)** → 구현. `pnpm build && pnpm test:run` 통과. 새 의존성 금지.
