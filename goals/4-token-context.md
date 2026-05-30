---
vhk_format: 1
type: goal
id: 4
title: 배치2 — 토큰 절감형 컨텍스트(최근 N개 + compact + 참조 로딩)
status: DONE
priority: P2
version: v1.8
completed: 2026-05-30
---

# [배치 2] 한국어 UX 유지 + 토큰 절감형 컨텍스트 설계 보완

목표: VHK의 한국어 인터페이스는 유지하되, 매번 긴 규약/상태/문서를 통째로 컨텍스트에 넣는 구조를 토큰 절감형으로 바꾼다. 한국어가 문제가 아니라 통째 주입이 문제다.

## 공통 가드 (반드시 준수)
- Windows PowerShell 기준. bash heredoc/sh 금지. 게이트는 pnpm.cmd.
- 한국어 CLI 메시지/별칭/문서 톤 유지. token 절감 때문에 사용자-facing 한국어를 영어로 바꾸지 마라.
- 사용자 변경 revert 금지. git status --short 먼저 확인, 기존 수정 보존, 충돌 없이 최소 범위 패치, 불필요한 리팩터링 금지.
- docs/state/blockers.md, docs/state/learnings.md 는 append-only. 과거 항목 삭제 금지.
- TDD. 이 배치 별도 커밋/PR. ko.ts 는 이 배치 문자열만.

## 먼저 읽을 것
1. AGENTS.md
2. CLAUDE.md
3. src/commands/context.ts
4. src/lib/state-files.ts
5. src/commands/brief.ts
6. src/commands/goal.ts
7. src/lib/goal-frontmatter.ts
8. tests/context-loop.test.ts
9. tests/state-files.test.ts

## 현재 확인된 상태
- 한국어 인터페이스: 이미 잘 구현됨
- 구조화된 상태 파일: 대체로 구현됨
- 최근 N개 로드: 현재 learnings 만 getRecentLearnings(3) 로 구현됨
- 짧은 시스템 규약: 미구현
- 상세 문서 필요시 로딩: 미흡

## 1. 최근 N개 로드 보완
learnings 만 최근 3개로 제한하는 건 시작일 뿐 충분치 않다. 현재 vhk context 는 .vhk/memory.json 을 전부 넣고, active blocker 요약 함수도 없다.
요구:
- src/lib/state-files.ts 에 함수 추가:
  - getRecentBlockers(limit = 3)
  - getActiveBlockers(limit = 3)
  - 기존 getRecentLearnings(limit = 3) 와 유사하게 구현하되:
    - blockers.md 에서 "- [" 로 시작하는 항목만 대상
    - ~~strikethrough~~ 해결 항목은 active blockers 에서 제외
    - 기본 limit 은 3
- .vhk/memory.json 도 context 에 전체 삽입하지 말고 최근 N개만:
  - getRecentMemories(limit = 5) 헬퍼를 만들거나 context 내부에서 slice 처리
  - memory 항목이 많아도 context.md 가 과도하게 커지지 않게
- 테스트:
  - blockers 최근 N개 반환
  - active blockers 는 해결 항목 제외
  - memory 가 여러 개일 때 context 에는 최근 5개만 포함

## 2. 짧은 시스템 규약 구현
현재 AGENTS.md 118줄, CLAUDE.md 90줄, goal 문서도 필수 독해라 매 iteration 전체 주입하면 토큰이 크다. 기존 문서는 운영 SoT라 유지한다.
요구:
- AGENTS.compact.md 또는 docs/context/agent-compact.md 생성. LLM이 매번 먼저 읽을 "짧은 작동 규약". AGENTS.md 전체를 대체하지 않고 빠른 시작 요약 역할. 30줄 내외.
- 반드시 포함: 한국어/Windows/PowerShell, 사용자 변경 revert 금지, HARD_STOP 존재 시 중단, active goal 만 작업, docs/state 는 SoT, blockers/learnings append-only, 게이트 실패 시 done 금지, 테스트/빌드 기본 게이트.
- AGENTS.md 에는 compact 문서가 있음을 안내하되 AGENTS.md 자체 규칙은 깨지지 않게.
  ⚠️ 통합 주의: 배치 3에서 AGENTS.md 가 sync 생성물(6번째 타겟)이 될 예정이면, 이 compact 안내는 AGENTS.md 에 하드코딩하지 말고 RULES.md 소스에 넣어 sync 로 전파시켜라(안 그러면 sync 후 덮어써짐). AGENTS.md 를 수기 관리로 유지하기로 했다면 그대로 AGENTS.md 에.
- 가능하면 vhk context 또는 신규 옵션이 compact 규약을 우선 참조하게.
선택 구현:
- vhk context --compact: 전체 명령 목록/디렉터리 트리를 줄이고 Active Goal, 최근 blockers/learnings/memories, 핵심 규약 링크만 포함.
- 또는 vhk context 기본을 compact 로 바꾸고 vhk context --full 을 상세로. 단 기존 사용자 기대를 깨지 않도록 테스트와 README 설명 필요.

## 3. 상세 문서 필요시 로딩 보완
현재 context 는 디렉터리 트리 depth 3, 전체 명령 목록, memory 전체 등을 넣는다. "상세 문서는 필요할 때 검색/열람" 구조가 약하다.
요구:
- .vhk/context.md 에는 상세 문서 전문 대신 참조 링크/경로 중심으로:
  - 규약 상세: AGENTS.md / 기록 규칙: CLAUDE.md / 명령 상세: COMMANDS.md / 구조 상세: docs/ARCHITECTURE.md / 현재 상태: docs/state/next-task.md
- context 에는 상세 문서 내용을 붙이지 말고 "필요시 열람할 파일" 목록 제공.
- contextShow 는 현재처럼 파일 전체 출력 유지 가능.
- 역할 분리: vhk brief = 상태 요약, vhk context = LLM 부팅 컨텍스트.
(⚠️ .vhk/context.md 생성은 배치 1 init 과도 겹치니 참조-링크 방식으로 통일.)

## 권장 구현 순서
1. state-files.ts 에 recent/active helper 추가(getRecentLearnings 유지, getActiveBlockers/getRecentBlockers 추가). 테스트 먼저.
2. context.ts 토큰 절감형 수정(learnings 최근 3, blockers active 최근 3, memory 최근 5, 전체 명령 목록은 compact 에서 제거/요약, 디렉터리 트리 depth 2 또는 compact 에서 생략).
3. compact 규약 문서 추가(AGENTS.compact.md 또는 docs/context/agent-compact.md), AGENTS.md/README 에 짧게 연결.
4. CLI 옵션 vhk context --compact 추가(기본은 기존 호환 유지, --compact 일 때만 절감 출력, 추후 기본 전환 가능하게 문서화).
5. 테스트/문서 업데이트(tests/context-loop.test.ts, tests/state-files.test.ts, README/COMMANDS.md 에 --compact 설명, 필요 시 CLAUDE.md 안정성 규칙 갱신).

## 완료 조건
- 한국어 CLI/문서 톤 유지
- pnpm.cmd exec tsc --noEmit 통과
- pnpm.cmd run test:run 통과
- pnpm.cmd run build 통과
- 변경 요약을 한국어로 보고
