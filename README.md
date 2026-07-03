---
id: vhk-readme
date: 2026-06-08
tags: [vhk, cli, readme, v2.9.0, mcp, proof, ai-coding]
---

# VHK - Vibe Harness Kit

> **v2.9.0** — 모델·에이전트가 뭐로 바뀌어도(Claude Code·Codex·Cursor·중국 모델·다음 것) 안 무너지는 **풀사이클 AI 코딩 하네스**. 쓸수록 이 개발자에게 맞게 진화합니다. (한국어 우선)
>
> Cursor, Claude Code, Claude Desktop, Windsurf, Copilot, Antigravity, Gemini, Cline 사이를 옮겨도 같은 규칙·맥락·검증 루프·기억을 유지합니다. AI는 갈아끼우는 부품, 시스템(규칙·스펙·증거·기억·구조)은 repo 안에 남습니다.

VHK는 코딩 에이전트가 아닙니다. 에이전트가 빠르게 만든 결과를 그대로 믿지 않고, "무엇을 하기로 했는지", "정말 끝났는지", "다음 세션이 어디서 이어져야 하는지"를 repo 안의 파일과 CLI 게이트로 고정하는 하네스입니다.

명령어를 외우지 않아도 됩니다. `vhk`만 실행하면 한국어 메뉴가 열리고, `vhk 저장해줘`, `vhk 다음 목표`, `vhk 출고점검` 같은 자연어도 라우팅합니다.

## 왜 VHK인가

| AI 코딩에서 자주 생기는 문제 | VHK가 고정하는 것 | 대표 명령 |
| --- | --- | --- |
| 도구마다 규칙 파일이 따로 논다 | `RULES.md` 한 벌을 여러 에이전트 규칙 파일로 동기화 | `vhk sync` |
| 세션이 끊기면 맥락이 사라진다 | `.vhk/context.md`, `brief`, `work` 프롬프트로 이어받기 | `vhk work` |
| AI가 "완료"라고 하지만 증거가 빈약하다 | verify/review/preflight/testmap으로 증거와 게이트 확인 | `vhk verify` |
| 목표가 많아지면 무엇부터 할지 흐려진다 | `goals/*.md`와 `docs/state/next-task.md`로 다음 목표 고정 | `vhk goal next` |
| 같은 실수가 반복된다 | memory/pattern/evolve로 교훈과 룰 후보 축적 | `vhk learn` |
| 위험한 상태에서 계속 진행한다 | blocker 3건 누적 시 `.vhk/HARD_STOP` 생성 | `vhk blocker` |
| AI 비용이 새는지 모른다 | cost 가드로 예산·사용량 추적 + 임계(80% 경고·100% 차단) | `vhk cost` |
| SEO·수익 확인이 콘솔 여러 개에 흩어져 있다 | 사이트 등록·자격증명 안전보관·오프라인 리포트로 한곳에 정리(실 제출·수집은 자격증명 연결 후 사람이 실행) | `vhk seo` |

## 설치

```powershell
npm install -g @byh3071/vhk
vhk --version
```

요구 사항은 Node.js 22 이상입니다. 1회성 실행은 `npx -y @byh3071/vhk`로도 가능합니다.

## 3분 시작

### 새 프로젝트

```powershell
New-Item -ItemType Directory my-app
Set-Location my-app
vhk start
```

`vhk start`는 `git init`, 기본 문서, MCP 설정, 컨텍스트 파일 생성을 한 번에 진행합니다. 아이디어 검증부터 하고 싶다면 먼저 `vhk gate`를 실행하세요.

### 기존 프로젝트

```powershell
vhk init -y
vhk sync
vhk context
vhk mcp-init
```

`vhk init`은 VHK 하네스 파일을 추가하고, `vhk sync`는 `RULES.md` 기준으로 각 AI 도구의 규칙 파일을 맞춥니다. `vhk mcp-init`은 Cursor/Claude Desktop 같은 MCP 클라이언트가 VHK를 호출할 수 있게 설정합니다.

### 하루 작업 루프

```powershell
vhk work
vhk goal next
vhk mission set --objective "checkout bug fix" --scope "src/**" --forbidden ".env"

# 개발

vhk verify
vhk review
vhk preflight --pr
vhk goal done
vhk save -m "fix checkout bug"
vhk work handoff
```

이 루프의 의도는 단순합니다. 시작할 때 목표와 맥락을 고정하고, 끝낼 때 실제 검증 결과와 인수인계를 남깁니다.

## 핵심 루프

### 1. 규칙 포터빌리티

`RULES.md`를 원천으로 두고 아래 파일을 생성하거나 갱신합니다.

- `.cursorrules`
- `CLAUDE.md`
- `.windsurfrules`
- `.github/copilot-instructions.md`
- `.agents/rules/vhk-rules.md`
- `AGENTS.md`
- `GEMINI.md`
- `.clinerules/vhk-rules.md`

```powershell
vhk sync
vhk sync --check   # 검사만 — 8개 타겟이 RULES.md 와 일치하는지 (drift 시 exit 1, 쓰기 0)
vhk doctor
```

`vhk doctor`는 VHK, MCP, audit, drift 상태를 읽기 중심으로 진단합니다. `vhk sync --check`는
CI/게이트용 — 산출물을 직접 고쳤거나 sync 를 깜빡한 drift 를 잡아냅니다.

### 2. Goal과 HARD_STOP

Goal은 `goals/*.md`와 `scripts/check-goal-<id>.mjs`를 연결합니다. `vhk goal done`은 게이트를 다시 돌려 통과할 때만 DONE으로 전이합니다.

```powershell
vhk goal init
vhk goal list
vhk goal next
vhk goal peek          # 다음 goal 조회만 (next-task.md 미변경, 읽기 전용)
vhk goal check --id 42
vhk goal done --id 42
vhk goal drift
```

블로커가 반복되면 VHK는 진행을 멈춥니다.

```powershell
vhk blocker "테스트가 같은 원인으로 계속 실패"
vhk resume --confirm
```

### 3. 증거와 자기검증

VHK의 trust loop는 "실행했다"와 "완료됐다"를 분리합니다.

```powershell
vhk verify --report
vhk review --id 42
vhk testmap
vhk preflight --publish
vhk mission check
```

- `verify`: tsc/lint/test/build/secure 게이트 실행 후 `.vhk/reports/latest.json` 저장
- `review`: 최신 증거와 goal 완료조건을 교차검증
- `testmap`: 변경된 기능 소스와 대응 테스트 누락을 경고
- `preflight`: 2FA, shim, env, lint, type, test, git, branch를 출고 전 점검
- `mission`: 작업 목표와 허용/금지 범위를 계약처럼 선언하고 검증

### 4. 기억, 패턴, 진화

VHK는 프로젝트 단위 기억을 `.vhk/memory.json`에 저장합니다. 개인 LLM 메모리와 분리되는 repo-local 기억입니다.

```powershell
vhk memory add "결제 API는 tRPC mutation으로 유지" --type decision --tags arch,billing
vhk learn "비-TTY 명령은 프롬프트 없이 실패해야 한다"
vhk pattern detect
vhk evolve suggest
vhk evolve list
```

`pattern`은 반복되는 실패/성공 신호를 찾고, `evolve`는 사람이 승인할 수 있는 RULES.md 후보를 만듭니다. 자동 적용이 아니라 diff와 확인을 거치는 구조입니다.

## 🤖 오토파일럿 스킬 `/vhk-auto` (1단계 MVP)

VHK 프로젝트에서 **active goal 1개를 혼자 한 바퀴 돌리고 멈춰 보고**하는 클로드 코드 스킬입니다.

- 호출: 클로드 코드에서 `/vhk-auto` (또는 "오토파일럿으로 한 바퀴 돌려").
- 하는 일: 앵커 재주입(`loop-brief`+`remind`) → 개발(TDD) → `vhk verify` 결정론 게이트
  → `/code-review` 적대검증 → 합격 시 작은 commit → 끝나면 핵심 보고.
- **안전(1단계 한계)**: 외부 발송·이슈 등록·`gh` 호출을 **하지 않습니다.** commit만 자동(push·PR·publish 금지).
  문제는 "이슈 초안 텍스트"로만 보고하고, 실제 GitHub 등록은 2단계 `vhk auto` 명령(예정)이 맡습니다.
- 설치: 다른 프로젝트에서 쓰려면 글로벌 `~/.claude/skills/vhk-auto/`에 이 스킬이 복제돼 있어야 합니다.

> 2단계 로드맵: CLI `vhk auto` + MCP `vhk_auto`로 승격 시 이슈 자동등록(safeExecFile gh·dedupe·
> undo 승인 패턴·secure 강제)이 결정론 코드로 추가됩니다.

## MCP 35 tools

`vhk mcp-init`으로 MCP 설정을 만들고, MCP 클라이언트는 `vhk mcp` stdio 서버를 통해 아래 도구를 호출합니다.

```powershell
vhk mcp-init
vhk mcp
```

현재 등록된 MCP 도구는 35개입니다.

| 그룹 | 도구 |
| --- | --- |
| Git/세션 | `save`, `undo`, `status`, `diff`, `ship`, `recap` |
| 진단/품질 | `doctor`, `check`, `secure`, `audit`, `harness` |
| 환경/규칙 | `env`, `env-check`, `sync`, `mcp-init` |
| 컨텍스트/기억 | `context`, `context-show`, `brief`, `loop-brief`, `remind`, `memory-list`, `learn` |
| 풀사이클 뒷단 | `content`, `launch`, `ops`, `sell` |
| 배포/패키지 안내 | `deploy`, `publish`, `migrate`, `update` |
| 레퍼런스 | `ref-list` |
| 패턴/진화 | `pattern-detect`, `pattern-list`, `evolve-suggest`, `evolve-list` |

대화형 본질이 강하거나 상태 전이가 큰 명령은 CLI 전용입니다. 예: `gate`, `start`, `init`, `goal`, `mission set`, `design`, `theme`, `evolve apply/reject/undo`.

## 명령 표면

| 영역 | 명령 | 용도 |
| --- | --- | --- |
| 시작 | `vhk`, `vhk gate`, `vhk start`, `vhk init` | 메뉴, 아이디어 검증, 새 프로젝트 마법사, 하네스 초기화 |
| 규칙/맥락 | `vhk sync`, `vhk context`, `vhk context-show`, `vhk brief`, `vhk loop-brief`, `vhk remind`, `vhk work`, `vhk work handoff` | 규칙 동기화, 프로젝트 맥락 생성, 루프 1틱 의도 앵커, 치명 규칙 재주입, 세션 시작/인수인계 |
| 풀사이클 뒷단 | `vhk content`, `vhk launch`, `vhk ops`, `vhk sell` | 콘텐츠/런칭/운영/판매 초안 프롬프트 생성 (초안만, 게시·발송·결제는 사람이 · `launch`≠`ship`(코드 배포)) |
| Goal | `vhk goal init/list/next/check/done/sync/drift` | 단계별 목표, 게이트, 상태 드리프트 관리 |
| Trust | `vhk verify`, `vhk review`, `vhk receipt`, `vhk preflight`, `vhk testmap`, `vhk mission set/show/check/clear` | 증거 생성, 거짓완료 탐지, 증거 영수증(4대 기계증거 판정), 출고 전 점검, 테스트 매핑, 작업 범위 계약 |
| 안전 | `vhk blocker`, `vhk resume --confirm`, `vhk mode`, `vhk secure scan` | HARD_STOP, safety mode, 시크릿 스캔 |
| Git | `vhk status`, `vhk diff`, `vhk save`, `vhk undo`, `vhk restore`, `vhk recap` | 상태/변경 확인, 커밋/푸시(커밋 메시지 미지정 시 변경 파일 기반 자동 생성 · `-m "메시지"` 직접 지정), 되돌리기, 세션 로그 (`recap` 은 비-TTY/헤드리스 지원 — `--summary/--next/--decisions/--blockers/--yes`) |
| 환경/품질 | `vhk doctor`, `vhk check`, `vhk env`, `vhk env-check`, `vhk harness`, `vhk audit`, `vhk worktree check/add` | 개발환경, RULES 린트, env, 통합 품질, 보안 감사, worktree 가드 |
| 배포/패키지 | `vhk ship`, `vhk deploy`, `vhk publish`, `vhk update`, `vhk migrate` | 배포 체크, 배포 실행, npm 릴리스 자동화, 셀프 업데이트, 패키지 매니저 전환 |
| MCP/클라우드 | `vhk mcp`, `vhk mcp-init`, `vhk cloud push/pull` | MCP stdio 서버, 클라이언트 설정, `.vhk/` secret gist 백업/복원 |
| 기억/학습 | `vhk memory`, `vhk learn`, `vhk pattern`, `vhk evolve` | 결정/실패/성공 기억, 교훈, 반복 패턴, 룰 후보 |
| 디자인/레퍼런스 | `vhk design`, `vhk design-palette`, `vhk theme`, `vhk ref add/list/open` | 디자인 토큰, 테마, 참고 링크 관리 |
| 일일 리듬 | `vhk standup`, `vhk today` | 아침 브리핑, 저녁 회고 |

## 자연어 예시

| 입력 | 라우팅 |
| --- | --- |
| `vhk 저장해줘` | `vhk save` |
| `vhk 뭐 바뀌었어` | `vhk diff` |
| `vhk 다음 목표` | `vhk goal next` |
| `vhk 목표 검증` | `vhk goal check` |
| `vhk 출고점검` | `vhk preflight` |
| `vhk 보안 스캔` | `vhk secure scan` |
| `vhk 오늘 한 일 정리` | `vhk recap` |
| `vhk 작업 시작` | `vhk work` |
| `vhk 인수인계` | `vhk work handoff` |

## 보안과 개인정보

- VHK는 기본적으로 local-first입니다. 로그, 맥락, 기억은 repo와 `.vhk/`에 남습니다.
- `.env`와 민감 파일은 `.gitignore`, `secure scan`, `preflight`에서 계속 확인합니다.
- `vhk cloud push`는 GitHub secret gist를 사용합니다. 토큰은 코드나 설정에 저장하지 않습니다.
- `memory.json`, `refs.json`, `HARD_STOP` 같은 개인/상태 파일은 기본 백업 제외 대상입니다.

## 요구 사항

- Node.js >= 22
- Git
- 선택: `gh` CLI (`vhk cloud push/pull` 사용 시)
- 선택: pnpm/yarn/npm 중 프로젝트 패키지 매니저

Windows PowerShell에서 실행 정책 때문에 `pnpm`이 막히면 `pnpm.cmd`를 사용하세요.

## 개발

```powershell
pnpm.cmd install
pnpm.cmd run build
pnpm.cmd run test:run
pnpm.cmd run dev
```

`prepublishOnly`는 publish 전에 빌드와 테스트를 모두 실행합니다.

```powershell
pnpm.cmd run prepublishOnly
```

## 배포 담당자 메모

```powershell
npm.cmd login
pnpm.cmd run prepublishOnly
npm.cmd publish --access public
npm.cmd info @byh3071/vhk
```

일반 개발 중에는 `vhk publish`나 `npm publish`를 실행하지 마세요. 릴리스 담당자가 version, changelog, tag, npm dist를 확인한 뒤 실행합니다.

## Pro (관심 실측 중)

VHK 코어는 MIT로 **영구 무료**입니다. 아래는 팀/다중 프로젝트용 Pro 후보이며, **수요를 먼저 확인하고 만듭니다.**

- 팀 규칙 레지스트리 — `RULES.md`를 여러 사람·레포에 클라우드 동기화
- 패턴/교훈 클라우드 — 여러 레포의 `memory`/`pattern`을 통합
- 비용 가드 대시보드 — 다중 프로젝트 예산·사용량 집계

필요하면 [이슈](https://github.com/byh3071-cpu/vhk/issues)에 `pro` 라벨로 남겨주세요. 관심 3건이면 만듭니다.

## 라이선스

MIT - [LICENSE](LICENSE)

Repository: https://github.com/byh3071-cpu/vhk
