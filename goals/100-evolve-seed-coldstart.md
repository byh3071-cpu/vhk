---
vhk_format: 1
type: goal
id: 100
title: cold-start 역채굴 — vhk evolve seed(PAT·failures·TS → memory.patterns) — P1
status: DONE
priority: P1
created: 2026-07-07
completed: 2026-07-07
leads_to: memory.patterns 가 채워지면 evolve suggest→apply 파이프라인이 최초로 시동된다.
  후속은 #2 되먹임 팔(evolve-log 기각사유 → generateCandidates 반영)과 til 소스 확장(--source).
---

# Goal 100: cold-start 역채굴 (`vhk evolve seed`)

> 출처: 2026-07-06 RSI 가능성 진단 → 차별축(agent-agnostic 감사+거버넌스층) 브레인스토밍.
> 상세: `docs/log/2026-07-06-rsi-differentiation-brainstorm.md`,
> 기억 `vhk-differentiation-audit-layer`(자동로드).

## 근거

- **실측 진단**: `memory.patterns` 가 0건이면 `evolveSuggest`(evolve.ts)가
  `activePatterns.length===0` 에서 `📭 no patterns` 를 찍고 즉시 return 한다 — evolve 파이프라인
  (patterns → suggest → 큐 pending → apply 게이트 → RULES.md) 전체가 시동조차 안 걸린다. 이게
  거버넌스 메타루프가 지금껏 0건이던 진짜 원인이다.
- **설계 피벗**: 최초 브레인스토밍(Q1-A)은 결과를 `.vhk/seed-candidates.md` 리포트로만 뽑고
  memory 는 안 건드리는 안이었으나, 그러면 위 파이프라인이 여전히 죽어 있어 목표(메타루프
  시동)를 못 이룬다 — 승격(리포트→memory) 코드도 미존재라 막다른 산출물이 됨. 코드 정찰
  (`reconcilePatterns` 가 이미 순수·테스트됨을 확인) 후 **"연료넣기"로 전환**: dry-run 미리보기
  기본 + `--write` 로 `reconcilePatterns` 재사용해 실제 반영.
- **헌법 부합**: 채굴은 결정적 파싱(frontmatter/구조, LLM 0). `--write` 가 만드는 것도 데이터일
  뿐 RULES.md 자체는 안 건드림 — 하류 `evolve apply` 가 여전히 사람 게이트. PAT-003(LLM 결정경로
  배제) 위반 아님.
- **재사용 극대화**: 새 상태쓰기 코드 0(`reconcilePatterns` 그대로), 새 검수 UX 0(기존
  `evolve apply/reject` 큐 게이트 그대로), TS 제목 추출도 기존 `extractTsTitle` 재사용.

## 동작

신규 서브커맨드 `vhk evolve seed` (`vhk evolve negatives` 의 자매 — 상위집합):

- **dry-run(기본)**: PAT(`docs/patterns/*.md`)·failures(`.vhk/memory.json`)·TS
  (`docs/troubleshooting/TS-*.md`) 를 결정적으로 채굴 → `.vhk/seed-candidates.md` 미리보기.
  `memory.patterns` 미변경.
- **`--write`**: 같은 채굴 결과를 `reconcilePatterns(mem.patterns, candidates, now)` 로 병합 →
  `writeMemory`. 멱등(같은 signal 재발견 시 갱신만, 중복 추가 없음) — `reconcilePatterns` 의
  기존 dismiss 존중·`_sig` dedup 계약을 그대로 상속.
- til 소스는 **범위 밖**(avoid/reinforce 구조신호 0 — 다음 이터레이션 `--source til`).

파일:

- `src/lib/seed-mine.ts`(신규) — 순수 함수. `SeedCandidate`(= `pattern.ts` 의 `RawCandidate` 와
  구조적으로 동일 — 캐스트 없이 `reconcilePatterns` 에 직접 전달 가능). `parsePatMarkdown`(신형
  frontmatter `해결` 필드 / 구형 본문 `## 해결` 섹션 분기, **kind=avoid 고정** — 적대리뷰 M1: PAT
  패턴명은 저자마다 "모범사례"/"버그·함정" 프레이밍이 갈려 reinforce("계속 권장")로 씨딩하면 버그
  설명을 계속하라는 뒤집힌 문장이 나올 수 있어, 방향 불문 안전한 avoid 프레이밍을 기본값으로 함)
  · `failureToSeed`(lesson→content→id 폴백 체인) · `tsToSeed` · `renderSeedPreview`. lib 전용
  의존(commands 미import, 순환 방지).
- `src/commands/evolve.ts` — `evolveSeed(opts:{write?,json?})` 추가·export. PAT/TS 디렉터리
  스캔은 `evolveNegatives()` 와 동일 관례(개별 파일 best-effort try/catch). `--write` 경로는
  `loadForMutation`(패턴감지와 동일 손상-시-중단 계약) + `reconcilePatterns` + `writeMemory`.
- `src/index.ts` — `evolveCmd.command('seed')`(`--write`/`--json` 옵션, 한글 별칭 `씨앗`).
- `src/lib/command-registry.ts` — `evolve` leaf 배열에 `'seed'` 추가(registry-drift 테스트
  강제 대상).
- `src/i18n/ko.ts` — `evolve.seedPreviewTitle`/`evolve.seedWriteTitle`.
- `.vhk/.gitignore` — `seed-candidates.md` 추가(자매 `negative-candidates.md` 와 대칭 — 둘 다
  로컬 전용 미리보기).
- `tests/seed-mine.test.ts`(신규) — PAT 신형/구형 파싱, 비-PAT 파일 graceful skip, failures
  폴백 체인 3종, TS 변환, 프리뷰 렌더(빈 입력·결정성).
- `nlp-router.ts`/MCP 등록은 **생략** — 에이전트향 governance 명령(goal 99 blocker/watch 선례).

## Completion Check

- [x] `src/lib/seed-mine.ts`(신규) — `SeedCandidate` + `parsePatMarkdown`/`failureToSeed`/
      `tsToSeed`/`renderSeedPreview` export.
- [x] TDD: `tests/seed-mine.test.ts` — RED(모듈 없음) 확인 후 GREEN(14개 통과, 적대리뷰 M1/L1
      회귀 2건 포함).
- [x] `evolve.ts` 의 `evolveSeed()` — dry-run(파일 쓰기, memory 미변경)과 `--write`
      (`reconcilePatterns`+`writeMemory`, 손상 시 중단) 분기.
- [x] `index.ts`/`command-registry.ts` 등록 — registry-drift 테스트(`tests/drift.test.ts`) green.
- [x] `ko.ts` 메시지 + `.vhk/.gitignore` 대칭 추가.
- [x] 공통 게이트(typecheck·lint·test·build) + `check-goal-100.mjs`(고유 검증) 전부 green.
- [x] e2e 머니샷(실측, 이 레포 실 `.vhk/memory.json` 기준): `evolve seed`(dry-run, 42후보·
      patterns 0 불변 확인) → `evolve seed --write`(추가 42·patterns 42건 확인) → `evolve suggest`
      (이전 `📭 no patterns` → 큐 pending 42건 생성 전환 확인 — 파이프라인 최초 시동) → `--write`
      재실행(멱등 — 추가 0·갱신 42 확인) → `suggest` 재실행(중복 큐 생성 없음 확인).
- [x] `COMMANDS.md` 카탈로그에 `vhk evolve seed` 행 추가.

## Forbidden Actions (OUT)

- til 소스 채굴 금지 — 구조적 avoid/reinforce 신호가 없는 소스를 MVP 에 억지로 끼워 넣지 않는다
  (다음 이터레이션 `--source til` opt-in).
- LLM/휴리스틱 기반 채굴 금지 — frontmatter·구조 파싱만(헌법 PAT-003, 결정경로에서 LLM 배제).
- `evolveNegatives()`(기존 GA 기능)의 동작·출력 변경 금지 — 별개 자매 커맨드로만 확장.
- `reconcilePatterns`/`generateCandidates`/`buildDraft` 등 기존 순수 함수의 시그니처·동작
  변경 금지 — seed 는 소비자일 뿐, 재사용 대상을 리팩터하지 않는다.
- npm publish·main 직접 push 금지(해당 세션 무관 항목이나 명시 — 사람·2FA·PR 경유 원칙 불변).

## Mandatory Reading

`src/commands/evolve.ts`(`evolveNegatives`/`evolveSuggest` 원본 — 스캔 관례·📭 조기 return 지점) ·
`src/commands/pattern.ts`(`reconcilePatterns`/`RawCandidate`/`PatternEntryV19` 원본) ·
`src/lib/seed-mine.ts`(신규 전량) · `src/lib/goal-frontmatter.ts`(`parseFrontmatter` 재사용) ·
`docs/log/2026-07-06-rsi-differentiation-brainstorm.md`(설계 배경·Q1~Q4 결정)
