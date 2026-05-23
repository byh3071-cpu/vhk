---
id: vhk-readme
date: 2026-05-23
tags: [vhk, cli, readme, v0.5.1]
---

# 🔧 VHK — Vibe Harness Kit

> AI 코딩 에이전트를 부리는 사람을 위한 **한국어 풀사이클 CLI** (v0.5.1)

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
| `vhk ship` | `배포`, `릴리즈` | 배포 체크리스트 + 회고 + 빌드 로그 |
| `vhk doctor` | `환경`, `진단` | Node / npm / pnpm / Git 환경 점검 |
| `vhk save` | `저장`, `커밋` | git add · commit · push 한 번에 |
| `vhk undo` | `되돌리기`, `취소` | 최근 커밋 soft reset (변경은 staged 유지) |
| `vhk diff` | `변경`, `차이` | staged / unstaged / 새 파일 요약 (줄 수 합계는 tracked·HEAD 기준) |
| `vhk status` | `상태`, `현황` | 브랜치·변경·커밋·원격·버전 대시보드 |

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
