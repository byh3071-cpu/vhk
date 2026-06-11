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

## 통합 — /code-review high (7앵글) 발견·수정

리뷰 7앵글(라인스캔·제거동작·크로스파일·재사용·단순화·효율·고도)이 실행 재현 포함
후보 ~30건 보고. 수정 반영분:

- **[중대] events/ gitignore 철회**: T4 에서 .vhk/.gitignore 에 events/ 추가한 것이
  goal 55 설계 불변식("ai-actions.jsonl 은 어디서도 제외하지 않는다 — 레포 영속",
  action-ledger.ts:9) 위반이었음. "untracked 방치"는 내 오판 — 줄 제거 + 원장 git add
  + spec/README 표를 ✅ 커밋으로 정정. goal 45 ledger.jsonl 도 spec 표에 등록(같은 누락).
- **check-records 오차단/우회 5종 픽스**(전부 회귀 테스트 고정):
  ① add 감지 regex 가 커밋 메시지 속 "add" 단어에 오매칭 → commit 과 동일 토크나이저로.
  ② 한글 devlog 파일명이 core.quotepath octal 이스케이프로 미인식 → quotepath=false + 언쿼트.
  ③ 자정 넘긴 연속 세션의 전날 devlog append 차단(이 세션이 실사례) → staged 한정 어제 허용.
  ④ PS 권장 체인 `if ($?) { git commit }`·서브셸 미감지 → 래퍼 토큰 스킵.
  ⑤ 손상 hook 페이로드가 단독모드 폴백 → 전 명령 차단 위험 → fail-open.
  + `git -C <path>` 추출해 대상 레포 기준 평가.
- **CODE_GLOBS 확대**: src/commands·lib 한정 → src/** + scripts/check-*.(mjs|sh).
  근거 = 이 PR 자신이 글롭 밖 src 파일(src/templates) 변경(리뷰 적발) + 미커버 커밋은
  차단 로그를 안 남겨 확대 신호가 수집 안 되는 구조. RULES.md 집행 줄도 갱신(sync).
- **_lib.mjs 공유 승격**: isMainModule(8.3 단축경로 realpath 방어)·porcelainPath·
  unquoteGitPath·parseFlatFrontmatter — 게이트 6종이 import (파서 2벌·porcelain 2벌·
  isMain 6벌 복제 제거).
- **HARD_STOP 보장 이행**: .vhk/README "check-*.mjs 는 HARD_STOP 검사" 문구 대비 신규
  게이트 미검사였음 → check-records(커밋 차단 exit 2)·record-reminder(침묵)·
  rules-sync/commands-doc/goal-frontmatter(ensureNoHardStop) 전부 반영.
- **record-reminder**: Stop hook plain stdout 은 아무에게도 안 보임 → systemMessage JSON.
  devlog 존재 선검사(세션 중반 매 턴 git 스캔 생략) + pathspec(src·scripts) 한정.
- **check-goal-frontmatter**: title 필수→권장 완화(제품 스키마 SoT goal.ts VHK-021 표와
  일치 — 게이트가 제품보다 엄격한 별도 스키마 금지).
- **check-commands-doc**: lookbehind regex → 토큰 Set. v0 한계(파일명≠registry SoT,
  recall·blocker 등 동명 파일 없는 명령 미검사) 헤더 주석 명문화 — --strict 승격 전
  registry 기반 재구현 후속.
- **ADR-001 정정**: pre-commit 기각 근거 중 "stderr 모델 전달" 은 hook 만의 장점 아님
  (pre-commit 도 동일) 정정 + 우회 경로 3종(vhk save/MCP·worktree cd·외부 에이전트)
  명시, L2 pre-commit 재검토 트리거 문서화.
- spec.md: config.json 생성 주체 정정(vhk mode lazy), 생성 프로젝트 폴더 무시 갭(후속,
  RFC 0038 이관) 명시.

미수정(후속 기록): check-rules-sync 가 CLAUDE.md 1타겟만 가드(8타겟 전체는
`vhk sync --check` 내장이 맞는 고도 — 후속 goal 후보) · goal 템플릿 created 필드(제품
변경이라 별도 PR) · PreToolUse 의 호출당 node spawn 비용(설계 수용, ADR-001 결과 명시).

## 통합 — Workflow 적대검증 (4차원 × 파인더 + 발견당 3 skeptic, 40 에이전트)

발견 23 → 12 검증 → **12 전원 확정**(기각 0 — skeptic 들이 전부 직접 재현). 수정:

- **[치명] D4-1 — 셔뱅+CRLF 로 Windows CI 전멸**: autocrlf=true 체크아웃에서 셔뱅 있는
  scripts/*.mjs 를 import 하는 신규 테스트 6파일 전부 `SyntaxError: Invalid or unexpected
  token` 수집 실패(skeptic 3명이 clone 실측 재현 — push 했으면 windows×node22/24 즉사).
  레포에 .gitattributes 가 없었음 → 신설(`*.mjs`·`*.sh` eol=lf). 로컬 게이트는 LF
  체크아웃이라 못 잡는 부류 — 적대검증이 아니면 머지 후 발견됐을 결함.
- **D1-1 — 토크나이저 우회 8종**: env 할당 접두(GIT_X=1 git commit)·명령 래퍼(command/
  exec/time/env/nohup/sudo/cmd)·git.exe·풀경로 전부 미감지였음 → 래퍼/할당 토큰 스킵 +
  git 토큰 basename 매칭.
- **D1-2 — `-C "공백 경로"` 토큰 분할로 미감지** → 따옴표 보존 토큰화.
- **D1-3 — 줄연속(`\`·백틱+개행)으로 git/commit 분리 미감지** → 접기 전처리.
- **D1-4 — pathspec add 체인 오차단**: `git add docs/x.md; git commit` 인데 무관한 더티
  src 까지 합산 → add 인자의 pathspec 범위만 합산(-A/--all/'.'/무인자는 종전대로 전량).
  차단 메시지 'staged' 오표기도 '커밋 범위(staged 또는 add 예정)'로 정정.
- **D2-2/D2-3 — 따옴표 frontmatter 값 분기**: 게이트 파서가 `status: "DONE"` 을 비표준
  FAIL, 인덱스가 `id: "9"` 를 누락 — 제품 파서(parseSimpleYaml)처럼 따옴표 제거(_lib 단일 수정).
- **D3-1/D3-2 — 문서 자기모순 잔존**: spec 변경 이력 줄의 events/ 로컬 표기, ADR-001
  Decision 절의 구 글롭·'오늘자' 표현 → 코드 실물로 갱신.
- **D3-3 — spec 누락 파일 2차**: cost.jsonl(goal 56)·evolve/(goal 58) 표·gitignore 등록.
  daily-shown.json 은 ~/.vhk(홈 — spec 범위 밖) 명시. ledger 류와 달리 cost 는 개인 비용
  데이터라 로컬 전용.
- D2-1(rules-sync 역방향 무탐지)·D2-4(commands-doc 토큰 매칭 거짓양/음성)는 v0 한계로
  스크립트 헤더에 명문화 — vhk sync --check / registry 기반 재구현 후속.

### 교훈

- 적대검증의 가치 = **로컬에서 절대 안 깨지는 결함**(CRLF 체크아웃·우회 변형)을 잡는 것.
  코드리뷰 7앵글이 못 본 D4-1 을 skeptic 의 "다른 환경 clone 실측"이 잡았다.
- 명령 문자열 파싱 게이트는 변형 공간이 넓다 — 우회 8종이 한 번에 나옴. 깊은 지점
  (pre-commit L2·vhk git-session chokepoint)으로의 이전 트리거를 ADR-001 에 박아둔 것이
  옳았음을 재확인.
- 추가 라이브 발견: 비-TTY 인데 stdin 이 안 닫힌 환경(셸 래퍼·파이프라인)에서 standalone
  check-records 가 readFileSync(0) 무한 블록 — 검증 명령 자체가 행으로 재현. stdin 읽기를
  `--hook` 플래그 모드로 한정(settings.json 이 --hook 전달, hook 페이로드 후 stdin 닫힘이라
  안전)해 해소.
