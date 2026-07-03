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
- **dismiss 후 구조 자체를 하드닝**: #1·#3·#7·#9 = 4건 — 사용자가 "구조를 고쳐야 하지 않아?"로
  재지시, 아래 "후속 — 구조 하드닝" 참조.
- **유지(실측으로 이슈 여전히 유효)**: #289 = 1건, close 안 함

## 후속 — cmd.exe shim 경로 구조 하드닝 (같은 날, 사용자 재지시로 착수)

dismiss만으로는 "오늘은 안전"일 뿐 구조는 그대로라는 지적을 받아, `resolveCmd`(및 동일 패턴을
복제한 `scripts/_lib.mjs`·`generateGateScript` 템플릿) 자체를 고쳤다.

### 직접 프로브로 실증(구현 전 필수 확인)

`execFileSync('cmd.exe', ['/d','/s','/c','pnpm.cmd', ...args])`에 다양한 특수문자 조합을
넣어 실제로 인젝션이 되는지 먼저 관찰:
- 단순 `x & echo pwned` — **인젝션 안 됨**(Node 의 argv 인용이 `&`를 안전하게 감쌈).
- `" & echo PWNED3 & "`(따옴표+앰퍼샌드 조합, CVE-2024-27980 과 같은 근본원인 클래스) —
  **실제로 인젝션됨**(STDOUT 에 `PWNED3`가 진짜 찍힘, cmd.exe 가 인용 경계를 잘못 재해석).

이 프로브 덕에 처음 작성한 RED 테스트(단순 `&`)가 "거짓 RED"(pnpm 자체 에러메시지의 우연한
문자열 일치로 통과)였다는 걸 잡아내고, 진짜 취약점(따옴표 조합)으로 재작성했다.

### 수정 (3곳, 동일 패턴)

- `src/lib/exec.ts` — `resolveCmd`가 `{ok:true,bin,argv} | {ok:false,err}` 판별 유니언 반환.
  Windows shim 경로에서 `CMD_SHELL_METACHARS = /[&|<>^%"\r\n]/` 매칭 인자가 있으면 거부.
  "제대로 이스케이프"보다 "위험 문자 있으면 거부"(fail-closed) — cmd.exe 이스케이프는
  반복적으로 CVE 를 낳아온 함정이라 정교한 이스케이프 시도보다 안전.
- `scripts/_lib.mjs` `safeExec` — 동일 패턴.
- `src/commands/goal.ts` `generateGateScript`(check-goal-N.mjs 템플릿) — `vhk goal sync`가
  생성하는 ~90개 게이트 스크립트가 전부 이 함수에서 나오는 걸 발견, 템플릿(단일 지점)에
  같은 가드 추가. **기존에 이미 생성된 90개 파일은 재생성 안 함(범위 밖, 재생성하려면
  `vhk goal sync` 재실행 필요 — 별도 판단).**

### 타입 설계 시행착오

처음엔 `{bin,argv,rejected?:undefined} | {rejected:string}` 유니언 + truthiness 체크
(`if (resolved.rejected)`)로 짰다가 tsc 가 좁히기 실패 — `string`은 빈 문자열이 falsy라
"rejected 가 falsy" ≠ "rejected 가 undefined 타입"이라 완전한 discriminant가 아니었음.
`'rejected' in resolved`로 바꿔도 여전히 실패(옵셔널 프로퍼티라 in 판정도 불완전). 최종적으로
이 코드베이스 기존 관례(`ExecResult`)와 동일한 `ok: boolean` discriminant로 통일해 해결.

### 게이트

RED(진짜 인젝션 재현)→GREEN 전환 확인(exec.ts·`_lib.mjs`·goal.ts 각각), 회귀 없음(CVE-2024-27980
회귀 테스트 포함 exec.test.ts 16/16). `tsc --noEmit`·`pnpm build`·`pnpm lint`·`pnpm test:run`
2213/2213·`check-meta.mjs` 전부 green.

### 교훈

- **거짓 RED는 진짜 위험하다.** 첫 테스트(`x & echo pwned`)가 "통과"했을 때 그대로 믿었다면
  존재하지도 않는 걸 "막았다"고 착각한 채 진짜 취약점(따옴표 조합)은 미수정으로 남았을 것.
  RED 단계에서 "왜 실패했는가"를 반드시 직접 눈으로 확인해야 하는 이유가 실제로 재현됨.
- **"오탐이라 dismiss"와 "구조가 안전하다"는 다른 주장이다.** 오늘 호출부가 안전한 것과
  범용 함수 자체가 안전한 것은 별개 — 사용자가 이 구분을 정확히 짚어 재지시한 덕에 실제
  잠재취약점(따옴표 인젝션)을 찾아 고쳤다.

## 후속2 — 이슈 #289 재시도 (같은 날, 사용자 재지시)

"닫을 수 있게 다시 시도해보고"라는 재지시를 받아, close 대신 실제 개선을 만들었다.
`src/commands/context.ts`에 `hasWorkState` 플래그로 저장된 기억(memory v2)·Active Goal·
Active Blockers 3개 섹션이 전부 비었는지 추적 → 전부 비면 `## 최근 활동 (git log)` 폴백
섹션(최근 5커밋, `git log -5 --pretty=format:%h %s`)을 대신 보여준다. `gitOut`이 git
미설치·커밋 0건이면 throw하는 계약이라 try/catch로 조용히 생략(크래시 없음 유지).

`tests/context.test.ts`의 gh#289 재현 테스트를 "고쳐졌다"를 검증하는 방향으로 갱신
(재현 확인용 부정 단언은 유지, 폴백 섹션 존재 + 커밋 SHA 패턴 포함 긍정 단언 추가).
게이트 전부 green(2213/2213). close는 이 커밋이 main 에 반영된 뒤 별도로 실행.

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
