---
id: claude-md-vhk
date: 2026-05-23
tags: [process, documentation]
---

# 기록 규칙 (vhk)

> 이 파일은 기록/운영 전용. 코딩/디자인 → .cursorrules 참조.
> See also: AGENTS.md

## 현재 상태
- **Phase:** Phase 1 — MVP
- **블로커:** 없음
- **다음 액션:** __FILL__
- **마지막 업데이트:** 2026-05-23

## ADR
기술/라이브러리 선택 시 docs/adr/ADR-{번호}-{제목}.md 생성.

## 작업 로그
세션 종료 시 docs/log/YYYY-MM-DD-{작업명}.md 생성.

## 트러블슈팅
에러 해결 시 docs/troubleshooting/TS-{번호}-{증상}.md

## TIL
새로 배운 개념 → docs/til.md 한 줄 추가

## /done 커맨드
세션 종료 → /done → 요약 자동 생성 → docs/log/ 저장

## 종료 전 체크리스트
1. ADR 2. 작업 로그 3. 트러블슈팅 4. TIL 5. /done

## Safety — HARD_STOP

- 매 작업 시작 시: `.vhk/HARD_STOP` 파일 존재 여부 확인. 존재하면 모든 자동화 즉시 중단.
  - PowerShell: `if (Test-Path .vhk/HARD_STOP) { Write-Host '🛑 HARD STOP'; exit 1 }`
  - bash: `[ -f .vhk/HARD_STOP ] && echo "🛑 HARD STOP" && exit 1`
- 자동 생성 조건: 블로커 3 개 누적 (`docs/state/blockers.md`) / 토큰 예산 초과 감지
- 해제: `vhk resume --confirm` 만 가능 (사람이 직접 실행, 자동 호출 금지)
- 게이트 스크립트 (`scripts/check-*.sh`) 는 시작 시 이 파일을 검사한다
- `.vhk/HARD_STOP` 자체는 `.gitignore` 에 등록되어 로컬 전용 신호로 동작

## Goals / State 체계 (v1.1+)

- 단계별 미션은 `goals/<n>-<name>.md` (YAML frontmatter + 표준 섹션)
- 공통 게이트는 `goals/_meta.md` + `scripts/check-meta.sh`
- 현재 상태 SoT 는 `docs/state/next-task.md` / `blockers.md` / `learnings.md`
- 자세한 규약은 `goals/_meta.md` 와 `goals/0-mcp-full-coverage.md` 참조
