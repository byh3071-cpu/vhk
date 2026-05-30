---
date: 2026-05-31
project: VHK
version: 1.6.1 → 1.6.2 (Safety 배치)
type: 세션로그
---

# 2026-05-31 — Safety 배치(#50~#59): 데이터 손실 지혈 + Safety Mode + 위험작업 단일 chokepoint 가드

> ⏪ 백필 항목 (2026-05-31 작성). v1.6.2 출시 전 진행된 안전성 로드맵 배치를 git 커밋·PR 근거로 복원.
> (v1.6.2 도그푸딩 세션로그와 별개 — 같은 1.6.2 에 실렸으나 무기록이던 분량.)

## 요약

v1.6.1 출시 후 v1.6.2 사이 안전성 로드맵 배치(0~6, PR #50~#59). 파일 덮어쓰기/git 되돌리기 같은
파괴적 경로를 백업·복원 인프라로 손실 불가능하게 만들고(배치0), RULES.md adopt·토큰절감 컨텍스트·
채팅 UX 안전화(배치1-3)를 거쳐, **Safety Mode(lite/standard/strict)** 와 위험작업 9종을
`runGuarded` **단일 chokepoint** 로 묶는 가드 레이어를 도입(배치4). 각 배치마다 적대적 자기검증으로
거짓완료·바이패스·드리프트를 잡아 완전성 매핑 체크·no-stray 게이트로 회귀를 봉인.

## 무엇을 했나

- **#50 (배치0, 지혈)** — 백업/복원 인프라 신설(`src/lib/backup.ts` saveBackup/listBackups/restoreBackup/pruneBackups, `.vhk/backups/<stamp>/` 구조보존, Windows 콜론 금지 fsSafeStamp, 최근10개 prune) + `vhk restore`. sync 덮어쓰기 전 drift·첫sync 시 무조건 백업(손실0), 비대화형(CI/MCP)은 멈추지 않고 자동 백업 후 진행. MCP undo 기본 dry-run화(confirm:true 일 때만 git reset).
- **#50 (적대검증 4커밋)** — R1~R3 에서 안전망 무력화 버그 재현·수정: restore 가 NLP 라우터에 가로채여 실행불가(KNOWN_COMMAND_TOKENS 누락→복구경로 사망), CLAUDE.md 비멱등→백업 ring buffer churn 으로 Day-1 백업 evict, 동일-ms 디렉터리 충돌, listBackups 정렬 문자열→(baseId,숫자suffix) 키.
- **#52 (배치1-3)** — init 이 RULES.md(SoT) 항상 생성 + `rules-import.ts` adopt(.cursorrules/CLAUDE.md/AGENTS.md/.windsurfrules/copilot→표준섹션 병합). `vhk context --compact`(토큰절감), AGENTS.md 6번째 sync 타겟, MCP CLI fallback(cli-path.ts). NL 라우터가 'goal check' 실서브커맨드를 가로채던 R1 + '도움말'→start 마법사 라우팅으로 빈 디렉터리 scaffold 유발하던 HIGH 결함 교정(읽기전용 quick actions).
- **#55 (배치4 goal6)** — **Safety Mode**(lite/standard/strict, 기본 standard): safety-mode.ts + .vhk/config.json(config.ts) + risk-policy.ts(high-risk + resolveGuard: CLI=confirm / MCP·자연어=preview / lite=warn) + `vhk mode`·`verify`. R1 단일소스화: COMMAND_SUBCOMMANDS 복제를 command-registry.ts 에서 파생 + introspect 드리프트 가드.
- **#55 (적대리뷰 HIGH/R2)** — 위험작업 가드 실제 배선: resolveGuard 가 preview 후 그대로 dispatch 하던 **비차단 거짓완료**를 `src/lib/safety-guard.ts` `runGuarded`(단일 chokepoint)로 수정. R2 에서 undo/resume/save/sync·자연어 env 바이패스 발견 → 가드대상 **9종 전부 단일 chokepoint 통과**, NL_GUARDED_ACTIONS 를 risk-policy 로 단일소스화.
- **#57 (R2 후속)** — ⑦완전성 매핑(가드대상 action 전부 HANDLER 매핑 검증 → 추가 시 누락이면 FAIL, safety-coverage.test.ts) + ⑧`scripts/check-no-stray.mjs`(리뷰 에이전트 stray 무관 파일 0 머지 게이트) + ⑨undo/resume 를 guardCliDefer 로(모드정책 경유하되 실제 확인은 명령 자체검사에 위임 — 이중 프롬프트 제거).
- **#58 (§6 청산)** — ③sync 미매칭 섹션 silent drop→findUnmappedSections() stderr 경고 + ⑥rules-import 인트로 손실→서문 보존 + ④init adopt 대화형 e2e + ⑤MCP fallback composeInvocation() 순수함수 추출. 회귀테스트는 '조용히 누락하면 FAIL'.
- **#59 (§6 마무리)** — ③미매칭 경고를 sync() 래퍼→누락 발생지점 syncCore 로 이전(SyncResult.unmapped, MCP 직접 호출자도 노출) + ⑥adopt 서문이 findUnmappedSections 에 잡혀 경고 폭증→PREAMBLE_TITLE 단일소스 제외(정상 sync 노이즈 0).
- **#49·#51·#53·#54·#56** — docs(backlog) 플랜/기록 PR(코드 변경 없음, 배치 플랜·적대검증 잔여 MED·번호 오기 추적).

## 교훈

1. **적대적 자기검증이 거짓완료를 잡는 핵심 장치.** '테스트가 잘못된 동작을 고정(거짓완료)'·'preview 후 그대로 dispatch(비차단)'처럼 있는 척만 하는 결함은 정책 코드 읽기로는 안 보이고 행동검증 e2e 로만 드러난다.
2. **위험작업 가드는 분산 if 문이 아니라 단일 chokepoint(runGuarded)로.** 분산 배선은 undo/resume/save/sync 일부가 가드 미경유로 새는 바이패스를 만든다.
3. **드리프트는 코드가 아니라 게이트로 막아라.** 하드코딩 복제(COMMAND_SUBCOMMANDS, NL_RISK_ACTION)는 단일소스(command-registry/risk-policy)에서 파생 + 완전성 매핑 테스트·introspect 테스트로 '추가 시 누락하면 FAIL' 자동화.
4. **게이트는 grep 이 아니라 행동·구조 검증.** 주석 grep 게이트는 실제 동작을 보장 못 함 → isRealSubcommandPath 정의+호출+구조 검증, deploy spawn 차단 e2e 같은 행동검증으로 교체.
5. **경고는 누락 발생 지점(syncCore)에서 발화.** 래퍼(sync())에서만 경고하면 MCP 등 직접 호출자가 silent drop 을 그대로 겪는다. 단일소스 상수(PREAMBLE_TITLE) 분리로 정상 경로 노이즈 0.
6. **멱등성/정규식 흡수 함정.** 자동생성 배너를 정규식 lookahead 로 잡는 1차 수정은 사용자 인용줄을 잘라먹는 회귀를 낳음. 안전 패턴은 'strip 후 단일 재삽입(dedup)', 정렬 키는 문자열 아닌 숫자 비교(lexical 붕괴 base-10<base-2 방지).
7. **Windows 백업 인프라는 파일명 콜론 금지 필수**(fsSafeStamp `:`·`.`→`-`). prune 보존정책으로 무한 증식 차단하되 churn 으로 진짜 사용자 백업이 evict 되지 않게 비멱등 churn 사전 차단.

## 결과

PR #50·#52·#55·#57·#58·#59 전부 MERGED. 테스트 **402→507 pass** (배치0 415, 배치1-3 458, 배치4 496,
R2후속 497, §6청산 504, 마무리 507). 게이트 tsc/build/scan/audit/check-meta/check-goal-0..6/no-stray
전 배치 통과. 신규 의존성 0, 기존 시그니처 불변(하위호환). Safety 범위 ec79642 까지(이후 10a0618~ 도그푸딩).

## 관련 파일

`src/lib/backup.ts` · `src/lib/safety-guard.ts` · `src/lib/safety-mode.ts` · `src/lib/risk-policy.ts` · `src/lib/config.ts` · `src/lib/command-registry.ts` · `src/lib/rules-import.ts` · `src/commands/restore.ts` · `src/commands/mode.ts` · `src/commands/verify.ts` · `src/mcp/cli-path.ts` · `tests/safety-coverage.test.ts` · `scripts/check-no-stray.mjs`
