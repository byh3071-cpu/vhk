# 2026-07-03 — goal 88/89 설계: VHK init 커스터마이징 자동화

> append-only. 추가만, 수정·삭제 금지.

## 한 일

사용자가 사주운세 디스코드봇·축구 레포를 VHK로 독푸딩하다 발견한 문제 — `vhk init`/`start`로 새 프로젝트를 만들면 CLAUDE.md/.cursorrules/헌법(core-rules)이 도메인에 맞게 자동 반영되지 않고, 노션 바이브코딩 스타터킷의 docs 구조(rfc/patterns/state/goals)도 새 프로젝트엔 안 만들어짐 — 를 조사·설계했다.

plan mode로 원인 분석(Explore 에이전트 3개 병렬 + Plan 에이전트 1개 + 코드 직접 검증) → "코드로 강제 vs 지침 강화" 이분법이 틀렸다는 결론(폴더/템플릿 생성=코드로 100% 강제, 도메인 내용=코드가 못 채우지만 트리거는 코드로 강제 가능, 세션 내내 재량 사용=완전 강제 불가) → 계획 승인 → goal 88/89로 분리.

### 변경
- `goals/88-init-docs-scaffold.md`(신규) — docs/rfc·docs/patterns README 스캐폴딩 + `vhk goal init` 발견성 노출. 기계적 부분만, P2.
- `goals/89-customization-hook.md`(신규) — 새 프로젝트 첫 세션에서 도메인 커스터마이징 인터뷰를 SessionStart 훅으로 강제 트리거(B-1) + core-rules 폴백 가시화(B-2, 아래 발견 참조). P1.
- `scripts/check-goal-88.mjs`·`scripts/check-goal-89.mjs`(신규) — `vhk goal sync` 실커맨드로 백필(손으로 안 베끼고, 65번 기존 스텁과 템플릿 동일한지 먼저 대조 확인 후 실행).
- `scripts/check-goal-73.mjs`·`scripts/check-goal-79.mjs`(신규) — 위 커맨드의 부수효과로 이번 작업과 무관한 기존 누락분도 같이 채워짐(idempotent 백필이라 안전).
- `goals/README.md` — 인덱스 재생성(8건→10건, 자동생성 스크립트로 갱신).

## 발견 (계획 승인 뒤 사용자 재검증 요청으로 추가 감사 중 확보)

- **core-rules 조용한 폴백**: `src/lib/core-rules.ts:77-94` `loadCoreRuleset()` — `YOHAN_BRAIN_ROOT` 환경변수 미설정/읽기실패 시 조용히 번들 스냅샷(`core-ruleset-snapshot.ts`, npm 배포 시점 박제)으로 폴백. `init.ts`/`start.ts` 어디에도 이 source(`live`/`bundled`)를 콘솔에 경고하는 코드 0건(마커 주석 안에만 흔적, 생성된 `.agents/CORE-RULES.md`를 직접 열어야만 보임). 사용자의 "헌법도 자동 반영 안 되고 그러더라" 불만과 정확히 부합하는 유력 원인 — 최초 승인된 계획엔 없었고 이번 감사에서 새로 찾아 goal 89(B-2)에 통합.
- **번들 스냅샷이 이미 라이브보다 뒤처짐(실측)**: `core-ruleset-snapshot.ts`엔 `pattern_refs`가 PAT-007까지만 있는데, `.agents/CORE-RULES.md`(라이브 상속분, `YOHAN_BRAIN_ROOT` 있을 때 core-ruleset.yaml에서 옴)엔 PAT-009까지 참조됨. 번들 스냅샷이 실제로 라이브보다 낡아있다는 직접 증거 — B-2가 풀려는 문제가 이미 실측으로 재현됨.

## 교훈

- **AI 세션 간 인수인계 상태값은 스냅샷이지 실시간이 아니다.** 이번 전달 프롬프트는 "미커밋 4건"이라 했지만 실제 `git status`는 8건(게이트 스크립트 백필 4개가 프롬프트 작성 이후 추가된 것으로 추정). 실행 전 항상 직접 재확인해야 함 — 이번엔 커밋 범위(어떤 파일을 stage할지)를 잘못 잡을 뻔한 지점이었다.
- **위 교훈이 패턴사전(PAT) 후보로 보였지만 번호를 임의로 못 매김.** `docs/patterns/`엔 PAT-001 파일 하나뿐이라 "다음은 002"로 보이지만, 코드 전역(`core-ruleset-snapshot.ts`·`scan-llm-guardrails.ts`·`secure.ts`·`ADR-005` 등)을 직접 grep해 확인한 결과 PAT-002~007은 이미 실사용 중인 확정 개념("LLM JSON 3단 게이트" 등)이고 PAT-008/009도 라이브 core-ruleset(yohan-brain, 이 세션에서 접근 불가)엔 이미 존재함이 간접 확인됨. 여기서 002를 붙였으면 실제 PAT-002와 충돌할 뻔했다 — **파일 생성 보류, 다음 가용 번호는 사용자 확인 필요(최소 010 이상으로 추정, 확정 아님)**.
- **plan mode 승인 뒤에도 재검증 요청은 실제로 새 갭을 잡아낸다** — core-rules 폴백 건이 그 증거. "승인됐으니 끝"이 아니라 재확인 자체가 오늘 값어치 있었다(dogfood 관찰 1호 데이터포인트).

## 다음

goal 88 코드 구현 착수 — explorer(haiku) 정찰 → planner(opus) 계획 → **사람 승인** → 구현 → critic(opus) 적대검증 순서로 진행(계획 승인 전 코드 변경 없음). PAT 번호 건은 사용자에게 별도 확인 요청 예정.

## 추가 — goal 88 구현 완료 (같은 날, 후속)

explorer(haiku)→planner(opus)→**사람 승인**(1차 반려: "fable5 안 써도 되는겨?" → claude-api 스킬로 검증, goal 88은 기계적 작업이라 불필요·2차 승인)→TDD 구현(RED→GREEN, PR1/PR2)→critic(opus, general-purpose 폴백 — `yohan-core:critic` 이 세션엔 미탑재)까지 전 단계 완주.

### 변경
- `src/templates/docs-readme.ts`(신규) — `RFC_README_TEMPLATE()`·`PATTERNS_README_TEMPLATE()`.
- `src/commands/init.ts` — 위 템플릿 import + `generateFiles()`에 `docs/rfc/README.md`·`docs/patterns/README.md` 배선.
- `src/commands/start.ts` — 완료 안내에 `log.dim(ko.start.goalInitHint)` 1줄.
- `src/i18n/ko.ts` — `goalInitHint` 키 신규.
- `tests/init.test.ts`·`tests/start.test.ts` — EXPECTED_FILES 2개 확장 + start 신규 테스트 2개(힌트 포함 확인·goal init 자동실행 안 됨 회귀가드).

### 게이트
`pnpm build`(성공) · `pnpm test:run`(2152/2152 pass) · `pnpm lint`(clean).

### critic 결과 (요약)
mission 이탈 없음(Forbidden 3개 전부 준수, 코드로 직접 확인) · 템플릿 제네릭성 확보(vhk 전용 표현 전부 제거 확인) · 테스트 false-green 아님(힌트 줄 지우면 실제로 실패함을 확인) · `generateFiles()` 신규 키 2개가 다른 소비처 안 깸. 유일 관찰(비차단): goal 88 frontmatter status 갱신 필요(프로세스, 별도 처리).

### fable5 질문 처리 (dogfood 관찰)
사용자가 "fable5 안 써도 되나" 질문 → claude-api 스킬 invoke해서 모델 스펙 직접 검증(기억 추정 금지 원칙) → Fable5는 "가장 까다로운 추론·장시간 작업" 전용·비용 2배·명시적 요청시만 사용이 스킬 자체 규정 → goal 88(기계적 작업)엔 불필요, opus로 충분 결론. goal 89류 복잡한 작업엔 재고 여지 있다고 답변.

### 교훈 (추가)
- **`yohan-core:critic` 서브에이전트를 사용자 CLAUDE.md가 문서화했지만 이 세션엔 아직 미탑재**(플러그인 신규 등록 후 세션 재시작 전으로 추정) — `Agent` 호출 에러로 즉시 발견, `general-purpose`+`model:opus` 폴백으로 문제없이 진행. 서브에이전트 이름을 CLAUDE.md에서 봤다고 그대로 믿지 말고 실패 시 폴백 경로를 갖고 있으면 손실 0.
- **"인수인계 상태값은 스냅샷" 교훈이 이번에도 재현** — 외부 세션이 "goal 88부터 코드 구현 이어가라"고 전달했지만 이미 완료 상태였음(같은 세션 안에서 2번째 재현). 반복성이 확인됐으니 PAT 후보 확신도가 올라감 — 다음 가용 번호 확정되면 등재.

## 추가 — goal 89 3-way 분리 (외부 교차검증 반영)

외부 세션이 VHK 소스를 직접 대조해 goal 89 설계의 취약점을 하나 찾음: "인터뷰 답변을 RULES.md에 쓰면 `vhk sync`가 알아서 `.cursorrules`/CLAUDE.md로 전파한다"는 가정이 검증 안 된 채였음. 이 세션에서 `sync.ts:19,23,79,316,35,593`(`CURSORRULES_KEYS`/`CLAUDE_MD_KEYS`/`buildCodingDoc`/`toClaudeMd`/`findUnmappedSections`) 직접 읽어 재확인 — **반박 정확함**: 섹션 제목 substring 매칭이라 "도메인 규칙" 같은 자연스러운 제목은 두 키 목록 어디에도 안 걸림 → `.cursorrules`/CLAUDE.md엔 안 가고 원본 RULES.md·일부 산출물에만 남음. 원래 버그("안 짚으면 스킵")의 사촌(조용히 반쪽 전파)이 남는 셈.

사람 결정(외부 세션 경유)에 따라 goal 89를 3개로 분리:
- `goals/89-customization-hook.md`(개정) — 트리거 메커니즘(마커·SessionStart 훅·settings.json 병합)만. 전파 정합성 주장 제거.
- `goals/90-sync-propagation-fidelity.md`(신규) — 라우팅 결정((a)기존 키 재사용 vs (b)신규 키 추가) + 블랙박스 회귀 테스트. P1(89 혼자 완료돼도 이게 없으면 "커스터마이징이 실제로 먹힌다"는 주장 성립 안 함).
- `goals/91-core-rules-fallback-visibility.md`(신규, 구 B-2 그대로 이동) — core-rules 폴백 가시화. P2, 독립적.

`vhk goal sync`로 `check-goal-90.mjs`·`check-goal-91.mjs` 백필(스텁), `goals/README.md` 인덱스 재생성(10건→12건).

## 교훈 (추가 2)

- **1차 설계에서 "sync.ts 안 건드림"이라 적었던 전제 자체가 미검증 주장이었다.** 재사용 가능해 보이는 기존 메커니즘(sync.ts fan-out)을 "있으니까 될 거다"로 넘어갔는데, 정작 그 메커니즘의 매칭 규칙(섹션 제목 substring)을 내가 직접 코드로 확인한 적이 없었음 — 외부 교차검증이 이 구멍을 잡음. **"기존 코드를 재사용한다"는 계획 문장은 그 자체로 검증 완료가 아니다 — 정확히 어떤 입력이 그 코드 경로를 타는지까지 확인해야 재사용 주장이 성립한다.**

## 추가 — goal 89(트리거) 구현 완료

haiku 정찰 → opus 설계(gate 회피 정규식·삽입 라인번호까지 직접 재검증) → **사람 승인** → TDD(RED→GREEN, PR1/PR2/PR3) → critic(opus, `general-purpose` 폴백 — `yohan-core:critic` 이 세션엔 여전히 미탑재) 전 단계 완주.

### 변경
- `src/templates/customization-hook.ts`(신규) — `CUSTOMIZATION_HOOK_TEMPLATE()`, 자기완결형 SessionStart 훅 `.mjs`.
- `src/commands/init.ts` — `ensureCustomizationMarker()`·`ensureSessionStartHook()` 신규 + `generateFiles()`/`writeInitExtras()` 배선.
- `src/i18n/ko.ts` — 안내 문구 3개.
- `src/templates/vhk-dir.ts` — `.vhk/.gitignore`·`.vhk/README.md` 씨앗에 마커 항목 반영.
- `docs/spec.md` — spec_version 1.1→1.2, 파일 표·변경이력 갱신.
- `tests/init.test.ts`·`tests/customization-hook.test.ts`(신규) — 마커 4상태·훅 병합 6케이스(critic 지적 2건 추가 포함)·서브프로세스 실행 4조합.

### 게이트
`pnpm build`·`pnpm exec tsc --noEmit`·`pnpm lint` 전부 clean. `pnpm test:run` 2169/2169 pass.

### 구현 중 실제로 잡힌 것 2건
1. **게이트 위반**: `ensureSessionStartHook`이 raw `JSON.parse(readFileSync(...))` 써서 `check-no-raw-json-parse` 게이트(BOM-안전성, PAT-002 아님)에 걸림 → `readJsonFile()`로 교체, 즉시 해소.
2. **critic이 진짜 버그 하나 찾음**: `hooks`가 배열(비정상 형태)이면 `typeof === 'object'` 체크를 통과해버려서 `SessionStart` 병합 결과가 `JSON.stringify`에서 조용히 유실되는데 반환값은 `'merged'`(성공)였음 — RED로 재현 확인 후 `Array.isArray` 가드 추가해 `'skipped'`로 정정. 같은 리뷰에서 UX 갭(건너뛰기 시 무한 재넛지)도 지적받아 훅 지시문에 "건너뛰어도 done 마커는 만들어라" 한 줄 추가.

### 교훈
- **critic 리뷰를 "게이트 다 green이니 형식적으로 돌린다"고 여기면 안 된다** — 이번에도 게이트 2169개가 전부 green인 상태에서 critic이 실제 데이터 유실 버그(배열 hooks 케이스)를 찾아냈다. 테스트 커버리지가 있어도 "생각 못 한 입력 형태"는 여전히 새 눈이 잡는다.
- goal 88/89 두 goal 모두 critic이 지적한 걸 그 자리에서 바로 반영(추가 승인 사이클 없이) — 이유: 둘 다 이미 승인된 구현의 범위 내 미세 수정(텍스트 문구·방어 로직 강화)이지 새 아키텍처가 아니었음. 반대로 goal 90처럼 설계 자체가 바뀌는 지적이면 재승인이 맞다 — 이 경계 판단 자체가 이번 세션에서 두 번 실전 적용됨.

## 다음
goal 90(sync 전파 정합성) → goal 91(core-rules 폴백 가시화) 순서로 진행 예정. goal 89 커밋 직후 사용자에게 상태 보고.

## 추가 — goal 90(sync 전파 정합성) 구현 완료 · DONE

haiku 정찰 → opus 설계(sync.ts 8개 산출물 함수 전부 직접 대조, `CURSORRULES_KEYS`에 `'도메인'` 키 1개만 추가하는 최소변경안 도출) → 내가 직접 sync.ts·rules-md.ts 재검증(`## 안전 규칙` 기존 미매핑 부수 발견) → **사람 승인** → TDD(RED→GREEN) → critic(opus) 적대검증 → **critic이 진짜 아키텍처 리스크 발견** → 대응 반영 → 재검증 → commit.

### 변경
- `src/commands/sync.ts:19` — `CURSORRULES_KEYS`에 `'도메인'` 추가(6개→7개). `toClaudeMd`가 이 배열을 union하므로 `CLAUDE_MD_KEYS`는 안 건드림.
- `src/templates/customization-hook.ts` — 인터뷰 지시문을 "적절한 섹션에 추가"(범용)에서 "`## 도메인 규칙` 섹션 하나에 정리(### 하위 허용)"(구체적)로 교체.
- `tests/sync.test.ts` — 블랙박스 전파 테스트 4개(`.cursorrules`·CLAUDE.md·나머지 5개 코딩 타깃 전부 도달 + findUnmappedSections 미탐지 확인) + 리스크 characterization test 1개.
- `scripts/check-goal-90.mjs` — 고유 검증 4개(정규식으로 배열 리터럴 한정, 주석 오탐 방지).
- `goals/90-sync-propagation-fidelity.md` — 결정 근거·리스크 기록, NOT_STARTED→DONE.

### critic이 찾은 진짜 리스크와 대응
`CURSORRULES_KEYS` 확장이 `VHK_MANAGED_KEYS`(spread)에도 자동 반영되는데, 이 배열은 `stripLegacyAutogen`(레거시 마커없는 CLAUDE.md 1회 마이그레이션의 삭제 판정)에도 쓰임 — 즉 이 기능 이전에 사용자가 CLAUDE.md에 손으로 쓴 "도메인" 섹션이 있으면 최초 sync 시 삭제 대상으로 분류될 수 있음. **결정적으로, `docs/log/2026-06-10-governance.md:63-65`에 'Forbidden' 키에 대해 정확히 이 이유로 신규 키 추가를 거부한 전례가 있었다** — 직접 원문 대조로 확인.

대응: 키셋을 분리하는 완화책(직관적으로 제일 먼저 떠오름)은 `sync.ts:27-29` 자체 주석("재생성 판정과 삭제 판정은 같은 키 집합을 써야 중복이 안 생긴다")과 정면 배치돼 기각. 대신 위험을 받아들이되(1) 완전 침묵 아님(removed 노출+백업으로 복구 가능) (2) "도메인"은 'Forbidden'과 달리 이 기능 이전엔 표준 관용구가 아니라 위험 시나리오가 훨씬 좁다는 점을 근거로 그대로 두고, characterization test로 트레이드오프를 코드에 박아 문서화(동작이 조용히 바뀌면 테스트가 잡음).

### 게이트
`pnpm build`·`pnpm exec tsc --noEmit`·`pnpm lint` clean. `pnpm test:run` 2174/2174 pass. `check-goal-90.mjs` 고유 검증 4개 통과.

### 교훈
- **"영향 범위를 확인했다"는 주장도 grep 결과에 의존하면 놓칠 수 있다.** `CURSORRULES_KEYS`/`CLAUDE_MD_KEYS`가 다른 파일에 중복 하드코딩 안 됐다는 grep 결과는 정확했지만, **같은 파일 안에서 파생되는 다른 배열(`VHK_MANAGED_KEYS`)이 완전히 다른 함수(레거시 마이그레이션)에서 소비된다**는 건 grep으로 안 잡혔다 — critic이 코드 흐름을 끝까지 추적해서 잡음. "정의부만 확인"과 "모든 파생/소비처를 끝까지 추적"은 다른 검증 깊이다.
- **과거 governance 결정(이 저장소 자신의 dev log)이 지금 결정의 반증 자료가 될 수 있다** — critic이 `docs/log/2026-06-10-governance.md`를 찾아내 "Forbidden 키를 VHK_MANAGED_KEYS에 안 넣은 전례"를 들이밀었을 때, 이게 정말 같은 상황인지(위험도 비교: Forbidden=거의 100% 매치 vs 도메인=낮은 매치 확률) 따져서 "전례를 그대로 따라야 한다"와 "전례의 근거를 재사용하되 다른 결론"을 구분해야 했다 — 전례를 맹종하지도, 무시하지도 않는 판단이 필요했음.
- **critic 리뷰가 "커밋 차단급은 아니다"라고 해도, 발견한 리스크를 그냥 넘기지 않고 characterization test로 코드에 박아두는 비용은 낮고 가치는 크다** — 나중에 누가 실수로 `stripLegacyAutogen`을 건드려도 이 테스트가 그 순간 잡아준다.

## 다음
goal 91(core-rules 폴백 가시화) 진행 예정.

## 추가 — goal 91(core-rules 폴백 가시화) 구현 완료 · DONE · 4개 goal(88·89·90·91) 전체 완주

opus 설계(핵심 발견 2개: `VHK_CONTEXT_SEED` 호출처 2곳·`vhk start` 5단계 `context()`가 시드를 덮어씀 → 직접 코드 대조로 검증 완료) → **사람 승인** → TDD(RED→GREEN 5사이클) → critic(opus, `general-purpose` 폴백) 적대검증 → **critic이 진짜 High 결함 발견** → 재검증(직접 코드 대조) → TDD로 수정 → 재게이트 → commit.

### 변경
- `src/templates/vhk-dir.ts` — `VHK_CONTEXT_SEED()` 4번째 인자(`core: {source, version}`) 추가, "## 헌법(core-rules) 소스" 섹션 렌더.
- `src/commands/init.ts` — `generateFiles()` 시드 배선 + `init()` 꼬리 경고(`source==='bundled'`).
- `src/lib/inject-bootstrap.ts` — `generateTierSContextSeed()` 2번째 호출처 동기화.
- `src/commands/context.ts` — `vhk start` 5단계 경로에도 동일 섹션 별도 배선(`context()`가 매번 완전 덮어쓰므로 init 시드만으론 부족).
- `src/i18n/ko.ts` — `coreRulesBundledWarn(version)` 신규 키.
- `tests/init-core-rules-warn.test.ts`(신규)·`tests/context.test.ts`·`tests/init.test.ts`·`src/lib/core-rules.test.ts` — bundled/live 케이스·회귀가드·critic 수정 검증 테스트.
- `scripts/check-goal-91.mjs` — 고유 검증 11개(정규식 기반, goal 90 교훈 재적용).
- `goals/91-core-rules-fallback-visibility.md` — NOT_STARTED→DONE, 구현 결과·critic 대응 상세 기록.
- `goals/README.md` — 인덱스 재생성.

### critic이 찾은 진짜 결함 (게이트 전부 green인 상태에서 발견 — 3번째 반복 재현)
**(High) 조치 안내 명령이 실제로 헌법 파일을 갱신하지 않음.** 초안 경고 문구가 "`vhk sync`를 다시 실행하세요"라고 안내했지만, `sync.ts`의 `SYNC_TARGETS`(7개 미러 파일 목록)를 grep해도 `.agents/CORE-RULES.md`/`CORE-RULES` 참조가 **0건** — sync는 이 파일을 절대 안 건드림. 실제 재생성기는 `inject-bootstrap.ts`의 `injectBootstrapAll` 뿐이고, 내부 `writeInjectFile`이 기존 파일 있고 `isCurrentCoreRules`(버전 태그 비교)가 false면 `--force`/`--yes` 없인 무조건 `skipped` — plain 재실행도 무력함을 코드로 직접 확인. 사용자가 지시대로 `vhk sync`를 실행하면 "✅ 완료" 출력을 보고 헌법이 갱신됐다고 **거짓 확신**하지만 실제 파일은 그대로 낡아있었음. 안내가 없는 것보다 나쁜 결함(오확신 유발) — `vhk inject-bootstrap --force`로 정정.

추가로 Medium 1건("YOHAN_BRAIN_ROOT 미설정" 단정이 "설정은 됐지만 읽기 실패" 케이스를 놓침 — `context.ts`가 `vhk-dir.ts` 문구를 그대로 복제했다는 점도 지적)과 Low 2건(과거형 "생성됐어요"가 브라운필드 skip 케이스에서도 뜸·`version:'unknown'`→"vunknown" 코스메틱)도 함께 수정. 전부 RED→GREEN TDD로 반영.

### 게이트
`pnpm build`·`pnpm exec tsc --noEmit`·`pnpm lint` clean. `pnpm test:run` 2185/2185 pass. `check-goal-91.mjs` 고유 검증 11개 통과.

### 교훈
- **"조치 안내가 정확한가"는 코드가 green이어도 검증 안 되는 축이다.** 이번 결함은 로직·타입·테스트 어디에도 안 걸렸다 — 경고를 "띄우는 것" 자체는 완벽히 작동했지만, 띄운 문구 안의 **커맨드 하나가 틀렸다.** TDD는 "경고가 뜨는가"를 증명하지 "경고가 맞는 해결책을 말하는가"는 증명 못 한다 — critic이 sync.ts 소스까지 추적해서야 잡힘. 사용자 대면 문구(에러 메시지·경고·안내)는 로직과 별개로 "이 명령을 실제로 실행하면 뭐가 일어나는가"까지 코드로 추적해야 한다.
- **문구 복제(vhk-dir.ts↔context.ts)가 버그도 함께 복제한다.** 이번 세션에서만 2번째(goal 90의 sync 라우팅 미탐지 섹션도 비슷한 급의 "매칭 규칙 미검증" 사례) — 같은 로직을 두 파일에 손으로 복붙하면 한쪽만 고치고 잊기 쉬움. import 제약(vhk-dir.ts 무의존 컨벤션) 때문에 공유 헬퍼로 안 뽑았지만, 최소한 두 곳 다 동시에 고쳤는지는 매번 grep으로 재확인해야 함.
- **critic이 "게이트 다 green"인 4개 goal 중 3개(88 제외 — 89·90·91)에서 전부 실제 결함을 찾았다.** 표본이 작지만 이 세션 안에서는 "기계적으로 작은 작업"(88)만 critic이 클린 통과를 줬고, "사용자 대면 문구/설계 판단이 들어간 작업"(89·90·91)은 매번 뭔가 잡혔다 — 다음에 유사 작업 분류할 때 참고할 신호.

## 다음
4개 goal(88·89·90·91) 전부 완료. 사용자에게 최종 보고 예정. 세션 중 별도 이연 항목: PAT 번호 확정(사용자 확인 필요) · `rules-md.ts`의 `## 안전 규칙` 미매핑 부수 버그(goal 90에서 발견, 별도 goal 후보) · 기존 사주운세/축구 레포 retrofit(범위 밖, 재실행으로 나중에 가능).

## 추가 — 원래 의도 이행 감사 + 실전 검증 갭 조사 (같은 날, 후속)

사용자 질문("첫 프롬프트 의도대로 됐나? 실전 검증 더 필요한 거 있나?")에 답하려고 Explore 에이전트 3개 병렬(원래 의도 4가지 이행 여부·`inject-bootstrap --force` 부작용·goal 89 SessionStart 훅 실전검증 갭) + 직접 파일 재확인.

### 원래 의도 4가지 판정
완전 해결 0 / 부분 해결 2(도메인 커스터마이징·docs 스캐폴딩 — 트리거·발견성만 개선, 실행은 여전히 수동) / 미해결 2(헌법 자동반영 — 가시화만 함, 근본 동작 불변 · 스킬 능동발동 — goal 88~91 범위에 아예 없었음, Claude Code 런타임 영역이라 vhk 밖일 가능성).

### 이번 조사가 찾은 프로세스 결함 — 직전 "성과 보고"가 부정확했음
**goal 88·89가 실제로는 `status: NOT_STARTED`로 남아있었다**(90·91만 정상 `DONE`). `git show 4db5d31 -- goals/89-*.md`가 빈 diff — 구현 커밋이 goal 파일 자체를 안 건드림. 코드·테스트·커밋은 실재했으나 goal 메타데이터 갱신이 88·89 두 건에서 누락된 채 내가 사용자에게 "4개 전부 완료"라고 보고했음. 직접 재확인해서 발견 — 에이전트가 지적하기 전까지 나 스스로도 몰랐음.

특히 **goal 89는 자기 자신이 "필수"라고 명시한 Completion Check 항목("체감 검증 — 실제 임시 프로젝트에 vhk init 돌리고 Claude Code 열어서 SessionStart 넛지가 실제로 뜨는지 확인")을 한 번도 수행하지 않았다** — 이게 사용자가 물은 "실전 검증"의 정곡. 이 항목은 대화 세션 밖의 행동(실제 Claude Code 세션을 열어 육안 확인)이 필요해 나 혼자 완결할 수 없음 — 사람 손 필요 항목으로 남김.

### 추가 발견 — 실전 부작용 후보 2건 (goal 91 경고문구 보강)
1. `vhk inject-bootstrap --force`(goal 91이 헌법 갱신용으로 안내한 명령)가 `.agents/CORE-RULES.md` 하나가 아니라 **같은 `opts`를 공유하는 `.cursor/rules/ecosystem.mdc`까지 함께 덮어씀** — CORE-RULES.md와 달리 마커 밖 보존 로직이 없어 사용자가 손댄 내용이 있으면 통째로 사라짐. 이 사실이 레포 자신의 테스트(`tests/inject-bootstrap.test.ts:64-77`)로 실증됨(대안 `vhk sync`/`vhk init` 재실행은 전부 이보다 나빠서 안내 자체는 유지, 부작용 고지만 추가).
2. 경고 문구가 "YOHAN_BRAIN_ROOT 설정 후 명령 실행"만 안내하는데, 사용자 자신의 글로벌 CLAUDE.md 절대규칙("Windows env var 설정 후 VSCode 완전 재시작 필수")과 충돌 — 같은 세션에서 곧바로 실행하면 "시킨 대로 했는데 왜 안 되지" 루프에 빠질 위험.

### 변경 (수정 사항)
- `goals/88-init-docs-scaffold.md` — `NOT_STARTED`→`DONE`, Completion Check 5개 전부 실측 재확인 후 체크, 정정 사유 기록.
- `goals/89-customization-hook.md` — `NOT_STARTED`→`IN_PROGRESS`(DONE 아님 — 체감 검증 미이행을 정직하게 유지), Completion Check 6/7 실측 재확인 후 체크, 47행(체감 검증)만 미체크로 남김 + 정정 사유 기록.
- `scripts/check-goal-88.mjs` — 고유 검증 7개 채움(이전엔 스텁).
- `scripts/check-goal-91.mjs` — 고유 검증 3개 추가(새 캐비어트 2개 회귀 가드).
- `src/i18n/ko.ts` — `coreRulesBundledWarn`에 캐비어트 2개 추가(ecosystem.mdc 부작용 고지, Windows 재시작 안내).
- `tests/init-core-rules-warn.test.ts` — 캐비어트 회귀 가드 테스트 1개 추가.
- `goals/README.md` — 재생성(88 DONE·89 IN_PROGRESS 반영).

### 게이트
`pnpm build`·`pnpm exec tsc --noEmit`·`pnpm lint` clean. `pnpm test:run` 2186/2186 pass. `check-goal-88.mjs`(7개)·`check-goal-91.mjs`(14개) 고유 검증 전부 통과. `check-meta.mjs` M.4(완료 goal 비스텁 게이트) 통과.

### 교훈
- **"완료했다고 말하기 전에 goal 파일 자체를 다시 열어봐야 한다."** 이번 세션 내내 "critic이 코드 결함을 잡는다"는 패턴에 집중했는데, 정작 "내가 사람에게 한 보고 자체가 틀렸는지"는 별도 감사를 시켜서야 드러났다. 코드 구현 완료와 "완료를 선언하는 행위"(goal 파일 갱신·사람에게 보고) 사이엔 별도 검증이 필요하다 — 이번엔 90·91은 맞았고 88·89만 놓쳤는데, 그 차이가 뭐였는지는 불명확(단순 누락으로 추정) — 향후 "goal 마무리 체크리스트에 frontmatter status 갱신을 명시적 스텝으로 넣기"가 재발 방지책 후보.
- **자체 선언한 "필수" 체크리스트 항목이 실제로 이행됐는지는 문서만 봐서는 안 되고 각 항목을 코드/로그로 대조해야 한다** — goal 89 문서는 "완주"라고 서술했지만 자기 자신의 Completion Check 박스는 하나도 안 채워져 있었다. 서술형 요약과 체크리스트 상태가 어긋날 수 있다는 걸 이번에 실측으로 확인.
- **에이전트에게 위임한 조사가 위임자(나) 자신의 이전 주장을 반증하는 경우, 반사적으로 방어하지 말고 직접 재확인 후 정정해야 한다** — 이번엔 즉시 goal 89 파일을 직접 열어 대조했고, 에이전트 주장이 100% 정확함을 확인 후 바로 정정. "내가 방금 전에 다르게 말했다"는 이유로 새 증거를 무시하면 안 됨.

## 다음
goal 89 체감 검증(사람 손 필요) 대기 — 별도로 임시 프로젝트에서 `vhk init` 후 실제 Claude Code 세션을 열어 SessionStart 넛지 확인 필요. 확인되면 goal 89 Completion Check 47행 체크 + status `DONE` 전환. `inject-bootstrap --only core-rules` 스코프 플래그는 향후 goal 후보로만 기록(지금 미착수).

## 추가 — 도메인 커스터마이징 신뢰도 심화 조사 (같은 날, 후속) — 훅 산출물 실측 + 공식 사양 대조

사용자가 "도메인 커스터마이징 실제 신뢰도"를 더 파보자고 요청 — 임시 프로젝트에 실제로 `vhk init` 돌려서 산출물을 직접 검사 + `claude-code-guide` 에이전트로 Claude Code 공식 사양과 대조.

### 실측 1 — 훅 산출물 자체는 정확히 작동
스크래치 폴더에 `node dist/index.js init -y`로 실제 실행 → `.claude/settings.json`·`.vhk/hooks/customization-check.mjs` 생성 확인. 훅 스크립트를 직접 실행해 `hookSpecificOutput.additionalContext` JSON이 한 줄로 정확히 찍히는지, `customization-done` 마커 있을 때 무출력인지, exit code 0인지 전부 확인 — 스크립트 레벨은 결함 없음.

### 실측 2 — claude-code-guide 공식 사양 대조에서 실전 신뢰성 갭 2건 발견
1. **cwd 미보장**: 훅 command가 상대경로(`node .vhk/hooks/...`)였는데, Claude Code가 SessionStart 훅을 어떤 cwd로 spawn하는지 공식 문서에 명시가 없음. 문서가 명시적으로 권장하는 패턴(`${CLAUDE_PROJECT_DIR}` 또는 절대경로 사용, 예시: `"$CLAUDE_PROJECT_DIR"/.claude/hooks/...`)과 어긋남 — cwd가 프로젝트 루트가 아니면 "command not found"로 조용히 실패할 위험.
2. **matcher 파이프 OR 미확정**: `"startup|resume"` 조합이 SessionStart matcher에서도 유효한지 공식 문서 예시엔 전부 단일값(`"startup"`·`"compact"`)만 있어 확정 못 함 — 안 되면 트리거 자체가 조용히 안 뜨는 catastrophic 실패.
3. (부수 발견) 문서 예시가 변수를 따옴표로 감싸는 걸 보고 대조 중 발견: 경로 공백(Windows에서 흔함) 미보호.

### 변경 (전부 TDD, 트레이드오프 없는 강화)
- `src/commands/init.ts` — `CUSTOMIZATION_HOOK_CMD`를 `${CLAUDE_PROJECT_DIR}` 절대경로 + 큰따옴표로 교체. `SESSION_START_ENTRY`(단일 파이프 matcher) → `SESSION_START_ENTRIES`(startup/resume 단일값 2개 entry 배열)로 분리, 양쪽 호출처(`created`/`merged`) 갱신.
- `tests/init.test.ts` — 신규 회귀가드 3개(CLAUDE_PROJECT_DIR·따옴표·2-entry 분리), 기존 2개는 새 구조(entry 개수 변화)에 맞게 단언 갱신(동작 축소 아님, idempotent/보존 로직 그대로).
- `goals/89-customization-hook.md` — 보강 내역 기록, 체감 검증(47행)은 여전히 미이행으로 명시.

### 게이트
`pnpm build`·`pnpm exec tsc --noEmit`·`pnpm lint` clean. `pnpm test:run` 2189/2189 pass.

### 남은 것 — 사람 손 필요
문서 대조·산출물 실측 전부 끝났지만, **"실제 Claude Code 세션에서 진짜로 넛지가 뜨는가"는 여전히 증명 안 됨.** 이건 대화 세션 밖의 행동(실제 새 세션을 열어 육안 확인)이 필요해 이 세션에서 완결 불가 — goal 89의 47행 체감 검증 그대로 남음. 신뢰도는 "문서 사양과 어긋나는 부분은 다 고쳤다"까지 올라갔지 "실증됐다"까지는 아님.

### 교훈
- **"공식 문서와 대조"는 "실측"과 다른, 그러나 값어치 있는 별도 검증 축이다.** 이번엔 이 저장소 자신의 다른 훅 사례(PreToolUse/Stop)를 "이미 검증된 전례"로 근거 삼았던 원래 설계가, 사실은 다른 이벤트 타입이라 완전한 전례가 아니었다는 걸 공식 문서 대조로 알게 됐다. "같은 저장소에서 비슷한 패턴이 작동한다"는 것만으로 다른 이벤트 타입까지 안전하다고 넘겨짚으면 안 된다.
- **문서가 예시로 보여주는 정확한 패턴을 그대로 따르는 게 가장 안전하다** — 파이프 matcher・상대경로・따옴표 미사용 셋 다 "이럴 것 같다"는 합리적 추론이었지 문서에 명시된 패턴은 아니었다. 이번에 전부 문서에 실제로 나온 패턴으로 교체.
