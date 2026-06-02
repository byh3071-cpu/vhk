# Changelog

VHK 변경 이력. [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식, [Semantic Versioning](https://semver.org/lang/ko/).

## [Unreleased]

(다음 릴리즈 누적 영역)

## [1.9.0] - 2026-06-03

> **vhk mission — Mission Contract v0 (Goal 17, Trust Loop 배치 7).** 작업의 목표·허용/금지 범위를
> 계약으로 선언하고 변경이 계약 안인지 검증하는 scope/intent 층 (mission → verify → review).

### Added

- **`vhk mission`** (`src/commands/mission.ts`) — `.vhk/mission.json` 계약(objective·scope·forbidden glob).
  - `set`(선언/갱신, 비대화형 가드) · 기본(현재 계약 표시) · `check`(변경 ↔ glob 교차검증) · `clear`(삭제).
  - `check`: working tree + staged 변경(`simple-git status`)을 scope/forbidden glob 과 대조 —
    **forbidden 매칭 = 위반(exit 1)**, scope 밖 = 경고. `checkMission`/`globToRegExp` 순수 함수.
  - `검토`/자연어(`미션 계약`/`작업 범위`) 라우팅. R1 command-registry 단일소스 등록.

### Note (v0 정직성)

- **경로 glob 기준** — objective 의미 부합은 검증하지 않음(disclaimer 명시, 신뢰도 신호·보장 아님).
- glob **자체 구현(외부 의존 0)**. `.vhk/mission.json` **별도 네임스페이스** — latest.json(verify 증거) 불변.
  secret 미포함(경로·objective 텍스트만). forbidden 액션 금지·strict 하드블록·의미 검증은 후속.
- 테스트 671 pass(신규 15, 회귀 0).

## [1.8.1] - 2026-06-02

> **vhk sync 확대 — Gemini CLI + Cline (Goal 16, 포터빌리티 STEP 1.5 잔여).** RULES.md 단일소스 →
> sync 대상 5종 → 7종. 도구를 바꿔도 규칙이 따라가는 포터빌리티 강화.

### Added

- **`vhk sync` 대상 +2종** (`src/commands/sync.ts`) — Gemini CLI `GEMINI.md`(공식 컨텍스트 파일) +
  Cline `.clinerules/vhk-rules.md`(공식 docs.cline.bot — `.clinerules/` 디렉터리 다중 규칙). 둘 다 Markdown 무제한 → `buildCodingDoc` 재사용(절삭 없음).
  `SYNC_TARGETS` 레지스트리 2 엔트리 추가 = drift 감지·백업·`.synced`·`--dry-run`·비대화형 가드 **자동 반영**
  (추가 배선 0). `ko.sync.geminiDone`/`clineDone` 메시지.

### Note

- **Zed 제외** — Zed 는 이미 `AGENTS.md`·`CLAUDE.md`·`.cursorrules` 를 읽으므로(공식 docs) 기존 sync 로 커버, 중복.
  공식 경로 근거 없는 도구는 추가하지 않는다. 테스트 656 pass(신규 4, 회귀 0). SYNC_TARGETS 7종 회귀 가드.

## [1.8.0] - 2026-06-02

> **vhk review — 적대적 자기검증 v0 (Goal 15, Trust Loop 배치 5).** verify(Goal 13)가 모은 증거(latest.json)를
> 그대로 믿지 않고, goal 의 Completion Check 와 교차검증해 "거짓완료"를 적극적으로 찾는 반대 심문 층.
> 철학: 증거를 의심 + 새 증거 안 만듦(렌더·심문만) + 판정은 보장이 아니라 신뢰도("보장 아님" 표기 필수).

### Added

- **`vhk review`** (`src/commands/review.ts`) — `.vhk/reports/latest.json` + 대상 goal 의 Completion Check 를
  교차검증. 완료조건 ↔ 게이트 증거 매핑으로 거짓완료 의심(체크됨인데 게이트 fail/skip/부재, status DONE 인데
  verify FAIL) + 미검증(unmapped) + 신뢰도(low/medium/high) 판정. 판정을 latest.json 의 `review` 섹션으로
  병합(SoT 유지, 새 증거 안 만듦). `--id N` 또는 active goal. `검토` 별칭 + 자연어 라우팅.

### Note (자기모순 방지 — 거짓 안심 금지)

- **신뢰도 상한 규칙**: confidence high 는 (의심 0 **AND 미검증 0** AND coverage ≥ 0.5 AND 증거 신선) 일 때만.
  unmapped 가 하나라도 있거나 stale(>6h)·신선도 미확인이면 medium 으로 캡 — 증거 없음 ≠ 통과.
- **exit 정책**: exit 0 은 (vacuous | cleanHigh) 뿐. medium·low·병합 실패 → exit 1 + `goal done` 안내 금지.
- **한계 disclaimer 명시**: 기능 완료조건의 미매핑·git diff 미사용(변경 미커버)·commit 바인딩 없음(신선도 추정).
- **secret 누출 0**: latest.json 이 이미 시크릿 미포함 → review 도 파일 원문 echo 안 함(`vhk secure scan` 통과).

## [1.7.1] - 2026-06-02

> **verify --report (Human Panel HTML v0, Goal 14, 배치 6).** Goal 13 의 `latest.json`(기계용 증거)을
> 같은 진실원천 그대로 사람이 한눈에 보는 **정적 HTML**로 렌더. 성장 루프의 "증거 → 사람이 읽는 패널" 단계.
> 철학: 새 증거 안 만듦(렌더만) + 무빌드·무의존(인라인 CSS, 오프라인) + 기존 verify 무손상(옵션 추가만).

### Added

- **`vhk verify --report`** (`src/commands/verify-report.ts`) — `.vhk/reports/latest.json` 을 읽어
  사람용 정적 HTML `.vhk/reports/latest.html` 생성. `renderReportHtml(report)` 순수 함수 —
  인라인 CSS, **외부 의존 0**(CDN/스크립트 없음), 오프라인 동작. status 배지(PASS/WARN/FAIL) +
  게이트별 표(label·종료코드·detail) + nextActions + generatedAt. `escapeHtml` 로 사용자 텍스트 이스케이프.
  latest.json 없으면 verify 1회 선실행 후 렌더, 있으면 **BOM-safe `readJsonFile`** 로 읽음.
- **`vhk verify --open`** — 리포트 생성 후 기본 브라우저로 열기(`safeExecFile`, shell 없는 argv 호출).
  비대화형/CI/MCP(비-TTY)에서는 `isInteractive()` 로 **자동 스킵**.

### Security

- HTML 에 **secret/env 미포함** — latest.json 이 이미 미포함(Goal 13) → 그대로 렌더(누출 0).
  쓰기 권한 없으면 크래시 대신 친절 에러 + exit≠0.

### Note

- 기존 `vhk verify` / `--json` 동작 무손상(옵션 추가만). 테스트 11개 추가(FAIL→HTML 회귀 가드 포함).

## [1.7.0] - 2026-06-02

> **verify 증거화 (Evidence Ledger v0, #13 Goal 13).** `vhk verify` 가 lite(체크리스트 안내)에서
> **실제 게이트 실행 + 증거 기록**으로 승격. 성장 루프(learning·pattern·evolve)의 입력 데이터 토대.
> 철학: 결과는 실제 종료코드에서만(거짓 PASS 금지) + 성공·실패 무관 항상 증거 + Windows 1급.

### Added

- **`vhk verify` 증거화** (`src/commands/verify.ts`) — 게이트 4종(typecheck/test:run/build 외부 +
  secure in-process)을 **실제 실행**하고 각 종료코드를 수집. 결과를 **항상**
  `.vhk/reports/latest.json` 으로 기록(성공·실패 무관). 스키마: `{ schemaVersion, generatedAt,
  date, status(PASS|WARN|FAIL), summary, gates[], nextActions[] }` — head(요약·기계용) + body(사람용).
- **`vhk verify --json`** — 경로 대신 리포트 JSON 을 stdout 으로(CI용).
- **거짓 PASS 금지** — 게이트 스크립트/설정 없으면 `skip`(WARN), 실행 자체 실패는 `fail`(추측 금지).
  `status`: fail 하나라도 → FAIL, 없고 skip 있으면 → WARN, 전부 pass → PASS. `exitCode`: FAIL=1.

### Security

- `latest.json` 에 **시크릿 값 미포함** — secure 게이트는 severe 발견 **건수만** 기록(값 미수집).
  리포트 자체가 `vhk secure scan` 에 안 걸린다(누출 0). `reports/` 는 로컬 전용(`.vhk/.gitignore` 자동 등재).

### Note

- **Windows 1급** — `.cmd` shim 은 `cmd.exe` 래핑(CVE-2024-27980), maxBuffer 64MB 상향(ENOBUFS 거짓실패 방지).
  `package.json` 은 `readJsonFile`(UTF-8 BOM 제거)로 읽어 PowerShell `Set-Content -Encoding utf8` BOM 에도 안 죽고,
  손상 시에도 게이트 skip 후 **증거(latest.json)는 항상 기록**(계약 유지).
- **기존 시그니처 호환** — `--json` 옵션만 추가, `verify()` 무인자 호출(자연어 라우터) 그대로 동작.
  `HARD_STOP` 존재 시 거부 + exit 1. 규격: `docs/rfc/0038-vhk-spec.md`(`reports/` 도입). 테스트 599 pass.

## [1.6.6] - 2026-06-02

> **비대화형 가드 P2 (#14 Goal 12) + `.vhk` 규격 RFC (#38).** Goal 11 이 깐 3버킷 계약을
> 잔여 대화형 명령(theme/sync/ship/design)으로 확장하고, `save` push 정책을 확정.
> 철학 유지: 절대 안 멈춤 + 위험작업 무단실행 0 + 비-TTY 면 stdin 미접근(MCP RPC 보호).

### Added

- **`vhk theme --yes` (`-y`)** — 기존 파일 덮어쓰기 확인을 스킵(비대화형 자동 덮어쓰기). 충돌 확인은
  `promptOrDefault`(stdin SoT)로 마이그 → 비-TTY·미승인이면 inquirer 미호출·기본 보존(① auto-default).
- **`docs/rfc/0038-vhk-spec.md`** — `.vhk/` 규격 v1.1 제안(#38). 누락 항목(`.synced`·`backups/`·
  `config.json`) 정합 + `reports/` 서브디렉토리(Goal 13 verify 증거화) 도입. 코드 아님(스펙/토론).

### Fixed

- **`vhk sync` 확인 축 정정 (stdout → stdin, E8/R1)** — drift 덮어쓰기 확인이 stdout TTY 로 판단해
  MCP 불변식(비-TTY=stdin 미접근)과 어긋나던 문제. 이제 `isInteractive`/`promptOrDefault`(stdin 축)로
  통일. 비-TTY/`--yes` → 자동 덮어쓰기(백업 먼저라 손실 0), 동작 보존.
- **`vhk ship` 비-TTY 크래시 가드** — 배포 체크리스트·회고는 본질적 대화형(② refuse-essential) →
  진입부 `ensureInteractive()` 로 비-TTY 에서 friendly 거부 + `exit 1`(멈춤/EOF 크래시 제거).

### Note

- **`save` push 정책 결정(S5) = `strict-extra` 유지.** commit 은 로컬·되돌리기 가능(undo), push 는
  사용자 자기 remote 대상이라 deploy/publish(외부 배포=high-risk)와 등급이 다름 → `save` 를 HIGH_RISK
  로 승격하지 않는다. push 차단을 원하면 `strict` 모드(이미 비-TTY·미승인 save 차단)가 탈출구.
  회귀 테스트로 계약 고정(`tests/safety-guard.test.ts`).
- **동작 변경:** 비-TTY(파이프/CI/MCP)에서 `vhk ship` 은 `--yes` 가 아니라 **TTY 환경**이 필요합니다
  (자동답 불가한 본질적 대화형). 테스트 585 → 596(신규 11), 회귀 0.

## [1.6.5] - 2026-06-02

> **핫픽스 — `vhk save` 취소 동작.** v1.6.4 의 `promptOrDefault` 가 대화형에서도
> 프롬프트 abort(Ctrl+C/ESC)를 삼켜 fallback 으로 바꾸는 버그. `vhk save` 커밋 메시지
> 입력 중 취소하면 취소가 무시되고 기본 메시지로 **원치 않는 커밋**이 발생했다.

### Fixed

- **`promptOrDefault` 가 대화형 취소(Ctrl+C/ESC)를 삼키던 버그** (`src/lib/interactive.ts`) —
  비대화형은 이미 early-return 하므로 abort 는 항상 "사용자 취소". 이제 fallback 으로
  바꾸지 않고 그대로 전파 → 전역 핸들러가 깔끔히 취소. `vhk save` 커밋 메시지 취소 시
  더 이상 원치 않는 커밋이 생기지 않는다.

## [1.6.4] - 2026-06-02

> **대화형/비대화형 통합 가드 (MCP·CI 안전, #14 Goal 11).** inquirer 쓰는 명령이
> 비-TTY(CI·파이프·MCP stdio)에서 멈추거나 RPC 파이프를 훼손하던 문제를 단일 계약으로 정리.
> 철학: 절대 안 멈춤 + 위험작업 무단실행 0 + MCP면 stdin 미접근.

### Added

- **감지 단일출처 `isInteractive` + `promptOrDefault`** (`src/lib/interactive.ts`) — 모든 명령이
  같은 기준(stdin TTY + `--yes`)으로 프롬프트 여부 판단. 비대화형이면 stdin 미접근(MCP RPC 보호).
- **`VHK_FORCE_INTERACTIVE=1`** — Git Bash/MinTTY 처럼 TTY 오감지 환경용 탈출구.
- **`vhk restore --yes`** — 비대화형 명시 승인 플래그.

### Fixed

- **lite 모드 안전 구멍** — lite 여도 비대화형+미승인이면 위험작업(undo/publish/restore 등) 중단
  (경고 볼 사람 없는 환경서 무단 실행 방지).
- **`restore` 가드 누락** — HIGH_RISK 로 분류 + CLI/자연어 양쪽 `runGuarded` 경유 (백업 덮어쓰기 보호).
- **`vhk gate` 비-TTY 크래시** — 대화형 필수 명령은 깔끔히 거부(멈춤/EOF 크래시 제거).
- **`vhk init` 비대화형 일관화** — stdout 파이프가 프롬프트를 막던 오판 제거(stdin 축 통일).
- **`vhk save`** — 비대화형 커밋 메시지 기본값 + 시크릿 발견 시 비대화형 자동진행 금지(안전 중단).

### Note

- 동작 변경(E11): 비대화형에서 `vhk restore <id>`/`vhk undo` 등 위험작업은 `--yes` 없이 **중단**됩니다.
  자동화는 `--yes` 로 명시 승인하세요.

## [1.6.3] - 2026-06-01

> **VHK 자기개선 배치 + 도그푸딩 이슈 정리.** 카페 A/B 해커톤(`vhk-project-`)에서
> 나온 마찰을 VHK 자체 수정으로 등록(goal 7~10), 2-리뷰(Codex + 다중에이전트)로
> 결함 8건 잡아 수정, OPEN 이슈 #82·#80 해결.

### Added

- **`vhk goal sync`** — `goals/*.md` 를 SoT 로 누락된 `scripts/check-goal-<id>.mjs`
  게이트 스크립트를 자동 백필(idempotent, 자체완결·cross-platform). `.sh` 만 있는
  legacy goal 에도 `.mjs` 를 백필해 Windows 1급 보장.
- **`vhk context` 발견성** — 세션 진입 명령(`status`) 끝에 복원/생성/갱신 한 줄 안내
  (`printContextResumeHint`, 검증된 `checkContextDrift` 재사용).
- **goal 파일 스키마 문서화** — `vhk goal init` 의 `_meta.md` 에 필수 필드/템플릿 명시(VHK-021).

### Fixed

- **`vhk init -y` 완전 비대화형** — `-y`/비-TTY(stdin·stdout) 자동 감지로 모든 프롬프트
  (타입·confirmStack·adopt·overwrite) skip, 기본 타입(webapp) 폴백. CI/파이프 멈춤 제거.
- **Windows/PowerShell 1급** — goal 게이트가 bash 없이 `.mjs`(node)로 동작.
- **`vhk goal list` silent skip 제거** — `type: goal` 누락·비숫자 `id` 로 무시된 파일을
  경고로 노출(VHK-021).
- **`.vhk/cloud.json` gitignore** — secret gist 포인터가 공개 repo 에 노출되던 문제 수정.
  `.vhk/.gitignore` 템플릿 + `cloud push` 시 자동 보장(VHK-022).

## [1.6.1] - 2026-05-30

> **드리프트 정밀화 패치.** v1.6.0 의 맥락 드리프트 판정이 너무 거칠어 README 오타 같은
> 무관 커밋에도 경고가 떴던 노이즈를 잡는다. 기능 추가 없음 — 정확성 수정.

### Fixed

- **맥락 드리프트(`vhk doctor`) 오경보 제거** — `context.md` 의 stale 판정을
  단순 `HEAD sha` 변동에서 **file-change 기반**으로 정밀화. 이제 `context.md` 가 실제로
  반영하는 소스(`package.json`·`goals/`·`docs/state/learnings.md` 내용변경 또는 추적트리
  파일 추가/삭제/이름변경)가 바뀐 경우에만 stale 로 본다. README 오타·`src/` 내용수정
  같은 무관 커밋은 더 이상 경고하지 않는다(`git diff --name-only`, `--diff-filter=ADR`).
  매직넘버 없음, `ContextDriftResult` 시그니처·CRLF 정규화 불변.

## [1.6.0] - 2026-05-30

> **L2 첫 삽 — 드리프트 감지 + 견고성.** sync 한 규칙·맥락이 원본과 조용히
> 어긋나는 걸 vhk doctor 가 스스로 잡아낸다. cloud·publish·exec 견고성 보강 동반.

### Added

- **드리프트 감지 (`vhk doctor`)** — 규칙 드리프트(생성 파일이 RULES.md와 어긋남)와
  맥락 드리프트(`context.md` 가 코드보다 낡음)를 자동 경고. **읽기전용**(자동수정 X),
  `--check` 플래그 아닌 passive(이미 쓰는 doctor 안에서). CRLF 정규화로 거짓경보 방지.
  sync 출력 대상은 `SYNC_TARGETS` 단일 레지스트리로 통합(목록 하드코딩 제거).

### Changed

- **exec timeout backstop** — `safeExecFile` 에 기본 10분 timeout(정상 build/test 무영향),
  네트워크 호출 30초. 스트리밍(deploy·publish 2FA)은 면제(opt-in만). hang 방지.

### Fixed

- **cloud purge 원자화** — `vhk cloud push` 가 과거 gist 에 남은 제외 대상
  (`memory.json`·`refs.json`)을 제거. 백업 파일 우선 반영 + PATCH 후 재검증. 프라이버시 보강.
- **publish git 가드** — npm publish 후처리(add→commit→tag→push)를 단계별로 가드,
  중간 실패 시 중단·안내(반쪽 릴리즈 방지).

## [1.5.1] - 2026-05-30

> **메타데이터 패치.** 기능 변화 없음 — npm 페이지 안내문을 포지셔닝에 맞춰 즉시 반영하기 위한 재게시.

### Changed

- npm `description`/`keywords` 를 포터빌리티 포지셔닝으로 갱신
  ("풀사이클 CLI" → "도구·기기를 바꿔도 규칙·맥락이 따라가는 포터빌리티 CLI",
  keywords 에 portability·cursor·claude·windsurf·copilot·context-sync 추가).
  *(코드 변경은 #39 에서 머지됨, 본 릴리즈는 버전 범프만.)*

## [1.5.0] - 2026-05-30

> **포터빌리티 확장 릴리즈.** v1.4.0 게시 이후 누적분 — 특히 `vhk sync` 대상이
> 3종 → 5종으로 늘었다. v1.4.0 npm 패키지는 3종(Cursor·Claude·Windsurf)만 담고
> 있어 README 의 5종 약속과 어긋났는데, 이 릴리즈로 일치시킨다.

### Added

- **`vhk sync` 대상 확대 — GitHub Copilot + Antigravity** (3종 → 5종).
  `RULES.md` → `.cursorrules` + `CLAUDE.md` + `.windsurfrules` +
  `.github/copilot-instructions.md` + `.agents/rules/vhk-rules.md`.
  경로·포맷은 각 도구 공식 문서 기준. Antigravity 는 파일당 12,000자 제한이 있어
  UTF-8 바이트 기준으로 안전 절삭(구조 경계 + 마커), 전체는 `RULES.md` 에 남는다.
- **GitHub Actions CI** — PR·main 푸시마다 빌드+테스트 자동 검증.
- **`.vhk/` RFC 0001 초안** (`docs/rfc/`) + **포터빌리티 Pain 블로그 초안** (`docs/blog/`) — 둘 다 draft.

### Fixed

- **goal 엣지케이스** — ① 중복 `id` 감지 시 `vhk goal list` 가 경고 출력
  (조용한 누락 방지) ② 없는 `--id` 에 `check`/`done` 이 `goal id N 없음` 으로
  메시지 통일 ③ title 의 콜론 보존 특성화 테스트(회귀 가드).

### Docs

- README 포지셔닝 전면 교체 — "올인원 CLI" → "도구·기기를 옮겨도 규칙·맥락이 따라간다"(포터빌리티). 과장 방지 단서(자동 아님·개인메모 제외·git clone) 명시.

## [1.4.0] - 2026-05-29

> **포터빌리티 릴리즈.** AI 도구·컴퓨터가 바뀌어도 프로젝트 맥락이 따라온다.
> `.vhk/` 표준화 + 멀티 IDE 규칙 동기화 + 클라우드 백업.

### Added

- **`vhk cloud push` / `vhk cloud pull`** — GitHub secret gist 로 `.vhk/` 백업·복원.
  컴퓨터를 바꿔도 `vhk cloud pull` 로 맥락 복원. 인증은 `gh` CLI(코드에 토큰 0),
  개인 메모(`memory.json`)·참고링크(`refs.json`)·`HARD_STOP` 은 기본 제외.
  추가 제외는 루트 `.vhkignore`. 한국어 별칭 `클라우드`/`올리기`/`내리기`.
- **`docs/spec.md`** (spec_version 1.0) — `.vhk/` 디렉토리 공식 규격서.
  파일별 트래킹 정책 + `memory`/`refs` JSON 스키마 + `HARD_STOP` 규칙.
- **`vhk init` 프리셋 씨앗** — 프로젝트 유형별로 `.vhk/README.md`, `.vhk/context.md`,
  `.vhk/.gitignore`, 루트 `.vhkignore` 를 자동 생성.
- **`vhk sync` Windsurf 지원** — `RULES.md` → `.cursorrules` + `CLAUDE.md` +
  **`.windsurfrules`** (3개). IDE 가 바뀌어도 규칙이 따라온다.

### Fixed

- **`vhk init` 루트 `.gitignore` 생성** — 없으면 생성, 있으면 누락 항목만 append
  (기존 내용 보존). `.env`·`node_modules`·`dist` 노출 방지.

### Security

- `cloud` 백업은 secret gist + 개인 메모 기본 제외로 프라이버시 보호.
- `.vhk/memory.json`·`refs.json` 로컬 전용(`.gitignore`).

## [1.3.1] - 2026-05-28

> **Windows 릴리즈 품질 패치.** 1.3.0 publish 직후 발견된 4 publish-blocker + 2 잔여 리스크 + DX polish.
> 기능 변화 없음 — 모두 fix / refactor / docs.

### Fixed

- **bash 의존성 제거** — `vhk goal check` 가 Windows 기본 환경에서 깨지던 문제 해결
  - `src/commands/goal.ts`: `findGateScript(id)` — `.mjs` 우선, `.sh` fallback. runner (node/bash) 동적 선택
  - 신규 `scripts/_lib.mjs` + `scripts/check-meta.mjs` + `scripts/check-goal-{0,1,2}.mjs` (cross-platform)
  - 기존 `.sh` 4 개는 1줄 wrapper 로 축소 (`exec node ../check-*.mjs "$@"`) — dual-maintenance 부담 0
- **vhk secure 자기 레포 fail** — 테스트의 fake AWS key literal 이 자체 스캔에 걸리던 문제
  - `tests/scan-secrets.test.ts` / `scan-files.test.ts` / `secure.test.ts`: literal `"AKIAIOSFODNN7EXAMPLE"` → `'AKIA' + 'IOSFODNN7EXAMPLE'` 조각합성
  - scanner regex (`/AKIA[0-9A-Z]{16}/`) 는 contiguous 매칭만 잡으므로 무해. 런타임 값/테스트 의미 무변경
- **MCP SERVER_VERSION 하드코드 제거** — package.json 과 정합
  - `src/mcp/server.ts`: `const SERVER_VERSION = '1.3.0'` → `getVhkVersion()` (lib/version SoT)
  - 신규 회귀 테스트 — server.version 이 package.json 과 자동 일치

### Changed

- **README MCP 섹션 일관성** — v0.6.0 historical 섹션을 "(당시 8개) → 현재 v1.3 기준 24개" 명시
- **SDK private 멤버 접근 격리** — `tests/helpers/mcp-introspect.ts` 에 `getServerVersion / getServerName` 추가
  - `_registeredTools` + `_serverInfo` 모두 헬퍼 1 파일에 격리 → SDK 메이저 업그레이드 시 1 곳만 패치

### DX

- `printNextStep()` 누락 5 커맨드 추가 (status / update / save / undo / mcp-init)
- `docs/ARCHITECTURE.md` 신규 — 실제 구조 반영
- `--help` 출력 24 명령 최신화
- `README.md` Getting Started 섹션 강화
- `.gitignore` 에 `.env` 추가

## [1.3.0] - 2026-05-28

> **Goal 0 + Goal 1 + Goal 2 모두 DONE.** Phase 3~5 (MCP 풀 커버리지 / vhk goal 명령어 / 자율 루프) 누적 릴리즈.
> 마지막 publish (v1.0.2) 이후 모든 v1.1 / v1.2 / v1.3 기능 + tsc 블로커 해결 + 코덱스 리뷰 cleanup 포함.

### Added

- **자율 루프 (v1.3 Phase 5 / Goal 2 DONE)** — `context → goal next → 작업 → check → done` 사이클 + 트립와이어:
  - `vhk blocker <설명>` — `docs/state/blockers.md` 에 [date goal-N] tag + append-only. 3건 누적 시 `.vhk/HARD_STOP` 자동 생성 + exit 2
  - `vhk learn <교훈>` — `docs/state/learnings.md` 에 append-only. **memory.json 과 분리된 SoT** (Forbidden 이중 기록 금지)
  - `vhk resume --confirm` — `.vhk/HARD_STOP` 해제. `--confirm` 없으면 거부 (Forbidden 자동 호출 금지)
  - `vhk context` 출력 확장: `## Active Goal` (id/title/status/priority/file) + `## Recent Learnings` (최근 3건) + `## ⚠️ HARD_STOP 활성` (트립 시)
  - `AGENTS.md` 신규 — 자율 루프 에이전트 작동 규약 (Working Principles 5 + Loop Protocol + Forbidden Actions)
  - `src/lib/state-files.ts` — appendBlocker/appendLearning/getRecentLearnings/writeHardStop/clearHardStop + HARD_STOP_BLOCKER_THRESHOLD=3
  - 한국어 alias: `블로커` / `교훈` / `재개`
  - 테스트: state-files 15 + agent 8 + context-loop 3 = 26 신규. 전체 293/293
  - `scripts/check-goal-2.sh` — G2.1~G2.5 게이트
  - Dogfooding: `vhk goal done --id 2` 로 자기 자신 DONE 마킹. `vhk learn` 으로 Goal 2 교훈 기록

- **`vhk goal` 명령어 (v1.2 Phase 4 / Goal 1)** — vspec/vooster goals/ 체계를 사용자 CLI 로 노출:
  - `vhk goal init` — 현재 프로젝트에 `goals/_meta.md` + `docs/state/{next-task,blockers,learnings}.md` 스캐폴딩 (기존 파일 보존)
  - `vhk goal list` — `goals/*.md` frontmatter 파싱 → id 순 목록 (status icon + priority + version + title)
  - `vhk goal next` — active goal 자동 선택 (IN_PROGRESS 우선 → 첫 NOT_STARTED) → `docs/state/next-task.md` 멱등 갱신
  - `vhk goal check [--id N]` — `scripts/check-goal-<id>.sh` 실행, exit code passthrough
  - `vhk goal done [--id N]` — 게이트 재검증 → 통과 시 frontmatter `status: DONE` + `completed: YYYY-MM-DD`. **실패 시 frontmatter 무변경** (Forbidden: 실패 = 보존)
  - `vhk check --goal N` — 기존 `check` 의 optional 옵션 추가, goal-aware 게이트 위임
  - YAML frontmatter 파서: `src/lib/goal-frontmatter.ts` — 정규식 기반 (gray-matter 의존성 X)
  - NLP 한국어 4 규칙: "다음 목표" / "목표 점검" / "목표 완료" / "목표 목록"
  - 한국어 alias: `목표`, 서브: `목록/다음/초기화/검증/완료`
  - 테스트 23 (parser 10 + goal 13). 전체 267 → 280 (예정)
  - `scripts/check-goal-1.sh` — Goal 1 게이트 (G1.1 ~ G1.5)

### Internal

- **PR #17 follow-up — D**: `tests/helpers/mcp-introspect.ts` 추출 — SDK private `_registeredTools` 캐스팅 1 곳 격리. SDK 변경 시 패치 표면 최소.

- **MCP 풀 커버리지 완료 (v1.1 Phase 3 / Goal 0 DONE)** — MCP tool 16 → 24:
  - 신규 8 tool:
    - `deploy`, `publish`, `migrate`, `update` — dry-info 핸들러 (인터랙티브 본질이라 실제 실행 미수행, 진단/안내만)
    - `ref-list`, `memory-list`, `context-show`, `mcp-init` — `runVhkCli()` 서브프로세스 위임
  - **G0.1**: registerTool 24 개 도달 (Goal 0 목표 달성)
  - **G0.2**: server.ts inquirer import 0 (MCP 모드 안전성)
  - **G0.3**: server.ts execSync 0 (safeExecFile 통일)
  - `_meta` 게이트 통과 (typecheck/tests/build 모두 ✓)
  - 대화형 본질 4 커맨드 (`gate`, `init`, `design palette`, `theme`, `start`) 는 MCP 제외 확정
  - 테스트: 244/244 pass (mcp-server.test.ts 4 → 5 테스트, 24+ 단언 추가)

### Fixed

- **사전존재 typecheck 4 건 해결** (`_meta` M.1 영구 블로커):
  - `src/commands/start.ts` + `src/lib/git.ts`: `import simpleGit` default → named export `{ simpleGit }` 로 전환 (simple-git 3.x dual export 호환)
  - `src/lib/git.ts:83`: `DiffResult.files` union 정규화 — binary/name-status 항목 insertions/deletions 0 fallback
  - `src/lib/notion-import.ts:79`: `BlockObjectResponse` discriminated union 인덱싱 시 `Record<string, ...>` 캐스팅

- **MCP 풀 커버리지 1차 (v1.1 Phase 3 / Goal 0 진행 중)** — MCP tool 10 → 16:
  - 신규 6 tool: `sync`, `secure`, `audit`, `harness`, `context`, `brief`
  - 모두 비대화형. `runVhkCli()` 헬퍼로 `vhk` CLI 서브프로세스 위임 (MCP 모드에서 inquirer/ora 차단)
  - `audit` 는 fix 프롬프트 비활성화 (MCP non-interactive 보장)
  - 기존 10 tool 시그니처 무변경 (v1.0 GA 안정성 약속 유지)
  - `tests/mcp-server.test.ts` — 등록 tool 개수 + 이름 단언 (`_registeredTools` introspection)
  - MCP 서버 버전 0.7.1 → 1.1.0
  - 남은 후보 (다음 iteration): `gate`/`init`/`start` (대화형 → MCP OUT 또는 비대화형 wrap), `deploy`, `env-sync`, `publish`, `design`, `theme`, `ref`, `migrate`, `update`, `memory`
- **goals/ 구조 (v1.1 Phase 2.5)** — vspec/vooster 패턴 dogfooding:
  - `goals/_meta.md` — 공통 게이트 (typecheck/tests/build) 정의
  - `goals/0-mcp-full-coverage.md` — MCP 풀 커버리지 (10→24 tool) 미션 명세
  - `goals/1-goal-command.md` — v1.2 `vhk goal init/list/next/check/done` 명세
  - `goals/2-agent-loop.md` — v1.3 자율 루프 (`blocker/learn/resume`) 명세
  - `scripts/check-meta.sh` + `scripts/check-goal-0.sh` — 게이트 검증
  - `docs/state/{next-task,blockers,learnings}.md` — 상태 머신 SoT
  - `.vhk/HARD_STOP` 안전장치 규칙 + `CLAUDE.md` Safety 섹션
- `vhk start` (한국어 alias `시작`, `새프로젝트`) — 새 프로젝트 시작 올인원 마법사. 4단계 자동 진행:
  1. `git init` — 이미 repo면 스킵
  2. `vhk init` — `--skip-gate` 자동 적용, 문서/하네스 파일 생성
  3. `vhk mcp-init` — `.cursor/mcp.json` 생성/갱신
  4. `vhk context` — `.vhk/context.md` 생성

  명령어 4개를 외울 필요 없이 `vhk start` 하나로 끝. 옵션은 init 패스스루: `--yes`, `--from-notion <url>`, `--name`, `--description`, `--type`.
- 자연어 라우팅에 "시작", "새 프로젝트", "마법사", "프로젝트 만들고 싶어", "기획 끝났어요 바로 시작" 등 키워드 → `start`로 라우팅
- 기본 메뉴(`vhk` 단독 실행)의 "프로젝트 시작" 선택지가 `start` 마법사로 전환
- `start` 진입 시 안전 가드: `CLAUDE.md`/`.cursor/mcp.json`/`.vhk/context.md` 중 하나라도 있으면 "이미 VHK 설치 흔적 감지" 경고 + 진행 여부 재확인 (init의 파일별 overwrite 프롬프트와 별개)

### Changed (Breaking — 한국어 alias 재배치)

- `vhk 시작` 한국어 alias가 `init` → `start` 마법사로 이동
  - **기존**: `vhk 시작` ≡ `vhk init` (문서/하네스 파일만 생성)
  - **신규**: `vhk 시작` ≡ `vhk start` (git init + 문서 + MCP + context 일괄)
  - 새 동작은 기존 init의 superset. 새 프로젝트에서는 무해. **다만 이미 `.cursor/mcp.json` / `.vhk/context.md`가 있는 프로젝트에서 재실행 시 갱신/덮어쓰기 발생** (안전 가드로 1차 차단)
- `init` 명령에 한국어 alias `초기화` 추가 (`만들기`는 유지). `vhk init`, `vhk 초기화`, `vhk 만들기`는 기존 init 동작 그대로 유지
- NLP 라우팅 규칙 갱신
  - "시작", "프로젝트 만들고 싶어", "기획 끝났어요 바로 시작", "노션…가져와 시작" 등은 `start`로 라우팅
  - `init`은 명시적 키워드(`init`, `초기화`, `하네스 만`, `init만`)만 매칭

### Migration

- **`vhk 시작` 사용자**: 새 프로젝트라면 그대로 사용 권장 (오히려 git/MCP/context까지 자동). 기존 프로젝트에서 init만 다시 돌리고 싶으면 `vhk init`(또는 `vhk 초기화`, `vhk 만들기`) 호출
- **CI/스크립트**: `vhk 시작 --skip-gate` 같은 코드가 있다면 `vhk init --skip-gate`로 명시적 호출로 교체 (start는 `--skip-gate` 옵션 없음 — 마법사 내부에서 자동 적용)

### Compatibility note vs v1.0 GA 약속

- v1.0 GA 안정성 약속은 **명령어 이름·CLI 인자·`.vhk/` 파일 포맷**을 대상으로 함. 한국어 alias는 보조 UX 레이어로 재배치 가능. 그래도 사용자 충격이 있어 마이너 버전(1.1.0) 권장
- 영문 명령어 `vhk init` 및 그 옵션/동작은 그대로 유지 — 약속 무위반

---

## [1.0.1] — 2026-05-24 — Hotfix

### Fixed

- `vhk mcp-init` — pnpm 글로벌 설치 환경에서 `import.meta.resolve` 실패 시 `<cwd>/node_modules/@byh3071/vhk/dist/mcp/index.js` (존재하지 않는 경로)로 fallback해 깨진 `.cursor/mcp.json` 생성하던 회귀. 자기 파일 위치(`dist/commands/mcp-init.js → ../mcp/index.js`) 기반 해석을 1순위로 사용하고 모든 후보 경로에 `existsSync` 검증 추가. 진입점 못 찾으면 PATH의 `vhk-mcp` shim으로 fallback. (영향: Cursor 사용자 모두)
- `vhk harness` — Windows PowerShell의 `Out-File -Encoding utf8`이 생성하는 UTF-8 BOM 포함 `package.json`에서 `JSON.parse` throw → silent catch → "실행할 수 있는 스크립트가 없습니다" 잘못된 메시지. `readJsonFile` helper (BOM strip 포함)로 교체. 같은 패턴 7개 파일(`doctor`, `init`, `mcp-init`, `publish`, `update`, `mcp/server.ts` 2곳, `ref`)도 일괄 정리.
- `vhk recap` — 신규 git 레포에서 커밋이 0개일 때 `simple-git`이 `GitError: fatal: your current branch 'master' does not have any commits yet`를 던지고 프로세스 크래시. recap 진입부에 `hasAnyCommits()` 가드 추가, lib/git의 `getSessionDiff` / `getRecentCommits`에도 try/catch 안전망 추가. 첫 커밋 만들도록 안내.

### Internal

- `src/lib/git.ts` — `hasAnyCommits(): Promise<boolean>` helper 신설
- `src/lib/read-json.ts` 헬퍼 일관 적용 (이미 존재하던 helper를 그동안 호출자들이 안 쓰던 상태였음)

---

## [1.0.0] — 2026-05-24 — GA 🎉

### Added
- `vhk context` — 프로젝트 디렉토리 트리(3-depth) + 기술 스택 자동 감지(Next/Nuxt/React/Vue/Svelte/TS/Tailwind/tsup/Vite/webpack/vitest/jest/commander/inquirer + pnpm/yarn/npm) + VHK 명령어 목록을 `.vhk/context.md` 마크다운으로 자동 생성. AI 어시스턴트의 프로젝트 맥락 파악용
- `vhk context-show` — 현재 컨텍스트 파일 내용 출력
- `vhk memory add|list|remove` — `.vhk/memory.json` 기반 결정사항 기억 관리. `--tags` 옵션으로 태그 지원. NL은 list만 (add/remove는 인자 필수 → commander 전용)
- `vhk brief` — 프로젝트 정보 + git 상태(브랜치·마지막 커밋·미커밋 변경) + 최근 결정사항 5건 + 레퍼런스 3건 통합 보고서 `.vhk/brief.md` 생성 + 콘솔 출력. `safeExecFile` 기반 (Windows .cmd shim 안전)
- 자연어 라우터에 context/context-show/memory(list)/brief 키워드 추가 — `"맥락 만들어줘"`, `"컨텍스트 보여줘"`, `"기억 목록"`, `"프로젝트 브리핑 만들어줘"`, `"상태 요약 보여줘"` 등 9건
- README에 v1.0 GA 정책 섹션 + 전체 30+ 명령어 한국어 별칭 표

### Changed
- 버전: 0.9.1 → 1.0.0 (GA)
- `nlp-router` init 룰에 v1.0 신규 키워드 negation guard 추가 (`브리핑|brief|컨텍스트|context|맥락|기억|memory`) — `"프로젝트 브리핑 만들어줘"`가 init에 잘못 매칭되던 문제 차단

### Stability — v1.0 GA 공개 API 약속
- 명령어 이름, CLI 인자, `.vhk/` 파일 포맷은 v2.0까지 breaking change 없음
- 신규 명령 추가는 마이너 버전(1.x.0)으로 진행
- deprecation은 제거 전 1개 마이너 버전에서 경고
- i18n 키(`ko.ts`)는 누적만, 기존 키 미제거
- MCP 도구 8개 인터페이스 안정

---

## [0.9.0] — 2026-05-24

### Added
- `vhk harness` — `package.json` scripts 자동 감지 후 lint / type-check / test / build 순차 실행 + 통합 리포트. 일부 실패해도 끝까지 진행
- `vhk audit` — `npm audit --json` 래핑, 심각도별 요약, `Critical`/`High` 발견 시 자동 fix 옵션 (`--fix`). Windows PowerShell 호환 (shell stderr redirect 미사용, `err.stdout` 안전 파싱)
- `vhk migrate [npm|yarn|pnpm]` — 패키지 매니저 전환. 대상 CLI 존재 확인 → 확인 프롬프트 → 기존 lockfile + node_modules 정리 → `<pm> install`
- `vhk update` — npm registry 최신 버전 조회 → semver 비교 → `npm update -g @byh3071/vhk` 실행. 현재 ≥ 최신이면 스킵
- 자연어 라우터에 harness/audit/migrate/update 키워드 추가 — `"품질 점검해줘"`, `"보안 감사"`, `"취약점 확인"`, `"패키지 매니저 전환"`, `"vhk 업데이트 해줘"` 등

### Fixed
- `update` 명령이 tsup 번들 후 `package.json` 경로를 잘못 해석해 항상 `v0.0.0`을 출력하던 버그. `dist/index.js` / `src/commands/update.ts` 두 위치 모두에서 동작하도록 `getVersion` 다중 경로 탐색 적용
- `update` 명령이 현재 버전이 publish 된 최신보다 높을 때 다운그레이드를 시도하던 버그. `isUpToDate(current, latest)` semver 비교로 `current >= latest`면 "이미 최신" 처리

### Changed
- 버전: 0.8.1 → 0.9.0
- 키워드 충돌 가드: `harness` 별칭 `하네스` (`점검`은 기존 `check` 유지), `audit` 별칭 `감사` (`보안`은 기존 `secure` 유지)

---

## [0.8.0] — 2026-05-24

### Added
- `vhk design` — 컬러 팔레트 프리셋 4종(Minimal/Vibrant/Corporate/Pastel) 선택 + Tailwind config 또는 CSS 변수 토큰 파일 생성
- `vhk design-palette` — design과 동일 (별칭 진입점)
- `vhk theme` — 다크/라이트 모드 CSS + 토글 유틸리티(`getTheme`/`setTheme`/`toggleTheme`/`initTheme`) 생성
- `vhk ref add|list|open` — `.vhk/refs.json` 기반 레퍼런스 URL 관리. 브라우저 자동 오픈 (Windows/macOS/Linux)
- 자연어 라우터에 design/design-palette/theme/ref 키워드 추가 — `"디자인 토큰 만들어줘"`, `"다크 모드 적용"`, `"레퍼런스 보여줘"` 등
- `ref add` / `ref open`은 인자 추출 인프라가 없어 NL 진입점에서 의도적으로 배제 — commander 서브커맨드로만 노출

### Changed
- 버전: 0.7.1 → 0.8.0

---

## [0.7.1] — 2026-05-24

### Added
- MCP 도구로 `env` + `env-check` 노출 — Cursor 채팅에서 자연어로 환경변수 동기화/누락 검사 가능

### Notes
- `deploy` / `publish` MCP 노출은 stdio 충돌 (`safeExecFileStream` + ora spinner) 및 inquirer 프롬프트 의존성으로 v0.8에서 별도 refactor (skipConfirm 옵션 + 출력 캡처)

---

## [0.7.0] — 2026-05-24

### Added
- `vhk deploy` — Vercel / Netlify / Cloudflare Workers 자동 감지 + 프로덕션 배포
- `vhk env` — `.env` 키만 추출해 `.env.example` 생성, `.gitignore`에 `.env` 자동 추가
- `vhk env-check` — `.env.example` 기준 누락 환경변수 검사
- `vhk publish` — semver 범프(patch/minor/major) + 빌드 + 테스트 + `npm publish` + git tag
- `src/lib/exec.ts` — `safeExecFile` 공유 헬퍼 분리 (MCP 서버 + v0.7 신규 명령 재사용)
- 자연어 라우팅: `'환경변수 점검'`, `'vercel 배포'`, `'npm 출시'` 등 신규 패턴

### Changed
- `ship` 별칭: `'배포'` → `'출하'` (`deploy`와 의미 분리)
- `ship` NLP 룰: `'배포 체크/준비/점검'` 또는 `'출하'` 단독으로만 매칭. `'배포'` 단독은 `deploy`로 양보
- 버전: 0.6.0 → 0.7.0

---

## [0.6.0] — 2026-05-24

### Added
- **MCP 서버 (`vhk mcp`)** — 8개 도구(save/undo/status/diff/ship/doctor/check/recap) stdio 노출. Cursor 등 MCP 클라이언트에서 자연어로 호출
- **`vhk mcp-init`** — Cursor `.cursor/mcp.json` 자동 생성. 재시작 한 번으로 연동 완료
- 자연어 라우팅에 `mcp설정` → `mcp-init` 키워드 추가
- `package.json` `bin`에 `vhk-mcp` 별도 엔트리 추가
- v0.5.x → v0.6.0 버전 업

### Security
- MCP `save` 도구의 shell injection 취약점 차단 — 모든 git 호출에 `execFileSync` 사용 ([aed5b47](https://github.com/byh3071-cpu/vhk/commit/aed5b47))

---

## [0.5.3] — 2026-05-23

### Added
- `CHANGELOG.md` 신설 — 릴리즈마다 자동 갱신
- `doctor` 명령에 npm 최신 버전 비교 — 새 버전 안내 한 줄
- VHK 자체 부트스트랩 (`vhk init`으로 vhk-cli 레포 docs/ 생성)

### Fixed
- `vhk init --skip-gate --name X --type Y` 같은 옵션값 포함 명령이 자연어로 오인되어 gate로 잘못 라우팅되던 버그 ([cli-args.ts](src/lib/cli-args.ts))
- `enhancePackageScripts`가 사용자가 정의한 동명 스크립트(예: `check: eslint`)를 덮어쓰던 문제 — 이제 사용자 정의가 우선 ([init.ts](src/commands/init.ts))

---

## [0.5.2] — 2026-05-23

### Fixed
- 자연어 CLI 인자가 Commander 파싱 전에 잡히도록 분리 — `vhk 보안 확인` 같은 입력이 `too many arguments` 에러 없이 동작
- UTF-8 BOM이 붙은 `package.json` 파싱 처리 (`stripBom`, `readJsonFile`)

---

## [0.5.1] — 2026-05-23

### Changed
- npm 첫 publish 준비 — `@byh3071/vhk` 스코프 패키지

---

## [0.5.0] — 2026-05-23

### Added
- **`vhk save`** — `git add . → commit → push` 한 번에. 원격 없으면 로컬만 커밋
- **`vhk undo`** — 최근 1~5커밋 `soft reset`, 원격 push 상태면 경고·확인 후 진행
- **`vhk diff`** — staged / unstaged / 새 파일 분리 요약. HEAD 대비 줄 수 표시
- **`vhk status`** — 브랜치·변경 개수·최근 커밋·upstream 동기화 대시보드
- 보안 경고 강화 — `save` / `init` / `recap` 전에 `.env`·민감 파일 노출 사전 안내
- Codex 2차 리뷰 반영: `secure scan` 정확도 개선, `save` push 안정화, git porcelain 파싱 견고화

---

## [0.4.0] — 2026-05-23

### Added
- 시작 메뉴 — `vhk`만 입력해도 인터랙티브 메뉴
- 한국어 별칭 — `vhk 검증`, `vhk 시작`, `vhk 정리` 등
- 자연어 라우팅 — `vhk "프로젝트 만들고 싶어"` → `init`
- **`vhk doctor`** — Node / npm / pnpm / Git + 프로젝트 파일 점검
- **`vhk ship`** — 배포 체크리스트 + 회고 + `docs/build-log/` 생성
- **`vhk check`** — `RULES.md` 위반 린트
- **`vhk secure scan`** — 시크릿/키 패턴 스캔. **CRITICAL/HIGH 발견 시 exit code 1** (CI용)
- 각 명령 끝에 "다음에 이것만 하세요" 복붙 명령 + Cursor 힌트

---

## [0.2.0] — 2026-05-23

### Added
- **`vhk recap`** — Git 변경 → `docs/log/` 세션 로그 자동 생성. ADR/트러블슈팅 분리
- **`vhk sync`** — `RULES.md` → `.cursorrules` + `CLAUDE.md` 동기화
- **`vhk init --from-notion <url>`** — Notion PRD 페이지 import → 로컬 `docs/PRD.md` 채우기

---

## [0.1.0] — 2026-05-23

### Added
- 첫 MVP 릴리즈
- **`vhk gate`** — 아이디어 검증 (퀵 5문항 / 풀 13문항 / 스킵)
- **`vhk init`** — 프로젝트 시작. 하네스 파일 생성 (`CLAUDE.md`, `.cursorrules`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, ADR/log 폴더)

[Unreleased]: https://github.com/byh3071-cpu/vhk/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/byh3071-cpu/vhk/compare/v0.9.1...v1.0.0
[0.9.0]: https://github.com/byh3071-cpu/vhk/compare/v0.8.1...v0.9.0
[0.8.0]: https://github.com/byh3071-cpu/vhk/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/byh3071-cpu/vhk/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/byh3071-cpu/vhk/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/byh3071-cpu/vhk/compare/v0.5.3...v0.6.0
[0.5.3]: https://github.com/byh3071-cpu/vhk/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/byh3071-cpu/vhk/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/byh3071-cpu/vhk/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/byh3071-cpu/vhk/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/byh3071-cpu/vhk/compare/v0.2.0...v0.4.0
[0.2.0]: https://github.com/byh3071-cpu/vhk/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/byh3071-cpu/vhk/releases/tag/v0.1.0
