# Changelog

VHK 변경 이력. [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식, [Semantic Versioning](https://semver.org/lang/ko/).

## [Unreleased]

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

[Unreleased]: https://github.com/byh3071-cpu/vhk/compare/v0.8.0...HEAD
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
