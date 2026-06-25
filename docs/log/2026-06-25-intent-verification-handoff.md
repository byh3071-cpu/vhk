# 2026-06-25 — 의도 검증 강화 세션 핸드오프 (B·C 진입점)

> append-only dev log. **다음 세션 진입점.** 이번 세션은 "AI 가 시킨 대로 했는지" 검증(의도 장갑의
> 검증 면)을 두 머지로 전진시켰고, 후속 B(Phase 2 보강)·C(방향 2·3·4 설계)를 이어갈 수 있게 정리한다.

## 이번 세션 성과 (PR 2개 머지 · main)

- **#394 — Goal 87 PR1: receipt 의도 대조(intent)** (`5c0cb1b`) — receipt 5번째 증거 `intent`. `.vhk/mission.json`(scope/forbidden) ↔ 변경 파일 대조 → forbidden 위반=block(red/dirty/stale 동급), scope 밖=caution. mission 없으면 영향 0(하위호환). baseSha 기준으로 **커밋된 위반까지** 포착(CodeRabbit 반영). goal 87 = IN_PROGRESS(PR2/3 잔여). 진입점 [2026-06-25-goal-87-receipt-intent](2026-06-25-goal-87-receipt-intent.md).
- **#395 — 영구 코딩 규칙 ESLint 코드화 (의도 검증 방향 1)** (`423ff7b`) — RULES.md 코딩 규칙 3종(execSync 신규 금지·빈 catch 금지·명시 any 금지)을 `eslint.config.js` 규칙으로. verify lint 게이트(#381) → receipt block 자동 합류. 위반 0(probe·tsx·CI 검증). 진입점 [2026-06-25-eslint-permanent-rules](2026-06-25-eslint-permanent-rules.md).

★프레임: "AI 에게 시킨 것" = **작업별 계약(mission.json, #394)** + **프로젝트 영구 규칙(RULES.md, #395)** 두 층. 둘 다 자동 검증 루프(receipt)에 합류 완료. objective(목표 의미)는 결정론 불가 → 방향 4.

## B — Phase 2 (보강 · 병렬 가능 · 다음 세션 바로 착수 가능)

영구 규칙(방향 1) 후속 견고화. 서로 다른 파일이라 병렬(worktree 격리 권장 [[vhk-concurrent-session-git]]). 로컬 plan 상세: `~/.claude/plans/eager-spinning-clarke.md`(레포 밖).
- **T2a — receipt 합류 E2E**: `tests/receipt.test.ts` 에 "ESLint 규칙 위반(예: execSync) → lint fail → receipt `block`" 1건 추가. #381 `makeRepo(lintScript)` 패턴 재사용. 영구 규칙이 거짓완료로 잡힘을 명시 입증.
- **T2b — RULES.md ↔ ESLint 일치 봉인**: `tests/rules-eslint-sync.test.ts` 신설 — RULES.md 코딩규칙 중 "ESLint 집행" 항목과 `eslint.config.js` 규칙 1:1 확인(문서에서 규칙 지워도 ESLint 만 남는 드리프트 차단). `src/lib/rules-parser.ts`(audit 소비) 확장 검토. ※ #395 가 이미 "config 에 3규칙 존재 + config 실제 값으로 동작" 봉인 → T2b 는 RULES.md *문서* 와의 일치가 핵심.

## C — 방향 2·3·4 (탐색 완료 · 설계 미착수 · 사용자 이해 후 선택)

3-에이전트 탐색 결과(이번 세션). 각 방향 진입점·근거를 코드 위치와 함께 남긴다.

### 방향 2 — 의도 표현 정직화 (glob 한계)
`globToRegExp`(src/commands/mission.ts:41-63)가 단순 glob 만 지원 → 적어도 조용히 무력화되는 "거짓 안전/거짓 경고":
- **부정 `!` 미지원** → `!src/public/**` 같은 예외/금지가 리터럴로 escape, 작동 안 함(거짓 안전 — 위험).
- **중괄호 `{src,lib}/**` · 문자클래스 `[tj]s` 미지원** → escape 되어 매칭 실패(거짓 경고).
- **따옴표 경로(공백·한글) 미매칭** → Windows core.quotepath=true 에서 한글 경로 매칭 실패(한국어 프로젝트 실위험).
- **후행 `/`(디렉터리 한정) 미지원**.
- 강화안: ① 미지원 문법 감지 시 경고(거짓 안전 제거) + `MISSION_DISCLAIMER` 강화 ② 또는 검증된 매처(picomatch 등) 도입 검토(의존성 trade-off). 동작 변경이라 회귀 테스트 필수.

### 방향 3 — 위조·미설정 차단 (신뢰성)
의도 검증이 실효하려면 (a) mission 이 실제로 설정되고 (b) AI 가 우회 못 해야:
- **생성 강제 0**: `vhk init` 이 mission.json 미생성, `vhk work` 가 mission 유무 확인 0 → 미설정이면 intent 검증이 그냥 0(하위호환 악용).
- **위조 경로**: AI 가 `scope:["**"]`/`forbidden:[]` 로 무력화 · mission.json 삭제 · `vhk receipt --mark-start` 로 baseSha 재박기 → stale 회피. mission.json·baseSha 무결성 검사 0.
- 강화안: ① `vhk init` mission 스캐폴드 ② `vhk work` 시작 시 mission 미설정 경고 ③ receipt.json 에 mission checksum 스냅샷 기록(사후 위조 탐지) ④ baseSha 무결성. RFC 0056 T2(위조방어)와 연결 — verify 는 이미 manual:true 거부(실종료코드만), mission/baseSha 는 T2 미적용.

### 방향 4 — objective 의미 검사 (LLM)
"시킨 목표를 *의미상* 달성했나"는 경로 검사로 원천 불가 → LLM judge. **Goal 73(`vhk check --evals`, #276)** 트랙. 가장 크고 별도. 87 카드가 "objective 는 범위 밖, Goal 73 후속"으로 이미 명시.

## 종료 상태 (검증)

- HARD_STOP 없음 · 열린 PR 0 · main `423ff7b` · 게이트 CI green(매트릭스·dogfood·CodeQL·CodeRabbit).
- 버전 local=npm 2.7.0 — **main 에 2.7.0 이후 신기능 누적(#394·#395 포함) → v2.8.0 발행 대기 계속**(사용자 직접 2FA).
- ⚠️ `VISION.md` 미커밋 변경(빈 줄 포맷팅, 출처 불명) 세션 내내 미수정 — 다음 세션에서 출처 확인 후 처리/폐기 결정.
- 로컬 vitest forks 환경 crash 지속([[vhk-local-vitest-forks]]) — CI 가 테스트 진실원. tsx 직접 검증으로 로컬 보완.
