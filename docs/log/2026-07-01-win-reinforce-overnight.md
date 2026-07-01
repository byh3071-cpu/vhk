# 2026-07-01 — vhk win(N3) + 밤샘 무인 결함루프 + N7 머지

## 세션 흐름 (append-only)

### 1. 밤샘 무인 결함루프 (overnight-autoloop 스킬)
- **의도**: vhk 대상·both·cap10 무인 결함 감사→수정→검증+적대리뷰→PR(머지0).
- **엔진 부정합**: `autoloop.workflow.js`가 yohan-mcp(python)+control-tower(next) 전용 하드코딩(`master`·npm). vhk=main·pnpm → 사본 패치(scratchpad): `master→main`, verifyCmd `ts`=`pnpm build; test:run`.
- **★버그**: Workflow `args`를 JSON 문자열/객체 어느 쪽으로 넘겨도 스크립트 `args` 글로벌에 안 실림(하네스 직렬화) → **2회 오실행**(기본 레포로 조용히 폴백). 완료 리포트 보고서야 발각(vhk 대신 yohan-mcp/control-tower에 6 PR). **해결 = 스크립트에 REPOS/SCOPE/CAP 하드코딩**. 3회차 vhk 확정(transcript `대상 레포:` grep 조기검증). 교훈 → 기억 `workflow-args-json-object`.
- **결과**: vhk 실결함 2건 → **#432**(readMission 스키마 검증 누락→손상 mission.json 크래시)·**#433**(review goals/ 빈 경우 exit1 오인). 둘 다 적대리뷰+전체 테스트 통과, 머지0. 부산물 ecosystem 6 PR(#18·19 yohan-mcp / #14~17 control-tower)=A(열어둠).
- 리포트: `docs/audits/overnight-2026-07-01.md`(오실행)·`overnight-2026-07-01-vhk.md`(정본).

### 2. 머지 (사람 게이트)
- **#431**(N7 receipt-log)·**#432**·**#433** 머지(main `189db50`). #431·432 `--auto`(green 즉시), #433 auto-merge 설정 꺼져 분류기 차단 → 사용자 `!` 직접 머지.

### 3. N3 `vhk win` 성공기록 (이 커밋)
- **왜**: 자가진화 격차 ⓒ — 성공패턴이 버려짐(pattern.ts 감지만). `vhk learn`(실패/교훈)의 **성공 쌍둥이**로 `vhk win` 신설 → memory v2 `successes`에 append → pattern reinforce 입력 → evolve reinforce 후보(N2)로 복리. ✅/❌ 대칭 완성의 입력면.
- **구현**: `memory.ts recordSuccess()`(loadForMutation 실패 시 null=빈 v2로 안 덮음, learn과 동일 계약) · `agent.ts win()` · 등록 6지점(index import+alias+command · cli-args KNOWN+FREEFORM · command-registry · ko.winTitle · COMMANDS.md). freeform이라 nlp-router 불요(learn과 동일).
- **검증**: TDD(tests/win.test.ts RED→GREEN). typecheck 무에러 · 전체 2101 tests green(commands-doc 드리프트 가드가 COMMANDS.md 누락 잡음→보강).

## 다음
- **N2** reinforce evolve 확장(`evolve.ts generateCandidates` reinforce 분기) = 척추 본체. win이 그 입력면.
- ecosystem 6 PR = 열어둠(그 레포 작업 때).

### 4. N2 reinforce evolve 확장 (별도 커밋)
- **왜**: ⓒ 척추 본체. pattern.ts는 이미 `processBucket(successes,'reinforce')`로 성공패턴 감지하나, `evolve.ts:generateCandidates` 필터가 `kind==='avoid'`만 통과 → reinforce 후보를 버림(구 v0). N2가 필터를 열어 성공패턴도 evolve 후보화 → win(N3) 입력이 룰 후보로 복리. ✅/❌ 대칭 완성.
- **구현**: `generateCandidates` 필터 `avoid|reinforce` · `buildDraft` kind 분기(reinforce=긍정형 "이 접근 계속 권장") · suggest "allSuggested" 판정도 reinforce 포함(activePatterns). dedupeKey=`patternId:rule`는 patternId 유니크라 avoid/reinforce 충돌0. RULES 반영은 apply 사람승인 유지(철칙 불변).
- **검증**: TDD — 기존 `reinforce 패턴 제외` 테스트를 계약변경(포함)으로 갱신 + buildDraft reinforce 테스트 신규 → RED 확인 후 GREEN. 전체 2102 tests green.

## 다음(갱신)
- N2·N3 = ⓒ 완결 → 적대리뷰 후 PR·머지.
- 후속 복리 척추: N5 evolve digest(ⓓ)·N6 stats --trend(ⓔ)·N1 loop tick(ⓐ)·N4 objective 토큰(ⓑ).
