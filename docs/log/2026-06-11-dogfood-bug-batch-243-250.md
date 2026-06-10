# 2026-06-11 — 도그푸딩 버그 8건 일괄 트리아지·픽스 (#243~#250)

> append-only dev log. 추가만, 수정·삭제 금지.

## 한 일 (PR #254, main 머지)

Haruchi-game(외부 프로젝트) 도그푸딩에서 동시세션이 필링한 버그 8건(#243~#250)을 **트리아지 → surgical 픽스 + TDD → 일괄 PR → CI green → squash 머지**. 8개 전부 close, 열린 이슈 0 복귀.

- 발견 경로: 다른 세션이 vhk 를 실제 프로젝트(바닐라 JS·Vercel 스타일)에 돌리다 8건 동시 필링(2026-06-10~11). 본 세션은 measure-first(#251) 마무리 직후 이 백로그를 받음.
- 트리아지: **8-에이전트 병렬 워크플로**(Explore agentType)로 각 이슈를 *현재 코드(cbe80c9) 대비* 검증 — 최근 머지(#238/#252/#253)가 이미 고쳤는지 포함. 결과: 8개 전부 valid·미수정·fix-now.

## 픽스 (8건 · 전부 기존 패턴 미러 또는 1줄)

| 이슈 | 근본원인(file) | 픽스 | 리스크 |
|------|---------------|------|--------|
| #243 | `doctor.ts:137` UI 오타 '로컴 env' | '로컬 env' | trivial |
| #244 | `audit.ts` 비-TTY서 fix 프롬프트 hang(CI/agent) | `promptOrDefault` 래핑 → 비-TTY report-only 폴백(--fix 는 강제 유지) | low |
| #245 | `preflight.ts` tsconfig·typecheck 스크립트 없어도 tsc 강행→차단 | 둘 다 없으면 typecheck skip (verify 게이트 로직 미러, `hasTsconfig` 주입) | low |
| #246 | `exec.ts` SHIM_BINARIES 에 배포 CLI 누락 → Windows .cmd 미탐지 | vercel/netlify/wrangler 추가 | trivial |
| #247 | `env.ts` `.env` 만 확인, `.env.local` 무시 | `.env` 없으면 `.env.local` 폴백(Vercel 관례) + gitignore 보장 | low |
| #248 | `vhk-cloud.ts` DEFAULT_CLOUD_EXCLUDES 에 `*.bak` 없음 → gist 백업 누출 | `*.bak` 추가(memory.json.bak 개인정보) | low |
| #249 | `sync.ts:628` 미매핑 경고가 "제외됨"이라 오해(실제 AGENTS.md 「기타 규칙」 전파됨 #130) | 경고 메시지 정정(손실 아님 명시·동작 변경 X·설계 존중) | trivial |
| #250 | `scan-secrets.ts:24,29` 블록주석(`*`)의 placeholder(YOUR_*) Bearer 오탐 → verify FAIL | 블록주석 인식 + placeholder 표식 확대. **진짜 토큰 탐지 유지** | low(보안) |

- 테스트 **1525 → 1536 (+11)**: audit 비-TTY report-only · scan-secrets placeholder/**진짜토큰 회귀** · cloud `*.bak` · preflight skip · env `.env.local` · exec SHIM.
- build · test(1536) · lint 전부 green. CI 9잡(windows/ubuntu 22·24 + dogfood 양쪽 + CodeQL + gate) green.

## 핵심 결정

- **트리아지 먼저, 픽스 나중**: 8건을 곧장 고치지 않고 병렬 조사로 "현재 코드에서 실재? 최근 머지가 고쳤나?" 먼저 검증. 헛수정·중복 방지. 0 open PR 확인으로 동시세션 충돌 회피.
- **#250 보안 픽스는 false-negative 0 원칙**: placeholder 필터는 *주석 안에서만* 동작 — 진짜 토큰은 주석/코드 어디서든 여전히 HIGH 탐지. "블록주석 진짜 토큰 → 탐지" 회귀 테스트로 못박음(#218 의 per-match 원칙 답습).
- **#249 는 동작 변경 안 함**: 비표준 섹션은 이미 AGENTS.md 「기타 규칙」에 전파됨(#130) — .cursorrules 는 설계상 코딩 전용. 거짓 경고 메시지만 정정(SoT 핵심 sync 의 blast radius 고려).

## 교훈

- **도그푸딩이 진짜 버그를 캐낸다** — 8건 전부 유닛테스트(1525 green)가 못 본 실사용 결함(Windows .cmd·비-TTY hang·바닐라 JS·Vercel .env.local·주석 오탐). 외부 프로젝트 실사용이 단위테스트의 사각을 비춤(Goal 19 SnapContext·diff-cover 도그푸딩 선례 반복).
- **워크플로 에이전트 격리 부재 = 소스 오염 재확인** — 트리아지 Explore 에이전트가 primary 레포에 repro 스크립트(`test_bak_bug.mjs`)를 남김(worktree 격리 없음). 커밋 전 `git status` 로 발견·삭제. 읽기 전용 조사라도 scratch 파일 생성 가능 → 종료 시 잔재 점검.
- **동시세션이 백로그를 던진다** — 작업 중 다른 세션이 이슈 8건 필링 + #252·#253 머지. main 이 계속 전진. 매 커밋 전 `git fetch` + open PR 확인으로 충돌 회피(메모리 패턴 답습).
- **gh CLI 간헐 401** — 머지 후 이슈 상태/카운트 조회가 401 로 흔들려 "open:1" 오집계. 재시도로 0 확정. 단일 호출 결과 맹신 금지.

## 정리

- 트리아지 에이전트 scratch 삭제 · 로컬/리모트 feature 브랜치 삭제 · main 동기화(2b96c55).
- 열린 이슈 0 복귀 → CLAUDE.md LIVE "0개" 드리프트 자동 해소.

## 다음

- measure-first 잔여(사람 게이트): `vhk recall` 며칠 실사용 → `vhk memory eval --init` 실쿼리 라벨 → 진짜 Recall@5.
- 미완 goal(린트 #128, SEO 21~26) · 미발행분 누적 시 릴리즈 판단.
