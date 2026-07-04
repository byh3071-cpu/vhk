---
vhk_format: 1
type: goal
id: 92
title: core-rules 자동화 — ~/.vhk/config.json 파일기반 브레인 경로 설정 — P2
status: DONE
priority: P2
created: 2026-07-03
completed: 2026-07-03
leads_to: goal 91(폴백 가시화)이 남긴 "그래서 어떻게 고치나" 질문에 재시작 불필요한 실제 해결책 제공
---

# Goal 92: core-rules 자동화 (파일기반 설정)

> 출처: goal 91 완료 직후 로드맵 논의(2026-07-03) — "헌법도 자동 반영 안 됨" 불만의 근본 원인은
> `YOHAN_BRAIN_ROOT` 환경변수를 설정해도 이미 열린 터미널/Claude Code 세션은 재시작 전까지
> 못 읽는 Windows 프로세스 환경변수 상속 구조. env var를 코드가 대신 설정하는 방향은 이 문제를
> 못 피하고, 고정경로 자동탐색은 신뢰 못 할 휴리스틱이라 기각(Explore 정찰 2회로 확정) —
> 유일하게 근거 있는 경로는 매 실행마다 디스크를 새로 읽는 파일 기반 설정.

## 근거

- `src/lib/core-rules.ts` `loadCoreRuleset()`이 `YOHAN_BRAIN_ROOT` 하나에만 의존 — 이 값을
  바꾸려면 항상 재시작이 필요했다.
- 이 코드베이스엔 이미 홈 디렉터리 파일기반 설정 관례가 있다(`version-check.ts`가 캐시 목적으로
  `~/.vhk/...` 사용) — 그 연장으로 사용자가 명시적으로 저장하는 `brainRoot` 설정을 추가.

## 동작

`vhk config set-brain-root <경로>` — `~/.vhk/config.json`에 `{brainRoot}` 저장. 저장 직후
그 경로 자체가 유효한지 즉시 재확인해 3가지 정직한 결과 중 하나를 보여준다: (1) 경로에
`core-ruleset.yaml`이 없음 → 경고 (2) 유효하지만 `YOHAN_BRAIN_ROOT`가 다른 경로를 가리켜
지금은 안 쓰임 → 경고 (3) 유효하고 지금 바로 적용됨 → 성공.

`loadCoreRuleset()`은 3단계 우선순위로 확장: ①`YOHAN_BRAIN_ROOT` 환경변수 ②
`~/.vhk/config.json`의 `brainRoot` ③ 번들 스냅샷. 기존 env var 사용자는 항상 우선순위 1위라
회귀 없음.

## Completion Check

- [x] `src/lib/home-config.ts` — `~/.vhk/config.json` read/write, 손상·미존재 시 null 폴백
- [x] `loadCoreRuleset()` 3단계 우선순위(env → 홈 설정파일 → 번들), `homeDir` 인자로
      하위호환(무인자 호출 기존 동작 그대로)
- [x] `vhk config set-brain-root <path>` — 저장 + 즉시 3-way 피드백(무효/env우선/성공)
- [x] 명령 등록 4지점(index.ts·command-registry.ts·cli-args.ts·ko.ts) + COMMANDS.md
- [x] goal 91 경고 문구에 재시작 불필요 대안으로 병기
- [x] 공통 게이트(_meta) + `check-goal-92.mjs`(고유 검증으로 채움)

## 구현 결과 (2026-07-03)

- `src/lib/home-config.ts`(신규) — `getHomeConfigPath`/`readHomeConfig`/`writeHomeConfig`.
  `atomicWriteFile` 사용(이 코드베이스 지배적 관례, 21개 파일) — `version-check.ts`의 raw
  `writeFileSync` 관례를 의도적으로 안 따름: `brainRoot`는 사용자가 명시적으로 1회 설정한
  값이라 손상 시 복구 수단이 없다.
- `src/lib/core-rules.ts` — `tryLoadLive(brainRoot)` 헬퍼로 라이브 로딩 로직 추출(기존
  env-var 분기 동작 그대로, git diff로 보존 확인) + `loadCoreRuleset(homeDir?)` 3단계 우선순위.
- `src/commands/config.ts`(신규) — `configSetBrainRoot(path, homeDir?)`.
- `src/i18n/ko.ts` — `config` 블록 신규(7 키) + `coreRulesBundledWarn`에 대안 명령 병기.
- 명령 등록 4지점 전부 배선 + `COMMANDS.md` "사용자 설정(config)" 섹션 추가.

### critic 적대검증이 찾은 진짜 결함과 수정

1. **(Medium, M1) 테스트가 실제 `YOHAN_BRAIN_ROOT` 사용자 환경에서 거짓 실패할 수 있었음** —
   `config.test.ts`가 이 환경변수를 격리하지 않아, 정작 이 기능이 타겟하는 사용자(이미
   `YOHAN_BRAIN_ROOT`를 설정해 둔 개발자 본인 포함)의 셸에서 테스트를 돌리면 스퓨리어스하게
   깨질 수 있었다. `core-rules.test.ts`에 이미 있던 `beforeEach`/`afterEach` save-delete-restore
   패턴을 그대로 적용해 수정.
2. **(Medium, M2 — 더 심각) "성공" 피드백이 저장한 값이 아니라 env var 결과를 보고 판정** —
   `configSetBrainRoot`가 `loadCoreRuleset()`의 전체 결과(항상 env var 우선)로 성공을
   판정했다면, env var가 사용자가 방금 저장한 것과 *다른* 유효한 경로를 가리킬 때 그 env의
   버전을 성공으로 표시해 사용자를 속인다 — "저장했는데 왜 반영이 안 되지" 혼란의 재발.
   RED 테스트로 직접 재현(env=`1.1.1`, 방금 저장=`5.5.5`인데 "✅ 성공"이 `1.1.1`로 뜨는 걸
   확인) 후, `tryLoadLive`를 export해 `config.ts`가 "방금 저장한 경로" 자체의 유효성을
   env-override 여부와 독립적으로 판정하도록 수정 — 3-way 정직한 결과(무효/env우선/성공)로.

### 게이트

`pnpm exec tsc --noEmit`·`pnpm build`·`pnpm lint` clean. `pnpm test:run` 전체 green
(신규: `home-config.test.ts` 5개, `config.test.ts` 3개, `core-rules.test.ts` 3단계
우선순위 5개, `init-core-rules-warn.test.ts` 회귀 1개 추가).

### 이 워크트리의 한계 (머지 후 별도 커밋으로 완료)

feature worktree가 goal 88-91 컨텍스트 없이 분기돼 이 문서(goal 92 파일 자체)와
`ko.ts`의 `coreRulesBundledWarn` 재시작-불필요 대안 병기는 `main` 머지 직후 별도로 완료.

## Forbidden Actions (OUT)

- `YOHAN_BRAIN_ROOT` 환경변수를 코드가 대신 설정하는 로직 금지 — 재시작 문제를 못 피함(정찰로 기각).
- 고정경로 자동탐색(예: `~/dev/yohan-brain` 하드코딩) 금지 — 신뢰 못 할 휴리스틱.
- `vhk config show`/`list` 등 조회 명령 범위 밖(YAGNI) — `vhk context`가 이미 현재 소스를 보여줌.
- `nlp-router.ts` 키워드 추가 안 함 — 최근 관리형 명령(cost/worktree/seo/stats 등)과 동일하게
  1회성 명시적 설정 명령이라 자연어 트리거 불필요.

## Mandatory Reading

`src/lib/home-config.ts` · `src/lib/core-rules.ts` · `src/commands/config.ts` ·
[goal 91](91-core-rules-fallback-visibility.md)
