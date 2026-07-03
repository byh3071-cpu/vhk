# 2026-07-04 — GitHub 코드스캐닝 알럿·이슈 정리

> append-only. 추가만, 수정·삭제 금지.

## 한 일

사용자가 GitHub 코드스캐닝(Security)·Issues 탭 화면을 페이스트하며 "확인해줘" 요청 →
`gh api`로 정본 데이터 확보(CodeQL open alert 7건, 페이스트의 "11"은 UI 표기 오차로 판명) →
알럿 7건은 직접 코드+CodeQL 상세 메시지 대조, 이슈 11건은 백그라운드 에이전트가
goals/next-task.md/CHANGELOG/소스코드와 교차검증 → 결과 보고 후 사용자 승인 → 실행.

## 배경

세션 초반 로드맵 합의(③ "이것들을 어떻게 처리할지 하나씩 정하자")의 연장 — 방치돼 있던
보안 알럿·이슈 잔여물 정리.

## 조사 결과

### CodeQL 알럿 7건 (`gh api repos/byh3071-cpu/vhk/code-scanning/alerts`)

| # | 심각도 | 위치 | 판정 | 근거 |
|---|---|---|---|---|
| 4 | High | `cloud.ts:29` | 오탐 확정 | `ko.cloud.noAuth`는 고정 i18n 문자열('gh 인증이 필요합니다'), 실제 비밀값 0 — CodeQL이 속성명 "auth"만 보고 이름기반 오탐 |
| 5 | High | `ref.test.ts:118` | 오탐 확정 | `Array.includes()` 테스트 어서션(argv 배열 원소 검사)을 URL substring 검증으로 오인 — 실제로는 셸 인젝션 차단을 검증하는 테스트 |
| 6 | High | `publish.ts:34` | 실결함(낮은 위험) | regex escape가 `.`만 처리 — 아래 "수정" 참조 |
| 1,3,7,9 | Medium | `exec.ts`×3·`_lib.mjs` | 현재는 오탐 | taint 소스(cwd·파일명)가 도달하는 4개 실제 호출체인(gh·node·spawn cwd옵션) 전부 `SHIM_BINARIES` 밖이라 `cmd.exe` 셸 래핑 경로 미도달. execFileSync/execFile은 shell:true 없이는 셸 파싱 자체를 안 함 |

### GitHub 이슈 11건 (`gh issue list`)

| # | 판정 | 근거 |
|---|---|---|
| 271 | 해결됨 | `review.ts:321` 주석이 "gh#271" 직접 인용, exit1→exit0 수정 확인 |
| 364 | 해결됨(Epic 9건 전부) | CHANGELOG·코드주석으로 #335·#336·#338·#334·#333·#339·#340·#341·#313·#315 전부 확인 |
| 276 | 추적중 | goal 73 BLOCKED (RFC 0056 §2 결정 대기) |
| 279 | 부분해결 | goal 75/76/77(launch/ops/sell) DONE이지만 이슈의 "goal74" 지칭 자체가 실제 번호체계와 어긋남. 핵심 게이트(HARD_STOP승인큐 등) 미구현 |
| 289 | 애매 | 언급된 기능(context.ts Active Goal/Blockers)이 이슈 제보(2026-06-16)보다 먼저(v1.3.0, 2026-05-28) 존재 |
| 292 | 부분(3/5) | G1·G2·G4 완료, G3·G5 미착수 |
| 373·374·375·376 | 미착수(376만 영속 부분완료) | 어떤 goal에도 안 흡수됨 |
| 426 | 완전 미착수 | 관련 코드·PR 0건 |

## 실행 (사용자 승인 후, Plan Mode 경유)

1. **알럿 #6 수정** — `insertChangelogStub`의 `escaped`를 `.`만 이스케이프하던 것에서
   정규식 메타문자 전체(`.*+?^${}()|[]\`) 이스케이프로 교체. RED 테스트로 재현(`|`가
   기존 버전 항목과 alternation 오매칭돼 신버전 삽입을 건너뛰는 버그) 후 TDD 수정.
2. **알럿 6건 dismiss** — #4·#5·#1·#3·#7·#9, `false_positive` 사유 + 근거 코멘트와 함께
   `gh api ... -X PATCH -f state=dismissed`.
3. **이슈 2건 close** — #271·#364, 근거 코멘트와 함께 `gh issue close`.
4. **이슈 #289** — `tests/context.test.ts`에 재현 테스트 추가(goals/blockers/memory 전부
   빈 상태로 `context()` 호출). **결과: close 보류, 이슈 유지.** 크래시는 없지만(정적
   섹션은 항상 렌더), "## Active Goal"·"## Active Blockers"·"## 저장된 기억" 3개 섹션이
   전부 조건부 생략을 실측 확인 — 신규/희소 프로젝트(goals·blockers·memory 미사용)에서는
   context.md가 정적 프로젝트 구조 정보만 담고 "작업상태·핵심결정"은 여전히 0건. 이슈
   원제보(cafe-pos-vhk 추정 시나리오)가 이 조건에서는 아직 유효 — 계획 문서의 "테스트
   실패 시 close 대신 수정 전환" 원칙에 따라 close하지 않고 실측 결과를 이슈 코멘트로
   남김(수정은 범위 밖 — 별도 판단 필요).

## 결론 요약 (해결됨 vs 오탐 vs 유지 구분)

- **실제 해결**: #6(코드수정)·#271·#364(이미 해결된 것 뒤늦은 close) = 3건
- **애초에 문제 아님(오탐 확정)**: #4·#5 = 2건
- **오늘 기준 안전, 구조적 잠재리스크는 미해소**: #1·#3·#7·#9 = 4건(dismiss했지만 `safeExecFile`의
  Windows shim cmd.exe 래핑 자체를 하드닝하는 별도 작업은 이번 범위 밖)
- **유지(실측으로 이슈 여전히 유효)**: #289 = 1건, close 안 함

## 교훈

- **CodeQL의 "환경값" 정의는 `process.env`보다 넓다** — `process.cwd()`·파일명 등 OS 상태에서
  파생된 모든 값을 "uncontrolled"로 취급한다. `execFile`/`execFileSync`가 shell:true 없이는
  셸을 안 띄운다는 사실은 CodeQL이 알아도, 코드베이스 특유의 조건부 셸 래핑(`resolveCmd`의
  Windows `cmd.exe` 분기)까지는 인터프로시저 분석이 정확히 못 따라가는 경우가 있다 — 알럿
  message의 정확한 taint 소스·경로를 확인하지 않고 심각도(High/Medium) 라벨만 보고 판단하면
  오탐을 실결함으로 오인하거나 반대로 놓칠 수 있다.
- **이름 기반 휴리스틱 오탐(clear-text-logging)** — 속성/변수 이름에 "auth"·"token"·"secret"
  등이 들어가면 실제 값과 무관하게 정적 분석 도구가 민감정보로 추정하는 경우가 흔하다.
  코드 자체(`ko.ts`의 실제 문자열 내용)를 확인 안 하면 판단 불가.
- **오래된 이슈는 코드보다 뒤처지기 쉽다** — #271·#364는 코드가 이미 몇 주 전에 해결했는데
  이슈 close가 누락된 채였다. 커밋 메시지·코드 주석이 이슈 번호를 직접 인용해두면(`gh#271`
  처럼) 나중에 이런 정리가 근거를 빠르게 찾을 수 있다.
