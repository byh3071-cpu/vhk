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
