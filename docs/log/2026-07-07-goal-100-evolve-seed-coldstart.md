# 2026-07-07 — goal 100: cold-start 역채굴 `vhk evolve seed` 구현 (무인 야간 세션)

> 전날 [2026-07-06 브레인스토밍](2026-07-06-rsi-differentiation-brainstorm.md) 재개 → 플랜모드 →
> 사용자 승인("진행 ㄱㄱ") → 사용자 취침("켜놓고 자러갈테니 무인으로 알아서 작업해줘") →
> 이 세션은 그 뒤 무인 구현 전체(TDD·게이트·실측 e2e·적대리뷰·커밋·PR 준비)를 기록한다.
> append-only.

## 1. 재개 직후 — 브레인스토밍 결정 재검토 (Q3↔Q4 물리 충돌 발견)

전날 브레인스토밍 Q4에서 "진입점 = `scripts/mine-seed.mjs` 얇은 스크립트"로 정했는데, 코드
정찰 중 `scripts/_lib.mjs:84-85`에 "`.mjs`는 TS(번들 dist)를 import 못함"이 명시돼 있어
Q3(evolve.ts 함수 재사용)과 물리적으로 충돌함을 발견. 사용자에게 12살도 이해할 수준으로
설명 후 재확인 → **`vhk evolve seed` 서브커맨드로 전환**(등록 2곳만: index.ts + evolve leaf
배열, 4지점 세리머니 불필요 — `evolve negatives` 선례).

## 2. 설계 피벗 — "리포트만" → "연료넣기"

`src/commands/evolve.ts`의 `evolveSuggest()`를 직접 읽고 결정적 사실 확인:
`activePatterns.length===0` 이면 `📭 no patterns` 찍고 즉시 return — **`memory.patterns=0`이면
evolve 파이프라인이 시동조차 안 걸린다.** 원래 브레인스토밍 Q1(별도 리포트만, memory 미변경)으로
가면 이 문제를 못 고친다(승격 코드도 없어 막다른 산출물). 사용자에게 재설명 후 **A(연료넣기:
dry-run 기본 + `--write`로 실제 반영)**로 전환 승인받음.

## 3. 구현 (TDD)

- `src/lib/seed-mine.ts`(신규, 순수 함수) — `SeedCandidate`(= `pattern.ts`의 `RawCandidate`와
  구조적으로 동일, 캐스트 없이 `reconcilePatterns`에 직접 전달). `parsePatMarkdown`(PAT 신형
  frontmatter `해결` 필드 / 구형 본문 `## 해결` 섹션 분기) · `failureToSeed` · `tsToSeed` ·
  `renderSeedPreview`.
- `tests/seed-mine.test.ts` — RED(모듈 없음) 확인 후 GREEN.
- `src/commands/evolve.ts` — `evolveSeed(opts:{write?,json?})` 추가. dry-run은 `.vhk/seed-candidates.md`만 쓰고 memory 미변경. `--write`는 기존 `reconcilePatterns`+`writeMemory` 재사용(새 상태쓰기 코드 0).
- `src/index.ts`/`command-registry.ts`/`ko.ts`/`.vhk/.gitignore`/`COMMANDS.md` 배선.
- `goals/100-evolve-seed-coldstart.md` + `scripts/check-goal-100.mjs`(고유 게이트).

## 4. 정규식 버그 발견·수정 (구현 중 자체 발견, critic 이전)

`extractSection()`의 종료 앵커로 `(?=\n##\s|$)`를 썼는데, **멀티라인(`m`) 플래그에서 `$`가
모든 줄 끝에도 매칭**돼(문자열 끝만이 아님) 섹션이 코드펜스 첫 줄 직후 등에서 잘못 잘리는 걸
실측(`auth-npm-scoped-publish-404.md` 프리뷰에서 summary가 패턴명으로 폴백되는 것 발견 → 원인
추적). `(?![\s\S])`(진짜 문자열 끝)로 교체해 해결. 회귀 테스트 추가.

## 5. 실측 e2e (이 레포 실 `.vhk/memory.json` 기준 — gitignored, 로컬 전용)

1. `evolve seed`(dry-run): PAT 19 · failures 18 · TS 5 = 42후보. `.vhk/seed-candidates.md` 생성,
   `memory.patterns` 불변(0) 확인.
2. `evolve seed --write`: patterns 0→42(추가 42·갱신 0), 태그 `seed:pat`19/`seed:failure`18/`seed:ts`5.
3. `evolve suggest`: **이전엔 `📭 no patterns`였는데 큐 pending 42건 생성** — 파이프라인 최초 점화.
4. `--write` 재실행: 추가 0·갱신 42(멱등 확인).
5. `suggest` 재실행: "모든 패턴이 이미 제안됐거나 reject됐습니다"(중복 큐 생성 없음).

## 6. 적대리뷰(critic 서브에이전트) — 통과, 중간 결함 1건 수정

판정: 통과(치명 0·높음 0·중간 1·낮음 6). critic이 20개 PAT 파일 전량·failures 18건 전량에
`parsePatMarkdown`/`failureToSeed`를 직접 실행해 실증 검증함.

- **🟠 M1(수정함)**: PAT을 일괄 `kind:'reinforce'`로 씨딩하면, "버그·함정"을 이름 붙인 PAT
  문서(예: `git-diff-since-no-op.md` = "`--since`를 쓰면 무시되어 통계가 0")가 `buildDraft`의
  reinforce 템플릿("이 접근 계속 권장")과 만나 **"버그를 계속 쓰라"는 뒤집힌 문장**이 됨.
  → `parsePatMarkdown`의 kind를 `'avoid'`로 변경(방향 불문 안전한 "사전 점검 필수" 프레이밍).
  테스트 갱신 + 실측 재확인(`--since` 사례가 이제 "사전 점검 필수 (근거: ..., 날짜를 커밋 SHA로
  먼저 변환)"로 올바르게 출력됨).
- **🟡 L1(수정함)**: `firstParagraph`가 `### 하위헤딩` 줄을 프로즈로 오인(실물 2파일). 헤딩 줄도
  skip하도록 수정 + 회귀 테스트 추가.
- L2~L6은 기존 `evolveNegatives()`와 동일 특성을 상속하거나(신규 결함 아님), MVP 휴리스틱의
  알려진 한계(코드펜스 이후 첫 프로즈가 항상 "핵심 해결책"은 아닐 수 있음)로 의식적으로 보류.
- M1/L1 수정 후 로컬 `.vhk/memory.json`을 세션 시작 전 백업(스크래치패드)으로 복원 →
  수정된 코드로 e2e 전체 재실행(§5 수치는 재실행 결과 — 최종 확정치).

## 7. 최종 게이트

`pnpm build`/`pnpm test:run`(2342 pass)/`pnpm lint`/`tsc --noEmit` 전부 green.
`node scripts/check-goal-100.mjs`(딥 게이트 포함) 전부 ✓. goal 100 status → DONE.

## 8. 안 한 것 (의도적)

- til 소스 채굴(구조적 avoid/reinforce 신호 0 — 다음 이터레이션).
- `git push origin`/PR 생성 여부는 이 로그 이후 판단(아래 next-task.md 참조).
- npm publish(2FA, 사람만) — 애초에 무관.
- `scripts/spike-g3-process-wrap.mjs`(이 세션 이전부터 존재하던 미커밋 파일, 무관 — 손대지 않음).

## 9. 다음 (사용자 리뷰 필요)

- PR 리뷰 → 머지 판단.
- 머지되면 `.vhk/memory.json`이 실제로 42개 avoid 패턴을 갖게 됨(로컬·gitignored, PR엔 안 잡힘) —
  다른 머신에서 evolve 파이프라인 켜려면 각 머신에서 `vhk evolve seed --write` 재실행 필요.
- 후속 후보: #2 되먹임 팔(evolve-log 기각사유 → generateCandidates 반영), til 소스 확장.
