---
vhk_format: 1
type: goal
id: 91
title: core-rules 폴백 가시화 — YOHAN_BRAIN_ROOT 미설정 시 조용한 구버전 스냅샷 사용을 경고 — P2
status: DONE
priority: P2
created: 2026-07-03
completed: 2026-07-03
leads_to: "헌법도 자동 반영 안 됨" 불만의 유력 원인(조용한 폴백)을 가시화 — 최소 수정으로 독립 완료 가능
---

# Goal 91: core-rules 폴백 가시화

> 출처: [goal 88](88-init-docs-scaffold.md)/[goal 89](89-customization-hook.md) 설계 세션(2026-07-03) 중 감사로 새로 발견. 원래 goal 89의 B-2로 묶여있었으나 서로 다른 코드 경로(`core-rules.ts` vs 커스터마이징 훅)라 독립 goal로 분리.

## 근거 (실측 — 코드 확정 2026-07-03)

- `src/lib/core-rules.ts:77-94` `loadCoreRuleset()` — `YOHAN_BRAIN_ROOT` 환경변수 없거나 읽기 실패 시 **조용히** `CORE_RULESET_SNAPSHOT`(번들, npm 배포 시점에 박제된 스냅샷)으로 폴백.
- `grep "source"` core-rules.ts 전역 — 이 값(`'live' | 'bundled'`)을 실제로 사용하는 곳은 `.agents/CORE-RULES.md` 파일 안에 심어지는 HTML 마커 주석 한 줄(`vhk bundled snapshot`)뿐. `console.log`/`chalk.warn` 등으로 사용자에게 알리는 코드 0건.
- 사용자가 "헌법도 자동으로 반영이 안 되고 그러더라"라고 보고한 것과 정확히 부합하는 유력 원인 — 사주운세·축구 레포를 만든 터미널 세션에 `YOHAN_BRAIN_ROOT`가 안 잡혀 있었다면, 조용히 구버전 헌법 스냅샷을 받고도 아무 신호가 없었을 것.
- **정정(외부 교차검증 반영)**: 헌법 파일(`.agents/CORE-RULES.md`) 자체가 안 만들어지는 건 아니다 — `init.ts:366`(현재 라인은 구현 시점 재확인)이 무조건 생성은 한다. 문제는 생성되는 *내용의 신선도*가 조용히 결정된다는 것.
- **번들 스냅샷이 이미 라이브보다 뒤처짐(실측)**: `core-ruleset-snapshot.ts`엔 `pattern_refs`가 PAT-007까지만 있는데, `.agents/CORE-RULES.md`(라이브 상속분, `YOHAN_BRAIN_ROOT` 있을 때 core-ruleset.yaml에서 옴)엔 PAT-009까지 참조됨 — 이 goal이 풀려는 문제가 이미 실측으로 재현됨.

## 동작

`vhk init`/`vhk start` 실행 시 `loadCoreRuleset().source === 'bundled'`면 콘솔에 경고 1줄(예: "⚠️ YOHAN_BRAIN_ROOT 미설정 — 헌법 번들 스냅샷(vX.Y.Z) 사용 중, 최신 아닐 수 있음") + `.vhk/context.md`에도 동일 정보 1줄 남겨서 init 완료 시점이 지나도 나중에 확인 가능하게.

- **경고만, 자동 해결 금지** — `YOHAN_BRAIN_ROOT`를 코드가 임의로 탐색·설정하지 않는다(환경변수를 코드가 건드리는 건 이 goal의 범위 밖이자 별도 논의가 필요한 문제).

## Completion Check

- [x] `source='bundled'`일 때 init/start 콘솔 출력에 경고 문구 포함
- [x] `source='live'`일 때 경고 없음(회귀 없음)
- [x] `.vhk/context.md`에 core-rules 소스 표기 (init 시드 + `vhk context`/`vhk start` 5단계 양쪽)
- [x] 공통 게이트(_meta) + `check-goal-91.mjs`(고유 검증 6개로 채움)

## 구현 결과 (2026-07-03)

- `src/templates/vhk-dir.ts` `VHK_CONTEXT_SEED()` 4번째 인자(`core: {source, version}`) 추가 — 호출처 2곳(`init.ts`·`inject-bootstrap.ts`) 전부 갱신.
- `src/commands/init.ts` — `generateFiles()`가 시드에 소스 배선 + `init()` 꼬리에서 `source==='bundled'`면 `log.warn` 경고.
- `src/commands/context.ts` — `vhk start` 5단계(`context()`가 `.vhk/context.md`를 완전히 덮어씀)에도 동일 섹션 별도 배선.
- `src/i18n/ko.ts` — `coreRulesBundledWarn(version)` 신규 키.

### critic 적대검증이 찾은 진짜 결함과 수정 (구현 1차 완료 후)

1. **(High) 조치 안내 명령이 틀림** — 초안 문구가 "`vhk sync`를 다시 실행하세요"라고 안내했지만, `sync.ts`의 `SYNC_TARGETS`(7개 미러 파일)는 `.agents/CORE-RULES.md`를 절대 건드리지 않음(grep 0건, 직접 확인). 실제 재생성기는 `inject-bootstrap.ts`의 `injectBootstrapAll`뿐이고, `writeInjectFile`이 `--force`/`--yes` 없으면 기존 파일을 `skipped`함(`isCurrentCoreRules`가 버전 태그로 판정하므로 plain 재실행도 무력함을 확인). 사용자가 지시대로 `vhk sync`를 실행하면 "완료" 메시지를 보고 헌법이 갱신됐다고 **거짓 확신**하지만 실제 파일은 그대로였음 — 문구를 `vhk inject-bootstrap --force`로 정정.
2. **(Medium) "YOHAN_BRAIN_ROOT 미설정" 단정** — `loadCoreRuleset()`은 진짜 미설정과 "설정은 됐지만 yaml 읽기 실패"(catch 분기, `core-rules.ts:85`) 둘 다 `bundled`로 수렴하는데 문구가 "미설정"만 언급 — 후자 케이스면 사용자가 "설정했는데 왜 미설정이래?"에 빠짐. "미설정 또는 라이브 파일 읽기 실패"로 정정(3개소: `ko.ts`·`vhk-dir.ts`·`context.ts`, critic이 `context.ts`가 `vhk-dir.ts` 로직을 그대로 복제했다는 점도 지적해 양쪽 다 수정).
3. **(Low) 과거형 "생성됐어요" 부정확** — 브라운필드 재-init에서 파일이 이미 있으면 write 루프가 skip하는데도 경고는 무조건 "생성됐어요"라 표현 — "사용되고 있어요"(상태 서술)로 정정, High #1 수정과 통합.
4. **(Low) `version:'unknown'` → "vunknown" 표기** — yaml에 version 필드 없으면 "번들 스냅샷(vunknown)"으로 렌더 — `version==='unknown'` 분기로 "버전 미상" 표기.

검증 통과 확인 항목(critic): 두 `VHK_CONTEXT_SEED` 호출처 전부 갱신(4번째 인자 필수라 누락 시 `tsc` 즉시 실패, 실제 exit 0 확인) · `log.warn` 이모지 자동 접두와 문구 내 중복 없음 · `start.ts` 순서상 `context()` 별도 수정이 불필요한 중복이 아님(2단계 init → 5단계 context가 덮어씀) · 이중 `loadCoreRuleset()` 호출(시드용/경고용) 사이 상태 변화 없어 타이밍 버그 없음 · 테스트가 실제 `console.log`→`log.warn`→`sink` 경로를 검증(우연 통과 아님) · `.vhk/context.md` 신규 섹션이 `drift.ts`의 sha 추출 정규식을 안 깸.

out of scope로 명시 보류: context 드리프트 감지가 core 소스 변경 자체는 추적 안 함(goal 91 범위 밖, 새 섹션은 정적 마커 성격).

### 게이트
`pnpm build`·`pnpm exec tsc --noEmit`·`pnpm lint` clean. `pnpm test:run` 2185/2185 pass.

## Forbidden Actions (OUT)

- `YOHAN_BRAIN_ROOT` 자동 탐색·설정 로직 추가 금지 — 경고만.
- 번들 스냅샷 자체를 최신화하는 자동화 금지 — 별도 릴리즈 프로세스 영역.
- goal 89/90의 커스터마이징 훅·sync 라우팅 로직 변경 금지 — 별개 코드 경로.

## Mandatory Reading

`src/lib/core-rules.ts` · `src/lib/core-rules.test.ts` · `src/commands/init.ts` · `src/commands/start.ts`
