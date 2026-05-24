---
id: vhk-readme
date: 2026-05-24
tags: [vhk, cli, readme, v1.0.0, ga]
---

# 🔧 VHK — Vibe Harness Kit

> 🎉 **v1.0.0 GA** — 바이브코더의 올인원 CLI. 공개 API 안정성 보장.
>
> AI 코딩 에이전트를 부리는 사람을 위한 **한국어 풀사이클 CLI** (v1.0.0)
>
> 🍽️ **VHK는 VHK로 부트스트랩됨** — 이 레포의 `docs/`, `CLAUDE.md`, `.cursorrules`도 `vhk init`이 만들었습니다.

명령어를 외우지 않아도 됩니다. `vhk`만 치면 메뉴가 나오고, 한국어로 말해도 알아듣습니다.

## 설치

```bash
npm install -g @byh3071/vhk
```

```bash
# 한 번만 쓸 때
npx @byh3071/vhk
```

로컬 개발 중:

```powershell
cd vhk-cli
pnpm install
pnpm build
pnpm link --global
vhk --version
```

## 빠른 시작

```bash
vhk
```

인자 없이 실행하면 **「뭘 도와드릴까요?」** 메뉴가 열립니다.

```bash
# 자연어로도 가능
vhk 프로젝트 만들고 싶어
vhk 기획 끝났고 바로 시작
vhk 오늘 한 일 정리
vhk 저장해줘
vhk 변경사항 보여줘
```

## 워크플로우 (권장 순서)

```text
vhk 검증 (gate)     → 아이디어 GO/다듬기/다른 아이디어
vhk 시작 (init)     → 하네스 파일 생성 (CLAUDE.md, PRD, ADR 템플릿 등)
   개발 ...
vhk diff / 상태     → 변경 요약 · 브랜치·원격 현황
vhk 저장 (save)     → git add · commit · push
vhk 정리 (recap)    → 세션 로그 + ADR/트러블슈팅 제안
vhk 점검 (check)    → RULES.md 규칙 린트
vhk 보안            → 시크릿·키 유출 검사 (scan 별칭 동일)
vhk 배포 (ship)     → 배포 체크리스트 + 회고 → docs/build-log/
```

기획이 이미 끝났다면:

```bash
vhk 시작 --skip-gate
# 또는
vhk 기획 끝났고 바로 시작
```

## 전체 커맨드

| 영어 | 한국어 별칭 | 설명 |
|------|-------------|------|
| `vhk` | — | 시작 메뉴 (명령 없음) |
| `vhk gate` | `검증`, `아이디어` | 아이디어 검증 (퀵 5문항 / 풀 13문항 / 스킵) |
| `vhk init` | `시작`, `만들기` | 프로젝트 초기화 + 하네스 생성 |
| `vhk recap` | `정리`, `오늘` | Git 변경 → `docs/log/` 세션 로그 |
| `vhk sync` | `규칙`, `맞추기` | RULES.md → `.cursorrules` + CLAUDE.md |
| `vhk check` | `점검`, `린트` | RULES.md 규칙 위반 검사 |
| `vhk secure` | `보안` | 시크릿·키 유출 스캔 (`scan` / `스캔` 동일). **CRITICAL/HIGH 발견 시 exit code 1** (CI용) |
| `vhk ship` | `출하` | 배포 체크리스트 + 회고 + 빌드 로그 |
| `vhk doctor` | `환경`, `진단` | Node / npm / pnpm / Git 환경 점검 |
| `vhk save` | `저장`, `커밋` | git add · commit · push 한 번에 |
| `vhk undo` | `되돌리기`, `취소` | 최근 커밋 soft reset (변경은 staged 유지) |
| `vhk diff` | `변경`, `차이` | staged / unstaged / 새 파일 요약 (줄 수 합계는 tracked·HEAD 기준) |
| `vhk status` | `상태`, `현황` | 브랜치·변경·커밋·원격·버전 대시보드 |
| `vhk mcp` | — | MCP 서버 시작 (Cursor 등 MCP 클라이언트용, stdio) |
| `vhk mcp-init` | `mcp설정` | Cursor `.cursor/mcp.json` 자동 생성 |
| `vhk deploy` | `배포` | 프로덕션 배포 (Vercel / Netlify / Cloudflare 자동 감지) |
| `vhk env` | `환경변수` | `.env` → `.env.example` 동기화 + `.gitignore`에 `.env` 자동 추가 |
| `vhk env-check` | `환경변수점검` | `.env.example` 기준 누락 환경변수 검사 |
| `vhk publish` | `출시` | npm 배포 자동화 (버전 범프 → 빌드 → 테스트 → publish → git tag) |
| `vhk design` | `디자인` | 디자인 토큰 생성 (Tailwind config 또는 CSS 변수) |
| `vhk design-palette` | `팔레트` | 컬러 팔레트 프리셋 선택 + 적용 |
| `vhk theme` | `테마` | 다크/라이트 모드 CSS + 토글 유틸리티 생성 |
| `vhk ref` | `레퍼런스` | 레퍼런스 URL 관리 (`add` / `list` / `open`) |
| `vhk harness` | `하네스` | 통합 품질 점검 (lint + type-check + test + build 순차 실행 + 리포트) |
| `vhk audit` | `감사` | npm/pnpm/yarn 보안 취약점 감사 (`--fix`로 자동 수정, npm만) |
| `vhk migrate [target]` | `전환` | 패키지 매니저 전환 (`npm` / `yarn` / `pnpm`, lockfile + node_modules 재구성) |
| `vhk update` | `업데이트` | VHK CLI 최신 버전으로 셀프 업데이트 |
| `vhk context` | `맥락` | 프로젝트 트리·스택·CLI 명령 목록을 `.vhk/context.md`로 자동 생성 (AI 어시스턴트용) |
| `vhk context-show` | `맥락보기` | 현재 컨텍스트 파일 내용 출력 |
| `vhk memory` | `기억` | 결정사항 기억 관리 (`add` / `list` / `remove`, `.vhk/memory.json` 기반, 태그 지원) |
| `vhk brief` | `브리핑` | 프로젝트 정보 + git 상태 + 결정사항 + 레퍼런스 통합 보고서 `.vhk/brief.md` |

### init 옵션

| 옵션 | 설명 |
|------|------|
| `--skip-gate` | 아이디어 검증(gate) 생략 |
| `--from-notion <url>` | Notion PRD 페이지에서 import |
| `--name`, `--description`, `--type` | 비대화형 입력 |
| `-y, --yes` | 스택 확인 스킵 |

### recap 옵션

| 옵션 | 설명 |
|------|------|
| `--since YYYY-MM-DD` | 분석 시작일 (기본: 오늘) |

## Cursor와 MCP로 연동하기

`v0.6.0`부터 vhk는 [Model Context Protocol](https://modelcontextprotocol.io) 서버를 내장합니다. Cursor 채팅에서 자연어로 vhk 도구를 호출할 수 있습니다.

```powershell
vhk mcp-init           # .cursor/mcp.json 자동 생성
# → Cursor 재시작 후 채팅에서 자연어로 vhk 도구 호출 가능
# 예: "상태 알려줘" → Cursor가 vhk status 도구 호출
```

노출되는 MCP 도구 8개: `save`, `undo`, `status`, `diff`, `ship`, `doctor`, `check`, `recap`.

MCP 서버를 수동으로 띄우려면:

```powershell
vhk mcp                # stdio 서버 시작 (Cursor가 자동으로 호출)
```

## v1.0.0 GA 하이라이트 🎉

> **공개 API 안정성 약속**. 명령어 이름, CLI 인자, `.vhk/` 파일 포맷은 v2.0까지 breaking change 없음.

| 기능 | 설명 |
|------|------|
| **context** | 프로젝트 디렉토리 트리(3-depth) + 기술 스택(Next/Nuxt/Vue/Svelte/TS/Tailwind/tsup/Vite/...) 자동 감지 + 29개+ VHK 명령어 목록을 `.vhk/context.md` 마크다운으로 생성. AI 어시스턴트가 프로젝트 맥락을 즉시 파악 |
| **memory** | `.vhk/memory.json` 결정사항 기억 관리. `add <content> --tags X,Y` / `list` / `remove <번호>`. NL은 list만 (add/remove는 인자 필수 → commander 전용) |
| **brief** | 프로젝트 정보 + git 상태(브랜치·마지막 커밋·미커밋 변경) + 최근 결정사항 + 레퍼런스를 한 화면에 + `.vhk/brief.md` 저장. `safeExecFile` 기반 (Windows .cmd shim 안전) |
| **자연어 확장** | `"맥락 만들어줘"` → context · `"컨텍스트 보여줘"` → context-show · `"기억 목록"` → memory · `"프로젝트 브리핑 만들어줘"` / `"상태 요약"` → brief |

```powershell
vhk context             # .vhk/context.md (트리 + 스택 + 명령 목록)
vhk memory add "API는 tRPC 사용" --tags decision,arch
vhk memory list
vhk brief               # 콘솔 출력 + .vhk/brief.md
```

### Cursor 권장 시퀀스 (v1.0 GA)

```text
vhk init                # 프로젝트 셋업
vhk design + theme      # 디자인 시스템
vhk context             # AI 맥락 파일 생성
... 개발 ...
vhk memory add "<결정>"  # 결정 누적
vhk brief               # 세션 종료 시 상태 보고서
다음 세션 시작: "컨텍스트 보여줘" → 어제 맥락 복원
```

### v1.0.0 GA 정책

- **공개 API 안정성**: 명령어 이름, CLI 인자, `.vhk/` 파일 포맷은 v2.0까지 breaking change 없음
- **deprecation 절차**: 명령어/옵션 제거 전 1개 마이너 버전(1.x.0)에서 deprecation 경고
- **i18n 키**: `ko.ts`의 `t()` 키 이름은 안정. 신규 키 누적, 기존 키 미제거
- **MCP 서버 도구**: 8개 도구(save/undo/status/diff/ship/doctor/check/recap) 인터페이스 안정

> **`vhk memory` vs Claude Code `auto memory`** — `vhk memory`는 **프로젝트 단위** 결정사항(`.vhk/memory.json`, 팀 공유). Claude Code의 `auto memory`는 **사용자 단위** (`~/.claude/projects/.../memory/`, 개인 컨텍스트). 둘은 별개.

## v0.9.0 하이라이트

| 기능 | 설명 |
|------|------|
| **harness** | `package.json` scripts 자동 감지 → `lint` / `type-check` / `test` / `build` 순차 실행 + 통합 리포트. 일부 실패해도 끝까지 진행 |
| **audit** | `npm audit --json` 래핑 + 심각도별 요약. `Critical`/`High` 발견 시 자동 fix 옵션. Windows PowerShell 호환 (`2>/dev/null` 미사용) |
| **migrate** | npm/yarn/pnpm 전환 — 대상 CLI 존재 확인 → 확인 프롬프트 → 기존 lockfile + node_modules 정리 → `<pm> install` |
| **update** | npm registry에서 `@byh3071/vhk` 최신 버전 조회 → semver 비교 → `npm update -g` 실행. 현재 버전이 같거나 더 높으면 스킵 |
| **자연어 확장** | `"품질 점검해줘"` → harness · `"보안 감사 해줘"` / `"취약점 확인"` → audit · `"패키지 매니저 전환"` → migrate · `"vhk 업데이트 해줘"` → update. 키워드 충돌 가드: `점검` 단독은 기존 `check`에 양보, `보안` 단독은 기존 `secure`에 양보 |

```powershell
vhk harness             # lint + type-check + test + build 순차 실행
vhk audit               # npm 보안 감사 (Critical/High 발견 시 자동 fix 옵션)
vhk audit --fix         # 항상 npm audit fix 실행
vhk migrate pnpm        # npm/yarn → pnpm 전환 (대화형 확인)
vhk update              # @byh3071/vhk 최신 버전 체크 + 글로벌 업데이트
```

## v0.8.0 하이라이트

| 기능 | 설명 |
|------|------|
| **design** | 팔레트 프리셋 4종(Minimal/Vibrant/Corporate/Pastel) 선택 → `src/styles/tokens.css` 또는 `src/styles/vhk-colors.ts` (Tailwind config가 있으면 TS) 생성 |
| **theme** | `src/styles/theme.css` (다크/라이트 + `prefers-color-scheme` + `data-theme` 셀렉터) + `src/lib/theme-toggle.ts` (`getTheme`/`setTheme`/`toggleTheme`/`initTheme`) 생성 |
| **ref** | `.vhk/refs.json` 기반 레퍼런스 URL 관리. `ref add <url> --memo "..."` / `ref list` / `ref open <번호>` (Windows/macOS/Linux 브라우저 자동 오픈) |
| **자연어 확장** | `"디자인 토큰 만들어줘"` / `"팔레트 골라줘"` / `"다크 모드 적용"` / `"레퍼런스 보여줘"` 인식. `ref add`/`open`은 인자 추출 인프라가 없어 의도적으로 NL 배제 — commander 서브커맨드만 사용 |

```powershell
vhk design              # 팔레트 선택 → src/styles/tokens.css 또는 vhk-colors.ts
vhk theme               # src/styles/theme.css + src/lib/theme-toggle.ts
vhk ref add https://example.com --memo "참고 사이트"
vhk ref list            # 저장된 레퍼런스 목록
vhk ref open 1          # 1번 레퍼런스를 브라우저로 열기
```

## v0.7.0 하이라이트

| 기능 | 설명 |
|------|------|
| **deploy** | Vercel / Netlify / Cloudflare Workers 자동 감지 + 프로덕션 배포 |
| **env / env-check** | `.env` → `.env.example` 동기화 + 누락 환경변수 검사. MCP 도구로도 노출 (v0.7.1) |
| **publish** | semver 범프 + 빌드 + 테스트 + `npm publish` + git tag 자동화 |

## v0.6.0 하이라이트

| 기능 | 설명 |
|------|------|
| **MCP 서버** | `vhk mcp` — 8개 도구(save/undo/status/diff/ship/doctor/check/recap)를 stdio로 노출. Cursor 등 MCP 클라이언트에서 자연어로 호출 |
| **mcp-init** | `vhk mcp-init` — Cursor `.cursor/mcp.json` 자동 생성. 재시작 한 번으로 연동 완료 |
| **자연어 라우팅 확장** | `vhk mcp설정` → `vhk mcp-init` 별칭 |
| **보안** | MCP save 도구의 shell injection 차단 — 모든 git 호출에 `execFileSync` 사용 |

## v0.5.3 하이라이트

| 기능 | 설명 |
|------|------|
| **셀프호스팅** | `vhk init`이 vhk-cli 레포 자체를 부트스트랩 — 자기 도구로 자기 레포 만들기 |
| **CHANGELOG.md** | 변경 이력 표준 파일 신설. `vhk ship`이 `[Unreleased]` → `[버전]` 자동 이동 |
| **doctor 업데이트 알림** | `vhk doctor`가 npm 최신 버전 비교 후 `🆕 v0.X.X 사용 가능` 한 줄 표시 |
| **init 안전성** | 옵션값 포함 명령 라우팅 버그 픽스, 사용자 정의 `package.json` scripts 보존 |

## v0.5.0 하이라이트

| 기능 | 설명 |
|------|------|
| **save** | 변경 목록 확인 → 커밋 → push (원격 없으면 로컬만) |
| **undo** | 최근 1~5커밋 soft reset, 원격 push 시 경고·확인 |
| **diff** | staged / unstaged / untracked + HEAD 대비 줄 수 |
| **status** | 브랜치, 변경 개수, 최근 커밋, upstream sync |
| **보안 경고** | save / init / recap 전 `.env`·민감 파일 노출 안내 |

## v0.4.0 하이라이트

| 기능 | 설명 |
|------|------|
| **시작 메뉴** | `vhk`만 입력해도 다음 작업 선택 |
| **한국어 별칭** | `vhk 검증`, `vhk 시작`, `vhk 정리` 등 |
| **자연어 라우팅** | `vhk "프로젝트 만들고 싶어"` → init 실행 |
| **doctor** | Node / npm / pnpm / Git + 프로젝트 파일 점검 |
| **ship** | 배포 전 체크리스트, 회고, `docs/build-log/` 생성 |
| **다음에 이것만 하세요** | 각 명령 끝에 복붙 명령 + Cursor 힌트 |
| **check / secure** | RULES 린트, 시크릿 스캔 (대형 lock·node_modules 제외) |

## init이 만드는 것 (요약)

- `CLAUDE.md`, `.cursorrules`
- `docs/PRD.md`, `docs/ARCHITECTURE.md`
- `docs/adr/`, `docs/log/`, `docs/troubleshooting/`
- `COMMANDS.md`, `BACKLOG.md` (프로젝트 유형에 따라)
- `package.json` scripts: `save`, `check`, `scan`, `recap`, `ship`, `doctor` → `vhk` 호출

## 자연어 예시

| 말하면 | 실행 |
|--------|------|
| 프로젝트 만들고 싶어 | `vhk 시작` |
| 기획 끝났고 바로 시작 | `vhk 시작 --skip-gate` |
| 오늘 한 일 정리 | `vhk 정리` |
| 저장해줘 / 푸시 올려 | `vhk 저장` |
| 커밋 취소 / 롤백 | `vhk 되돌리기` |
| 뭐 바뀌었어 | `vhk diff` |
| 프로젝트 현황 | `vhk 상태` |
| 보안 스캔 돌려 | `vhk 보안` |
| 배포하고 싶어 | `vhk 배포` |
| 뭔가 안 돼 | `vhk doctor` |
| 디자인 토큰 만들어줘 | `vhk design` |
| 팔레트 골라줘 | `vhk design-palette` |
| 다크 모드 적용 | `vhk theme` |
| 레퍼런스 보여줘 | `vhk ref` (list) |
| 품질 점검해줘 | `vhk harness` |
| 보안 감사 해줘 / 취약점 확인 | `vhk audit` |
| 패키지 매니저 전환 | `vhk migrate` |
| vhk 업데이트 해줘 | `vhk update` |
| 맥락 만들어줘 / 컨텍스트 생성 | `vhk context` |
| 컨텍스트 보여줘 / 맥락 보여줘 | `vhk context-show` |
| 기억 목록 / 결정사항 확인 | `vhk memory` (list) |
| 프로젝트 브리핑 / 상태 요약 | `vhk brief` |

## 특징

- 🇰🇷 **한국어 퍼스트** — 질문·판정·다음 단계 안내가 한국어
- 🗣️ **자연어 친화** — 명령어 몰라도 문장으로 시작
- 📁 **로컬 퍼스트** — 로그·ADR·빌드 로그는 프로젝트 폴더에 저장
- 🔒 **보안 기본** — `.gitignore`·시크릿 스캔·민감 파일 경고

## 요구 사항

- Node.js >= 20
- Git (recap·save·ship 권장)

## 개발

```powershell
pnpm install
pnpm build
pnpm test --run
pnpm dev
pnpm dev 검증
```

> Windows PowerShell 5.x: `&&` 대신 `;` 사용 (`pnpm build; pnpm test --run`)  
> 실행 정책으로 `pnpm`이 막히면 **`pnpm.cmd`** 사용: `pnpm.cmd install`, `pnpm.cmd test --run`

### CI에서 secure

`vhk 보안` / `vhk secure scan`은 **CRITICAL 또는 HIGH** 패턴이 있으면 **exit code 1**입니다. MEDIUM만 있으면 0입니다.

## 라이선스

MIT — [LICENSE](LICENSE)

## 배포 (maintainers)

```bash
npm login
pnpm run prepublishOnly
npm publish --access public
npm info @byh3071/vhk
```

`prepublishOnly`가 publish 전에 `pnpm build && pnpm test:run`을 실행합니다.

Repository: https://github.com/byh3071-cpu/vhk
