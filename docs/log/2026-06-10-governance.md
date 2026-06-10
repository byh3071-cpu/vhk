# 2026-06-10 — governance 무인 배치 (feat/governance-v2)

> 스펙: docs/superpowers/specs/2026-06-10-governance-{v2,t3,t4,t5}-design.md
> append-only — 테마별 섹션 추가만.

## 사전 작업 — #253 겹침 확인 + rebase

- PR #253(RFC 0051, doc-capture-wiring)이 이미 main 머지됨(cbe80c9) → 겹침 정독.
  판정: T1 차단 게이트(check-records)와 #253 자문 보고는 비겹침·보완 관계.
  TS-NNN 통일은 #253이 완료 → governance 스코프에서 무관(원래 T3 스펙에 없음).
  조정: record-reminder의 ADR 넛지는 중복 감지 없이 RFC 0051 참조로 축소.
- feat/governance-v2를 1da0f4d → cbe80c9(origin/main)로 rebase (RULES.md 충돌 예방).
- 베이스라인 게이트: build·tsc·test:run 1525 pass 확인 후 시작.

## T1 — 기록 집행 엔진 (Claude Code hook 하이브리드)

- `scripts/check-records.mjs` (TDD 14 tests): PreToolUse(Bash|PowerShell)에서 `git commit`
  감지 → staged 실질 코드변경(src/commands·src/lib·scripts/check-goal-*) 있는데 오늘자
  dev log 미스테이지 & `[skip-record]` 없으면 exit 2 차단. fail-open(게이트 버그는 통과).
- `scripts/record-reminder.mjs` (5 tests): Stop hook 자문 — 미커밋 코드변경 + 오늘 dev log
  부재 시 안내만(항상 exit 0). ADR/TS 후보 감지는 RFC 0051(handoff) 참조로 위임.
- `.claude/settings.json` 신규(레포 공유 — git 추적, ignore 안 됨 확인).
- RULES.md §기록 규칙에 기록 경로 판단표 + 집행 한 줄 추가 → `vhk sync` 8타겟 전파
  (CLAUDE.md는 vhk:rules 마커 블록 안만 변경 — 영구구역 무사 확인).

### 결정 (스펙 체크포인트 확정)

- 차단 exit code = **2** (스펙 초안 1에서 수정): Claude Code PreToolUse는 exit 2만 차단으로
  해석. exit 1은 비차단 경고라 집행이 안 됨. → ADR-0001에 전체 결정 기록.
- 코드변경 글롭 = 스펙 보수기본값 유지(src/commands·src/lib·scripts/check-goal-*).
  src/mcp·utils 등 확대는 운영 후 판단(과안정화 경계).
- `git add …; git commit` 체인은 hook 시점에 add 미실행 → working tree(-uall) 합산 선반영.

### 교훈

- porcelain 파싱: `git status --porcelain`은 untracked 디렉토리를 `?? src/`로 접음 →
  파일 단위 글롭 매칭엔 `-uall` 필수. 또 라인 trim하면 XY+공백 고정 오프셋(slice 3)이
  깨짐(` M x` → `M x`) — porcelain은 비-trim 파싱.

## T2 — 문서 탐색 인덱스

- `scripts/gen-goals-index.mjs` (6 tests) + `goals/README.md` 자동 생성 — 62 goal
  한국어 제목·상태·우선순위·leads_to 표 (수동편집 금지 마커).
- `docs/README.md` 대시보드(9 카테고리 맵 + 읽는 순서 + 루트문서) +
  카테고리 README 7개(adr·rfc·log·troubleshooting·patterns·superpowers·state).
- `docs/adr/ADR-0001-record-enforcement-hook.md` — 첫 실제 ADR(이 거버넌스 결정 자체).
  ADR 0건 박제 해소.

## T3 — 규칙파일 강화

- RULES.md 코딩 규칙에 주석 규칙(why 블록주석/자명 금지/JSDoc 지양/#이슈 참조) +
  신규 명령 체크리스트(4지점+COMMANDS.md·README) 추가 → vhk sync 8타겟 전파.
- Forbidden 통합: `## VHK 운영 — Forbidden (전역 금지)` 신규 섹션(기존 'VHK 운영' 키로
  CLAUDE.md/AGENTS.md record 그룹에 매핑 — sync.ts 키 변경 없음). goals/_meta.md
  Forbidden Actions 는 포인터로 교체(내용 단언 게이트는 goal-28 testmap 뿐 — 안전 확인).
- `scripts/check-rules-sync.mjs` (8 tests): CLAUDE.md vhk:rules 블록 ⊆ RULES.md 내용 대조 —
  drift 면 FAIL "vhk sync 필요". 마커 없는 레포(pre-migration)는 비적용 통과.
- `scripts/check-commands-doc.mjs` (5 tests): src/commands/*.ts ↔ COMMANDS.md 단어경계 대조.
  **실측 미문서 32/49건** → goal 51 선례대로 v0=리포트 전용, `--strict` 승격은 부채 정리 후.

### 결정

- 'Forbidden' 을 VHK_MANAGED_KEYS 에 새 키로 추가하지 않음 — stripLegacyAutogen 폴백이
  마커 훼손 시 헌법 영구구역 `## Forbidden` 을 옛 자동생성으로 오인·삭제할 footgun.
  기존 'VHK 운영' 키 substring 매칭으로 해결(코드 무변경).
- 헌법 영구구역 Forbidden 은 포인터 교체도 안 함(영구구역 불가침 > 통합 완전성) —
  의례 수준 금지는 헌법, 코드/운영 수준 금지는 RULES.md 로 역할 분리 명시.
- check-meta 편입(M.5)은 보류 — 게이트 자체는 독립 실행 가능, 편입은 PR 리뷰 후 결정.

### 부채 (후속 goal 후보)

- COMMANDS.md 미등장 명령 32건(audit·cloud·deploy·design·diff·diff-cover·evolve·gate·
  harness·help·mcp-init·memory-eval·mode·pattern·recap·ref·restore·save·secure·ship·
  standup·start·stats·status·testmap·theme·today·undo·update·verify·verify-report·work) —
  문서화 후 check-commands-doc --strict 승격.

## T4 — 구조 정합성 (자정 넘김 — 실작업 2026-06-11 새벽, 세션 연속이라 본 파일에 append)

- `scripts/check-goal-frontmatter.mjs` (8 tests): 필수(type:goal·숫자 id·title·status enum)
  FAIL / 권장(priority·created·DONE의 completed)·version 형식 경고. **사전 실측**: 62 goal
  전부 필수 충족(필수 하드화 안전), 권장 누락 31건(created 27·completed 5)·version 은
  v1.1(2파트)·v2.4.1(3파트) 혼용 → 둘 다 허용. 일괄 마이그레이션 안 함(spec 준수).
- `.vhk` ↔ spec 정합: 충돌 실측 결과 **제품 기본값(init 템플릿)은 자기일관**(README ✅ +
  템플릿 .gitignore 는 context/brief 무시 안 함) — 모순은 vhk 레포 자신의 로컬
  .vhk/.gitignore 오버라이드 vs spec 사이에만 있었음. 결정 = **기본 커밋 유지 + 프로젝트별
  로컬 무시 오버라이드를 spec 이 공식 인정**(제품 동작 무변경·보수 — 처음 "로컬 전용
  공식화"로 썼다가 템플릿 실측 후 정정). cloud.json 은 템플릿도 무시라 로컬 전용으로 정정
  (VHK-022). spec.md **v1.1** 범프 — RFC 0038(spec_version_target 1.1)의 미실행 체크리스트
  실행에 해당: 하위 폴더 공식 인정(backups/events/eval/reports/seo) + 누락 파일 표 등록
  (config.json·mission.json·recall-log.jsonl·prompt 파일·.synced) + 변경 이력 섹션.
- spec 1.0 핀 테스트(init.test.ts "spec_version 1.0") FAIL → 1.1 + 가산분 단언으로 갱신.
  src 주석/템플릿 문자열의 1.0 참조 3곳도 1.1 로(스펙 체크포인트 "버전범프 테스트 영향"
  실물 — version-sync 아닌 init.test 였음).
- `.vhk/.gitignore` += `events/` — goal 55 원장(ai-actions.jsonl)이 untracked 방치돼 있었음
  (이번 sync 실행에서 발견). check-ignore 검증: events/context/brief=ignored ·
  README/config=tracked 정책 일치 확인.
- next-task.md 상단에 덮어쓰기 경고 추가(스펙은 "이미 있음 강화"였으나 실측 부재 → 신설).
- PRD.md: __FILL__ 템플릿을 실내용으로 채움(참조 다수 — src 16곳이 PRD 경로 참조라 이동
  대신 채움 선택).
- learnings↔memory 이원: learnings.md 파일 자체가 부재(이미 v2 흡수 완료) + spec §2.1·
  CLAUDE.md 기록 규칙에 동결 명시 이미 있음 → no-op.

## T5 — 과거 선별 백필 (LOW·선택 — 실행함)

- 사실 수집은 Explore 서브에이전트(CHANGELOG·git 태그·src/mcp 실측) 후 직접 작성.
- **ADR-0001 → ADR-001 개명**: src/lib/adr.ts 자동 채번이 3자리(padStart 3) — 내가 만든
  4자리가 기계 형식과 모순(TS-NNN 통일과 같은 병). 머지 전 브랜치 내 정정. T1 섹션의
  "ADR-0001" 표기는 과거 기록이라 보존(append-only).
- 백필 ADR 3건(전부 "재구성·일부 추정" 명시): ADR-002 MCP stdio 아키텍처(v0.6.0) ·
  ADR-003 design/theme/ref(v0.8.0) · ADR-004 memory v2 breaking + breaking 템플릿 겸용
  (발행은 2.0.1 — 2.0.0 미발행 사실 반영).
- `docs/mcp-evolution.md`: 8→10→16→24→25→27→29 진화 표 + 29 tools 카탈로그.
  v1.0.2→v1.3.0 태그 갭 구간은 '추정' 표기(goal 0 Phase 기준).
- 초기 회고 5건(docs/log/2026-06-11-retro-*.md): v0.x 기초 / v0.6~1.0 MCP→GA /
  v1.3~1.9 goal·증거 / v2.0~2.3 memory·진화 / v2.4~2.5 세션 자동화.
  손실 구간(v0.3 부재·v1.1/1.2 태그 갭·v2.2 빈 범프) 정직 표기.
