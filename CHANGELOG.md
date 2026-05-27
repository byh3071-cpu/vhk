# Changelog

VHK 변경 이력. [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식, [Semantic Versioning](https://semver.org/lang/ko/).

## [Unreleased]

### Added

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
