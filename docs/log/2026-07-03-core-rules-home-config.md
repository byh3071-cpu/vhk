# 2026-07-03 — core-rules 자동화(goal 92) — `~/.vhk/config.json` 파일기반 설정

> append-only. 추가만, 수정·삭제 금지.

## 한 일

배포 로드맵 합의 중 "core-rules 자동화 진짜로 할 수 있나" 재검토 → Explore 에이전트 2회(실현가능성·구현세부) → Plan Mode 승인 → TDD 구현 → critic 적대검증 → 반영.

## 배경

`YOHAN_BRAIN_ROOT` 환경변수를 설정해도 이미 열린 터미널/Claude Code 세션은 재시작 전까지 못 읽는다(Windows 프로세스 환경변수 상속 구조). goal 91은 이 상황을 경고로 가시화했지만 근본 자동화는 안 됐음 — 이번이 그 후속.

## 변경

- `src/lib/home-config.ts`(신규) — `~/.vhk/config.json`(`brainRoot` 필드) read/write. `atomicWriteFile` 사용(코드베이스 지배적 관례, `version-check.ts`의 raw write와 다른 선택 — 사용자 명시값이라 손상 시 복구수단 없어서).
- `src/lib/core-rules.ts` — `loadCoreRuleset()` 3단계 우선순위로 확장: ① `YOHAN_BRAIN_ROOT` env var(기존) ② `~/.vhk/config.json`의 `brainRoot`(신규) ③ 번들 폴백(기존). `tryLoadLive()` 헬퍼로 추출해 재사용(기존 env 경로 동작 변경 없음, git diff로 확인). `homeDir` 선택적 파라미터(기본 `os.homedir()`) 추가 — 기존 무인자 호출부 하위호환.
- `src/commands/config.ts`(신규) — `configSetBrainRoot(path, homeDir?)`. 저장 직후 방금 저장한 경로 자체를 검증해 즉시 피드백.
- 명령 등록 4지점(`index.ts`·`command-registry.ts`·`cli-args.ts`·`ko.ts`) + `COMMANDS.md`.

## critic이 찾은 진짜 결함과 대응

**M1**: `config.test.ts`가 `YOHAN_BRAIN_ROOT` 환경변수를 격리 안 해서, 이 기능을 실제로 쓰는(env var 설정된) 개발자 머신에서 테스트가 스푸리어스하게 실패할 수 있었음 — `core-rules.test.ts`엔 이미 있던 env 저장/삭제/복원 패턴이 누락됨. beforeEach/afterEach 추가로 수정.

**M2 (진짜 중요한 발견)**: `configSetBrainRoot`가 저장 직후 `loadCoreRuleset()`(env var를 최우선으로 보는 전체 우선순위 함수)의 결과만 보고 "성공"을 판단했음 — 만약 `YOHAN_BRAIN_ROOT`가 **다른** 유효 경로를 가리키고 있으면, 방금 저장한 경로는 실제로 안 쓰이는데도 (env 경로가 우선 적용돼) "성공! 즉시 적용됩니다"라고 오도했음. `tryLoadLive`를 `core-rules.ts`에서 export해 "방금 저장한 경로 자체가 유효한가"와 "env가 그걸 가리는가"를 분리 판정하도록 수정 — 정확히 goal 91에서 겪은 것과 같은 클래스의 문제("안내가 실제 결과와 다르면 안내가 없는 것보다 나쁘다")가 새 기능에서 또 재현됨.

RED 테스트로 두 버그 모두 먼저 재현 확인 후 수정(TDD).

## 게이트

`pnpm build`·`pnpm exec tsc --noEmit`·`pnpm lint` clean. `pnpm test:run` 2163/2163 pass.

## 참고 — 이 워크트리의 한계

`origin/main`에서 분기돼(오늘 만들어진 goal 88~91이 이 브랜치엔 없음) `coreRulesBundledWarn` 경고문구에 새 명령(`vhk config set-brain-root`) 안내를 병기하는 작업(계획의 5단계)과 goal 92 정식 등록은 **main 머지 후 별도로 처리**함 — 그 코드/파일들이 이 워크트리엔 아예 없어서.

## 교훈

- **"성공 여부 판정에 어떤 함수를 쓰는가"가 새로운 버그의 근원이 될 수 있다.** `loadCoreRuleset()`(전체 우선순위 적용)과 `tryLoadLive()`(특정 경로만 확인)는 미묘하게 다른 질문에 답하는데, "저장한 게 실제로 쓰이는지" 확인하려면 후자가 맞았다 — 있는 함수를 그냥 재사용하면 편하지만, 그 함수가 정확히 무슨 질문에 답하는지 다시 확인해야 한다.
- **같은 세션 안에서 critic이 잡은 결함 클래스(안내 문구가 실제 결과와 어긋남)가 이번이 벌써 여러 번째 재현.** goal 91의 `vhk sync` 오안내, 이번 M2 — 패턴이 반복될수록 "새 사용자 대면 메시지를 쓸 때는 그 메시지가 진짜 상황을 다 커버하는지"를 습관적으로 의심해야 한다는 확신이 굳어진다.
