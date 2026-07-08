# RFC 0058 — Codex 감사 기반 정합성·구조 정리 백로그

> 상태: Draft (실행 미착수 — 사용자 승인 후 트랙별 진행) · 작성: 2026-07-06
> 출처: Codex(GPT-5.4) vhk 강화 분석 리포트(Notion `3949740ab07280e891e1d69295d3202e`, 2026-07-05) + opus 7-에이전트 검증 워크플로 실측 교차검증(`wf_94918d67-c2e`, 2026-07-06)
> 연동: RFC 0057(Agent-Agnostic Compounding) · `docs/ARCHITECTURE.md` · `VISION.md` · `docs/spec.md` · `RULES.md` · `src/lib/preflight.ts` · `src/lib/goal-frontmatter.ts` · `src/lib/atomic-write.ts` · `src/lib/command-registry.ts` · `docs/state/next-task.md`

---

## §0. 핵심 정리

Codex가 vhk를 감사해 "지금 필요한 건 기능 추가가 아니라 정합성·단순화·구조 개선"이라고 진단했다. 그 리포트의 사실주장을 **믿기 전에** opus 에이전트 7개로 실제 레포와 적대적 교차검증한 결과: **핵심 진단 거의 다(~90%) 실측으로 사실 확정. 방향 맞음.** 다만 Codex 자신도 미세 드리프트(수치·라인번호) 몇 개 있어서, 세부 값은 아래 실측치를 SoT로 쓴다.

| # | 진단 | 실측 판정 | 근거 |
|---|------|----------|------|
| 1 | 문서 수치 드리프트(ARCHITECTURE 구식) | ✅ 확정 | MCP 24→**35**, Node 20→**22·24**, 테스트 356→**~2328** |
| 2 | VISION DoD 표기 불일치 | ✅ 확정 | 4개 다 구현됐는데 체크박스 `[ ]` 방치 |
| 3 | spec.md 자기모순 | ✅ 확정 | "두 파일 JSON 배열" 잔재 vs memory.json은 v2 객체 |
| 4 | RULES 경로 오기 | ✅ 확정 | `src/nlp-router.ts` → 실제 `src/lib/nlp-router.ts` |
| 5 | preflight 드리프트 미감지 | ✅ 확정 | next-task.md 커밋시각 나이만 검사, 내용·수치 검사 0 |
| 6 | Goal 상태 모델 빈약 | ✅ 확정 | enum 4값뿐 → CANCELED·DEFERRED·OBSERVING 부재가 goal 73/79/50 오표기 근인 |
| 7 | 명령 표면 비대·수동 다중등록 | ✅ 확정(+악화) | 112 cmd·35 MCP, 등록 **5지점**(CLAUDE.md "4지점"이 과소집계), 선언형 manifest 없음 |
| 8 | 열린 PR 잔재 | ✅ 확정 | #430(기능 #434 병합됨)·#445(README #446 반영, 단 오염브랜치) 잔재, #461 정상 |
| 9 | 쓰기 안전 부분 적용 | ✅ 확정 | atomic 정석이나 config.json·context.md·env·ledger 우회 |

**실행 원칙:** 싸고 안전한 것(정합성 수정)부터. 큰 리팩터(command manifest)·제품의견(UX 단순화)은 뒤로 + 별도 게이트. 실제 파일 편집·PR 닫기·발행은 사용자 승인 후.

---

## §1. 검증 스코어보드 (전체)

각 항목 `판정 / 리포트주장 → 실측값(file:line)` 형식.

### 클러스터 A — 문서 수치 드리프트
- **CONFIRMED** ARCHITECTURE.md가 구식 수치 기록: `docs/ARCHITECTURE.md:13`(MCP 24 tool), `:42`(Node ≥20), `:48`(테스트 356 pass), `:64`(24 tool 노출), 헤더 `:3` 마지막 갱신 2026-05-30 v1.4.0.
- **REFUTED(=실제 다름)** MCP 도구 수: 실제 **35개** — `src/mcp/server.ts` `registerTool(` ×35, 런타임 SoT `getMcpToolCount()` `server.ts:879-895`. package.json:5·CLAUDE.md:153도 35.
- **REFUTED** CI Node: 실제 **22·24** — `.github/workflows/ci.yml:20`, engines `node >=22` `package.json:63-65`. Node 20 없음.
- **PARTIAL** 테스트 수: CLAUDE.md:153 `2206`(07-03) vs dev log `docs/log/2026-07-04-session-wrapup-issue-triage.md:50` `2328`(07-04, 더 최신). 정적 it/test 호출부 2236개. → **2328이 현행에 가장 가까움**(Codex의 "2328 무근거" 전제가 오히려 틀림). 스위트 미실행이라 라이브 정확값은 미확정.
- 참고: CLI `.command(` 112개(`src/index.ts:225`~`:1088`), 그중 최상위 명령은 68개(`command-registry.ts:59-127`). src/** 약 24.4k LOC.

### 클러스터 B — 문서 드리프트 4건 (전부 CONFIRMED)
- VISION DoD: `VISION.md:13-17` 4개 다 `[ ]`인데 실제 구현 완료 — init `src/commands/init.ts`(index.ts:246), check `src/commands/check.ts`(index.ts:285), memory 4버킷 `src/commands/memory.ts:46-54`, publish 게이트 `src/lib/preflight.ts:77-124`.
- spec 자기모순: `docs/spec.md:114-115` "두 파일 모두 JSON 배열 루트" — 그러나 memory.json은 v2 객체 `{schemaVersion:2, decisions, failures, successes, patterns}`(`memory.ts:46-54,63`, 비배열 보존 `:163`). 같은 문서 2.1 섹션(`spec.md:75-94`)과도 자기모순.
- RULES 경로 오기: `RULES.md:24` `src/nlp-router.ts` — 실제 `src/lib/nlp-router.ts`(Glob 확인, `src/nlp-router.ts`는 부재). CLAUDE.md 기술스택도 동일 오기. `RULES.md:34` 맨파일명은 정상. **sync 단일소스라 .cursorrules·AGENTS.md로 전파됨.**
- preflight 무감지: `src/lib/preflight.ts:135-166` checkDocsFreshness는 (1)`next-task.md`만(`:140`), (2)내용 아닌 git 커밋시각 나이 vs 7일(`:139,151-165`), (3)severity `normal`(비차단). runPreflight 9개 점검(`:239-249`)에 문서 내용 드리프트 검증 0개.

### 클러스터 C — Goal 상태 모델 (전부 CONFIRMED)
- goal 73: `goals/73-objective-llm-eval.md:6` `status: BLOCKED` — 실제 결정 "착수 안 함"(`:9` blocked_by, `:39`, 표 `:66`). 수요 0 + 정체성 우려.
- goal 79: `goals/79-verify-local-env-split.md:6` IN_PROGRESS, `:7` P0 — 회귀 0(`:19,:34`), 잔여는 YAGNI 관찰 1건(`:28,:37`), `:43` Forbidden에 "IN_PROGRESS 유지" 의도 명시.
- goal 50: `goals/50-coverage-diff-gate.md:7` IN_PROGRESS, `:8` P1 — 측정 PR1 완료(`:30-34`), PR2 유보(`:31,:35`), `:36` measure-first 근거.
- **근인:** status enum이 정확히 4값(NOT_STARTED/IN_PROGRESS/DONE/BLOCKED)뿐 — `src/lib/goal-frontmatter.ts:6`, `scripts/check-goal-frontmatter.mjs:14,23`, `scripts/check-goal-20.mjs:56`, `src/daily/types.ts:14`, `goals/_meta.md:42`. **CANCELED·REJECTED·DEFERRED·OBSERVING 전무** → 종결/관찰/유보를 표현 못 해 BLOCKED·IN_PROGRESS로 우회.

### 클러스터 D — 명령 표면·등록
- **CONFIRMED** 112 `.command(`(raw, 서브커맨드 포함) / 68 최상위 / 35 MCP.
- **CONFIRMED(+악화)** 수동 등록 = 코드 **5지점**: ①`src/index.ts:225+`(commander) ②`src/lib/command-registry.ts:59`(+컨테이너 `:9,:31`) ③`src/lib/cli-args.ts:5`(KNOWN_COMMAND_TOKENS) ④`src/lib/nlp-router.ts:74,:90`(NLP_KEYWORDS·RULES) ⑤`src/i18n/ko.ts`. + 문서 2곳(COMMANDS.md·README). **CLAUDE.md/RULES.md의 "4지점"이 nlp-router 빠뜨려 과소집계.** 정합은 `tests/command-registry.test.ts` 드리프트 가드가 강제.
- **REFUTED** 선언형 command manifest 단일 SoT 없음 — `command-registry.ts`는 등록 생성기가 아니라 드리프트 가드용 **부분 미러**(주석이 "수동 추가 필수" 명시).

### 클러스터 E — 열린 PR 잔재
- **CONFIRMED** #430 OPEN·CONFLICTING — 기능(N2 reinforce evolve) 이미 #434(MERGED, 79f74b0)에 포함.
- **PARTIAL** #445 OPEN — README는 #446(MERGED, 053bef7) 반영 완료. 단 #445는 README-only 아님(커밋 14개, goal 88~91 init/sync·seo 섞인 오염 브랜치).
- **CONFIRMED** 둘 다 main과 CONFLICTING diverged. 열린 PR 3개: #430·#445·#461(신규 런칭 에셋, 잔재 아님).

### 클러스터 F — 쓰기 안전
- **CONFIRMED** atomic 정석: `src/lib/atomic-write.ts:17-30` temp+rename(동일 dir, pid+counter 충돌방지).
- **CONFIRMED** 비일관: raw write 우회 — `src/lib/config.ts:48`(.vhk/config.json), `src/commands/context.ts:295`(.vhk/context.md), `src/lib/state-files.ts:60`(blockers append), `src/commands/env.ts:48/52/79`.
- **CONFIRMED** MCP env 비원자: `src/mcp/server.ts:468,475,479`.
- **CONFIRMED** 원장 락 없음: `src/lib/action-ledger.ts:66-69`, `src/lib/autonomy-log.ts:57-61` — appendFileSync만, O_APPEND 원자성에 의존(POSIX PIPE_BUF 이하 보장, Windows 경합 시 이론상 인터리브, readActionLedger가 손상라인 skip으로 방어).

### 클러스터 G — Goal/스크립트 인벤토리
- **CONFIRMED** goals *.md 104개(최상위 23 + archive 81), check-goal-*.mjs 101개(+.sh 3 = 104).
- **PARTIAL** CI가 완료 goal 스크립트 안 돌림 — 맞음(CI는 `check-no-raw-json-parse.mjs`·`check-no-stray.mjs` 2개만, check-goal-* 0건, `ci.yml:55~58` NOTE가 명시). 단 "ci.yml 55행"은 실제 파일 159행이라 라인번호 오류.
- **PARTIAL** 부채 주장 — 대체로 타당(동일 하네스 100+ 복붙, 소스 심볼 결합, archive 후 스크립트 잔존, 27개는 검증 0 스캐폴드). 단 "활성 코드"는 과장(CI 제외·온디맨드만).

---

## §2. 실행 백로그 (우선순위)

impact × 저비용 × 저위험 순. **T = 트랙.**

### T1 — 진실 드리프트 수정 (반나절 · 위험 낮음 · 착수: 사용자 승인 즉시)
문서만 손댐, 코드 로직 무변경.
- [x] `docs/ARCHITECTURE.md` 수치 갱신: MCP 24→35, Node ≥20→≥22, 테스트 356→현행(또는 "사실값은 package.json·CHANGELOG 참조"로 포인터화해 재드리프트 차단).
- [x] `RULES.md:24` `src/nlp-router.ts`→`src/lib/nlp-router.ts` 수정 → `vhk sync`로 파생물 재생성. CLAUDE.md 기술스택 동일 오기도 수정.
- [x] `docs/spec.md:114-115` "두 파일 모두 JSON 배열" 잔재 → memory.json은 v2 객체로 정정(refs.json만 배열).
- [x] `VISION.md:13-17` DoD 체크박스 `[ ]`→`[x]`(4개 다 구현 완료).
- **게이트:** `pnpm build; pnpm test; pnpm lint` (docs만이라 회귀 위험 극소, 그래도 sync 산출물 변동 확인).

### T2 — 잔재 PR 정리 (5분 · 위험 낮음 · 착수: 사용자 승인 — 외부작업)
- [x] PR #430 닫기(기능 이미 #434 main 병합). **2026-07-08 실측: 이미 CLOSED.**
- [x] PR #445 처리: README는 #446 반영됨. **2026-07-08 실측: 이미 CLOSED.**
- [ ] #461은 유지(정상 신규).
- ⚠️ **PR 닫기 = 외부 상태 변경**이라 사용자 명시 승인 후에만. main 직접 push·발행은 이 RFC 범위 밖(가드 #119).

### T3 — Goal 상태 enum 확장 (0.5~1일 · 위험 낮음 · 착수: T1 후)
근본원인 수리. 4값 → 종결/관찰/유보 표현 추가.
- [ ] `src/lib/goal-frontmatter.ts:6` GoalStatus에 `CANCELED`(또는 REJECTED)·`DEFERRED`·`OBSERVING` 추가.
- [ ] `scripts/check-goal-frontmatter.mjs:14` STATUSES Set·`:23` 에러 메시지 동기화.
- [ ] `scripts/check-goal-20.mjs:56` VALID_GOAL_STATUSES·`src/daily/types.ts:14` GoalStatusLite·`goals/_meta.md:42` 열거 동기화.
- [ ] 재라벨: goal 73→CANCELED, 79→OBSERVING, 50→DEFERRED. 활성 큐에서 종결/관찰건 분리.
- [ ] TDD: 신규 상태 허용/거부 테스트 추가. critic 통과.
- **주의:** enum 소비처 전수 grep(스위치·필터 누락 시 런타임 오분류) — 등록 5지점 교훈과 동일한 다중 참조 리스크.

### T4 — write-safety 통일 (국소 · 위험 낮음 · 착수: 독립)
- [ ] `src/lib/config.ts:48`(config.json)·`src/commands/context.ts:295`(context.md)를 atomicWriteFile로 전환(손상 시 복구 어려운 영속 상태).
- [ ] env.ts·MCP server.ts:468의 .env.example·.gitignore는 영향도 낮음 → 후순위(선택).
- [ ] 원장 락(action-ledger/autonomy-log)은 **당장 안 함** — O_APPEND 설계선택이고 멀티세션 실측 손상 사례 없음. OBSERVING으로 goal화하거나 이 RFC에 관찰항목으로 남김.

### T5 — 재발방지: preflight 드리프트 감지 (중 · 위험 중 · 별도 RFC)
- [ ] `vhk sync --check` 또는 preflight에 "문서 수치 vs 실측(package.json·getMcpToolCount 등) 대조" 추가 설계. severity 결정(경고/차단).
- 설계 필요 → **별도 RFC 0059로 분리**. T1이 수동 1회 수정이면 T5는 자동 재발방지.

### T6 — check-goal 스크립트 부채 정리 (저위험 정리 · 착수: 독립)
- [ ] archive된 goal(goals/archive/*)의 check-goal-*.mjs를 `scripts/archive/`(감사 보존)로 이동, 활성 goal 게이트만 scripts/에 유지.
- [ ] 검증 0 스캐폴드(27개) 처리 방침 결정: 삭제 vs 보존.

---

## §3. Codex 자체 오차 (신뢰도 캘리브레이션)

드리프트 잡는 리포트가 자기도 미세 드리프트를 냈다. 앞으로 Codex 산출물은 **방향은 신뢰, 세부 수치는 실측 재확인** 원칙으로 소비.

| Codex 진술 | 실제 | 영향 |
|---|---|---|
| "테스트 2328 무근거" | 2328은 07-04 dev log:50에 실재(최신) | 낮음 — 드리프트 존재 자체는 맞음 |
| "ci.yml 55행" | 실제 159행(55행은 NOTE 위치) | 없음 — 내용 주장은 맞음 |
| "완료 goal 스크립트 = 활성 코드" | CI 제외·온디맨드 → 잠재부채 | 표현 과장, 부채 논거는 유효 |
| command-registry.ts를 manifest로 암시 | 생성기 아닌 부분 미러 | 설계 오인 방지 필요 |

---

## §4. 유보 — 사용자 판단/별도 결정 필요

실측된 사실이 아니라 제품의견·대형 리팩터라 이 RFC에서 착수 안 함.

- **UX 6핵심흐름 단순화**(start→work→verify→receipt→save→handoff 전면, 나머지 고급메뉴): 등록세(5지점)는 실재하나 "비개발자가 헷갈린다"는 **사용 데이터 없음**(단일 사용자=백요한). 제품 방향 결정 → 사용자 판단.
- **선언형 command manifest 단일 SoT**(5지점 → 1소스 파생): 효과 크나 **GA breaking 위험 최상**(발행된 npm `@byh3071/vhk`, package.json 시그니처 불변 정책). 맨 마지막·TDD·critic 다회·별도 RFC.
- **#455~459 신규 기능 재평가**: 구조 정상화(T1~T4) 후로 유보(Codex Phase 3 동의).

---

## §5. 착수 상태 / 다음 단계

- **현재: 미착수.** 이 문서는 검증된 작업지시서(근거 file:line 포함)일 뿐. 코드·문서 편집 0, PR 0, 발행 0.
- **권장 착수 순서:** T1(+T2 승인 시) → T3 → T4 → (T5·T6 독립) → §4는 별도 세션.
- **다음 세션 진입점:** 이 RFC §2 백로그에서 T1부터. `docs/state/next-task.md`에 포인터 추가 여부는 사용자 판단(현재 next-task 최상단은 RFC 0057 관련).
- **가드:** 실제 편집·PR 닫기 전 사용자 승인 / main 직접 push 금지(PR 경유) / 발행은 사람만(2FA) / 로컬 게이트에 `pnpm lint` 필수.
