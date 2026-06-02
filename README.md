---
id: vhk-readme
date: 2026-05-28
tags: [vhk, cli, readme, v1.6.1, ga]
---

# 🔧 VHK — Vibe Harness Kit

> 🎉 **v1.6.1** — **규칙은 한 벌로 Cursor·Claude·Windsurf·Copilot·Antigravity에, 맥락은 클라우드로.**
> 도구·기기를 옮겨도 `vhk` 명령으로 그대로 불러옵니다. (포터빌리티)
>
> AI 코딩 에이전트를 부리는 사람을 위한 **한국어 풀사이클 CLI**.
>
> 🍽️ **VHK는 VHK로 부트스트랩됨** — 이 레포의 `docs/`, `CLAUDE.md`, `.cursorrules`도 `vhk init`이 만들었습니다.

명령어를 외우지 않아도 됩니다. `vhk`만 치면 메뉴가 나오고, 한국어로 말해도 알아듣습니다.

## 왜 VHK? — 포터빌리티

AI 코딩 도구는 저마다 규칙 파일이 다르고(`.cursorrules`·`CLAUDE.md`·`.windsurfrules`·`.github/copilot-instructions.md`·`.agents/rules/`…), 컴퓨터를 바꾸면 프로젝트 맥락을 처음부터 다시 모읍니다. VHK는 이 둘을 한 곳에서 관리합니다.

| 문제 | VHK 해결 | 명령 |
|------|----------|------|
| 도구마다 규칙 파일이 따로 논다 | `RULES.md` 한 벌 → Cursor·Claude·Windsurf·Copilot·Antigravity·Gemini·Cline 규칙 동시 생성 | `vhk sync` |
| 컴퓨터·환경 바뀌면 맥락 유실 | `.vhk/` 맥락을 GitHub gist로 백업·복원 | `vhk cloud push` / `pull` |
| 새 프로젝트 세팅 반복 | 유형별 문서·규칙·맥락 뼈대를 한 번에 | `vhk init` |

> 규칙·맥락은 **자동이 아니라 명령으로** 동기화됩니다(한 줄이면 충분). 개인 메모(`memory.json`)·참고링크(`refs.json`)는 프라이버시 위해 기본 제외, 새 PC의 코드 자체는 `git clone` 으로 받습니다.
>
> ℹ️ Windsurf·Copilot·Antigravity 출력 경로·포맷은 각 도구의 **공식 문서 기준**으로 생성합니다(`.windsurfrules` · `.github/copilot-instructions.md` · `.agents/rules/`). Antigravity 는 파일당 12,000자 제한이 있어 초과 시 안전하게 절삭하고 전체는 `RULES.md` 에 남습니다.

### Cursor / Copilot / Antigravity 에서 이렇게 말하세요

규칙 파일을 동기화하면, 에이전트 채팅창에서 명령을 외우지 않고 한국어로 말해도 됩니다:

| 하고 싶은 일 | 채팅창에 이렇게 | 실행되는 명령 |
|------|------|------|
| 규칙 한 벌로 동기화 | "규칙 동기화해줘" | `vhk sync` |
| 지금 상태 보기 | "상태 알려줘" | `vhk status` |
| 뭐 바뀌었는지 | "뭐 바뀌었어?" | `vhk diff` |
| 처음이라 막막함 | "처음 뭐 해?" / "도움말" | `vhk start` |
| 저장(커밋) | "저장해줘" | `vhk save` |

> MCP를 등록하면(`vhk mcp-init`) 위 문장이 곧바로 vhk 도구 호출로 이어집니다. RULES.md 한 벌이 다섯 도구에 같은 규칙을 깔아줍니다.

## 3분 안에 시작하기 (Getting Started)

### 1. 설치

```bash
npm install -g @byh3071/vhk
vhk --version
```

> Node.js ≥ 20 필요. `npx @byh3071/vhk` 로 1회성 실행도 가능.

### 2. 첫 프로젝트 — `vhk start` (마법사)

```bash
mkdir my-app && cd my-app
vhk start
```

`vhk start` 한 번이면 **git init → 문서 생성 → MCP 등록 → 컨텍스트 파일** 까지 자동으로 끝납니다.

기획이 막 떠올랐다면 검증부터:

```bash
vhk gate          # 퀵 5문항 — GO / 다듬기 / 다른 아이디어
```

### 3. 그 외 기능 한눈에 (v1.6)

| 기능 | 한 줄 요약 | 진입 명령 |
|------|-----------|-----------|
| 🎯 **Goals 체계** | 단계별 미션 + 게이트 스크립트로 AI가 목표를 스스로 추적 | `vhk goal init` |
| ▶️ **자율 루프** | `goal next → 작업 → goal check → goal done`. FAIL 시 `vhk blocker` 수동 기록 → 블로커 3건 누적 시 HARD_STOP 자동 | `vhk goal next` |
| 🚧 **HARD_STOP 안전장치** | 블로커 3건 누적 → `.vhk/HARD_STOP` 트립와이어. `vhk resume --confirm` 만 해제 | `vhk blocker "<증상>"` |
| 🔌 **MCP 24 tool** | Cursor·Claude Desktop 등에서 vhk를 채팅으로 호출 | `vhk mcp-init` |
| 📋 **컨텍스트 영속화** | `.vhk/context.md` + `memory.json` + `brief.md` 로 세션 간 맥락 유지 | `vhk context` |
| 🔀 **드리프트 감지** | 규칙 파일이 RULES.md와 어긋나거나 context가 코드보다 낡으면 자동 경고 (읽기전용) | `vhk doctor` |

### 4. 권장 일일 사이클

```text
세션 시작 :  vhk context          # AI에 줄 프로젝트 맥락 갱신
            vhk goal next         # 오늘 작업할 미션 자동 선택

   개발 ...

세션 종료 :  vhk goal check        # 게이트 스크립트로 통과 검증
            vhk goal done         # 통과 시 status: DONE 으로 전이
            vhk save              # add → commit → push 한 번에
            vhk recap             # docs/log/ 에 오늘 기록
```

### 5. 자연어로도 됩니다

```bash
vhk 프로젝트 만들고 싶어
vhk 기획 끝났고 바로 시작
vhk 오늘 한 일 정리
vhk 저장해줘
vhk 다음 목표
vhk 블로커 "API 호출 실패"
```

---

## 빠른 시작 (인터랙티브 메뉴)

```bash
vhk
```

인자 없이 실행하면 **「뭘 도와드릴까요?」** 메뉴가 열립니다.

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
| `vhk sync` | `규칙`, `맞추기` | RULES.md → `.cursorrules` + CLAUDE.md + `.windsurfrules` + `.github/copilot-instructions.md` + `.agents/rules/vhk-rules.md` + `AGENTS.md` + `GEMINI.md` + `.clinerules/vhk-rules.md` |
| `vhk check` | `점검`, `린트` | RULES.md 규칙 위반 검사 |
| `vhk secure` | `보안` | 시크릿·키 유출 스캔 (`scan` / `스캔` 동일). **CRITICAL/HIGH 발견 시 exit code 1** (CI용) |
| `vhk ship` | `출하` | 배포 체크리스트 + 회고 + 빌드 로그 |
| `vhk doctor` | `환경`, `진단` | Node / npm / pnpm / Git 환경 점검 |
| `vhk cloud push` | `클라우드`, `올리기` | `.vhk/` 를 GitHub secret gist 로 백업 (gh CLI 인증 사용) |
| `vhk cloud pull` | `내리기` | gist 에서 `.vhk/` 복원 (`vhk cloud pull <gistId>` 또는 cloud.json) |
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
| `vhk context` | `맥락` | 프로젝트 트리·스택·CLI 명령 목록을 `.vhk/context.md`로 자동 생성 (AI 어시스턴트용). `--compact` 로 토큰 절감형(Active Goal + 최근 blockers/learnings/memories + 참조 링크) 출력 |
| `vhk context-show` | `맥락보기` | 현재 컨텍스트 파일 내용 출력 |
| `vhk memory` | `기억` | 결정사항 기억 관리 (`add` / `list` / `remove`, `.vhk/memory.json` 기반, 태그 지원) |
| `vhk brief` | `브리핑` | 프로젝트 정보 + git 상태 + 결정사항 + 레퍼런스 통합 보고서 `.vhk/brief.md` |
| `vhk goal` | `목표` | Goal 단계별 미션 관리 (`init` / `list` / `next` / `check` / `done`) — vspec/vooster 패턴 |
| `vhk mission` | `미션` | 미션 계약(`set` / `check` / `clear`) — 작업 범위·금지선 선언·검증 (`.vhk/mission.json`, 경로 glob) |
| `vhk blocker <설명>` | `블로커` | 블로커 1건 → `docs/state/blockers.md` append. 3건 누적 시 `.vhk/HARD_STOP` 자동 생성 |
| `vhk learn <교훈>` | `교훈` | 교훈 1건 → `docs/state/learnings.md` append (memory.json 과 별도 SoT) |
| `vhk resume --confirm` | `재개` | `.vhk/HARD_STOP` 해제 (사람 확인 필요, 자동 호출 금지) |

### 자율 루프 (v1.3+)

`AGENTS.md` 의 Loop Protocol 참조. 단방향 사이클:

```text
vhk context → vhk goal next → (작업) → vhk goal check → vhk goal done
                                          ↓ FAIL × 3 cycle
                                   vhk blocker "<증상>"
                                          ↓ 3건 누적
                                   .vhk/HARD_STOP 자동 → 사람 검토 → vhk resume --confirm
```

### goal 서브커맨드 (v1.2+)

| 서브 | 설명 |
|------|------|
| `vhk goal init` | 현재 프로젝트에 `goals/` + `docs/state/` 스캐폴딩 (기존 파일 보존) |
| `vhk goal list` | `goals/*.md` frontmatter 파싱 → id 순 목록 (status/priority/title) |
| `vhk goal next` | active goal (IN_PROGRESS → 첫 NOT_STARTED) 선택 → `docs/state/next-task.md` 갱신 |
| `vhk goal check [--id N]` | `scripts/check-goal-<id>.sh` 실행 (생략 시 active goal) |
| `vhk goal done [--id N]` | 게이트 재검증 → 통과 시 frontmatter `status: DONE` + `completed: YYYY-MM-DD` |
| `vhk check --goal N` | 위 `goal check` 의 별칭 (기존 `check` 시그니처 무변경 + optional 옵션) |

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

노출되는 MCP 도구 **24개** (v1.1):

- **git 워크플로 (8)**: `save`, `undo`, `status`, `diff`, `ship`, `doctor`, `check`, `recap`
- **환경/규칙 (4)**: `env`, `env-check`, `sync`, `secure`
- **품질/감사 (3)**: `audit`, `harness`, `mcp-init`
- **컨텍스트/기록 (4)**: `context`, `context-show`, `memory-list`, `brief`
- **dry-info (4)**: `deploy`, `publish`, `migrate`, `update` — 인터랙티브 본질이라 실제 실행 안 함, 진단/안내만
- **레퍼런스 (1)**: `ref-list`

MCP 제외 확정 커맨드 (대화형 본질): `gate`, `init`, `start`, `design palette`, `theme`, `goal` (각각 CLI 에서만 동작).

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
- **MCP 서버 도구**: v1.0 GA 의 8개 baseline 도구(save/undo/status/diff/ship/doctor/check/recap) 인터페이스 안정 — v1.1 에서 16개 추가되어 총 24개

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
| **MCP 서버** | `vhk mcp` — stdio MCP 서버 첫 도입 (v0.6.0 당시 8개 도구 — save/undo/status/diff/ship/doctor/check/recap). 현재 v1.6 기준 **24개** 로 확장 — 위 "Cursor와 MCP로 연동하기" 섹션 참조 |
| **mcp-init** | `vhk mcp-init` — Cursor `.cursor/mcp.json` 자동 생성. 재시작 한 번으로 연동 완료 |
| **자연어 라우팅 확장** | `vhk mcp설정` → `vhk mcp-init` 별칭 |
| **보안** | MCP save 도구의 shell injection 차단 — 모든 git 호출에 shell 미경유 `safeExecFile` 사용 |

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
- `.vhk/README.md` + `.vhk/context.md` (유형별 씨앗 — 규격: [`docs/spec.md`](docs/spec.md))
- `.vhk/.gitignore` + `.vhkignore` (로컬 전용·클라우드 제외 규칙)
- 루트 `.gitignore` (`.env`·`node_modules`·`dist` 보호 — 기존 파일은 보존하고 누락분만 추가)
- `package.json` scripts: `save`, `check`, `scan`, `recap`, `ship`, `doctor` → `vhk` 호출

## 클라우드 백업 (vhk cloud)

`.vhk/` 프로젝트 맥락을 GitHub **secret gist** 로 백업·복원합니다. 컴퓨터를 바꿔도
규칙·맥락이 따라옵니다. 규격은 [`docs/spec.md`](docs/spec.md) 참조.

```bash
vhk cloud push          # .vhk/ → secret gist 백업 (gist id 는 .vhk/cloud.json 에 저장)
vhk cloud pull          # cloud.json 의 gist 에서 복원
vhk cloud pull <gistId> # 새 환경에서 gist id 로 직접 복원
```

- **인증:** `gh` CLI 사용 (`gh auth login`, gist 권한). 코드·설정에 토큰을 저장하지 않습니다.
- **프라이버시:** gist 는 secret(비공개). 개인 메모(`memory.json`)·참고링크(`refs.json`)·
  `HARD_STOP` 은 기본 제외됩니다. 추가 제외는 루트 `.vhkignore` 에 한 줄씩 적으세요.

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
