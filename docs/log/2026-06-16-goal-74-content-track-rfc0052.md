# 2026-06-16 — Goal 74: vhk content (풀사이클 뒷단 콘텐츠 트랙) + RFC 0052

## 배경

레포+노션 전수조사 결론 "사상은 풀사이클, 실행은 반쪽" — `gate.ts` GATE_QUESTIONS 10~13(콘텐츠화·마케팅·판매·피드백)이 질문으로만 존재하고 실행 명령 0. 비어있는 뒷단(launch/content/sell/ops)의 첫 트랙을 채운다. 격리: 다른 세션과 충돌 방지 위해 `git worktree`(vhk-fullcycle)에서 작업.

## 한 일

- **RFC 0052** (`docs/rfc/0052-fullcycle-backend-tracks.md`) — 뒷단 4트랙(launch/content/sell/ops) 설계. 공통 패턴(상태수집→체크리스트→buildXxxPrompt→emitPrompt), 자문형 원칙(발송·결제·삭제 0), 시퀀싱(content 먼저), IN/OUT. content 1개만 구현, 나머지 설계 예약.
- **emitPrompt 공유 헬퍼 추출** (`src/lib/emit-prompt.ts`) — work.ts 의 private `emitPrompt` 를 lib 로 승격(클립보드+`.vhk` 사본 단일 SoT). work.ts 는 import 로 전환(시그니처·동작 불변 → work 테스트 보존). RFC 0052 §3 "4트랙 재구현 0" 이행.
- **`vhk content`** (`src/commands/content.ts`, goal 74) — VISION What → 블로그/스레드/SEO 메타 **초안 생성 프롬프트**(`.vhk/content-prompt.md`). 순수함수 `buildContentPrompt` + 핸들러 `content()`. Fable5 위생 상속(goal 68/69): ✅/❌ 예시쌍 + 수치 하드리밋(≤3종·60자·155자) + 치명규칙("사람 승인 전 게시·발송 금지"). 빈 VISION graceful.
- 등록: index(+한글별칭 콘텐츠)·command-registry·cli-args·nlp-router·nlp-run·ko.ts + MCP(읽기전용, 31→32) + COMMANDS/README. gitignore + vhk-dir 템플릿에 content-prompt.md.
- 게이트: `scripts/check-goal-74.mjs` 고유검증(16건) + `tests/content.test.ts`(buildContentPrompt 순수함수 5건, TDD RED→GREEN). `goals/74-fullcycle-content.md` 카드.

## 검증

- 전체 테스트 **1727 pass** · 167 files (work.ts emitPrompt 추출 무손상)
- `check-goal-74.mjs`: typecheck ✓ · lint ✓ · 고유검증 16/16 ✓
- e2e `node dist/index.js content` → exit 0, `.vhk/content-prompt.md` 생성. 한글별칭 `콘텐츠` exit 0. MCP 32개.

## 교훈

- **같은 작업폴더에 Claude 세션 2개 = git 충돌**(한 세션 `git checkout main` 이 다른 세션 커밋을 엉뚱한 브랜치로 보냄). 해법 = `git worktree add` 로 폴더 분리 → 독립 HEAD. pnpm 은 글로벌 store 하드링크라 worktree `pnpm install` 4초.
- 뒷단 트랙은 전부 자문형(상태수집+프롬프트생성) — work.ts 패턴 복제. 직접 발송·결제·삭제는 LLM 결정경로 배제(헌법). 생성 프롬프트 자체에 "승인 전 발송 금지" 하드리밋을 박아 에이전트 자율 발송 차단.
