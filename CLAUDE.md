---
id: claude-md-vhk
date: 2026-05-28
tags: [process, documentation]
---

# 기록 규칙 (vhk)

> 이 파일은 기록/운영 전용. 코딩/디자인 → .cursorrules 참조.
> See also: AGENTS.md

## 프로젝트 정보

- **레포:** <https://github.com/byh3071-cpu/vhk> (public)
- **npm:** @byh3071/vhk (public, scoped)
- **버전:** v2.3.2 (npm latest. package.json + MCP SERVER_VERSION 정합, getVhkVersion 동적)
- **MCP tool:** 29 (Goal 0 24 + `learn` v2.0 쓰기 도구 + `pattern-detect` + `pattern-list` v2.1 + `evolve-suggest` + `evolve-list` v2.2)
- **테스트:** 852 pass (vitest)
- **패키지 매니저:** pnpm

## 현재 상태

- **Phase:** 등록 goal 0~20 전부 DONE. CLAUDE.md sentinel marker(#117)·pattern dismiss/detect 누수(#118) 픽스 + publish 브랜치/clean 가드(#119) main 머지, **v2.3.2 발행 완료**. npm 2.3.1 은 오발행(`feat/goal-20-evolve` 서 발행 → 픽스 누락) → deprecate 처리됨(unpublish 금지·immutable).
- **블로커:** 없음
- **다음 액션:** 없음(vhk 발행 라인 종료). 별개 라인 = Goal 19 도그푸딩 → 20(다른 세션). ⚠️ publish 는 항상 `main` 에서만(가드 #119 가 feature 브랜치/미커밋 발행 차단).
- **마지막 업데이트:** 2026-06-05

> **기억 SoT (v2):** 교훈·결정·실패·성공은 `vhk memory`(memory v2 4버킷, `vhk learn`→`failures.lesson`). `docs/state/learnings.md` 는 v2 마이그레이션으로 흡수·신규기록 중단(분리 폐지).

## 코딩 컨벤션

- `execSync` 신규 사용 금지 → `safeExecFile` 사용
- 모든 커맨드 파일에 `printNextStep()` 패턴 사용
- 한국어 별칭 `.alias()` + `ko.ts` 메시지 필수
- 자연어 라우터 키워드 추가 필수

## MCP 모드 규칙

- handler 내부 `process.exit()` 금지
- MCP 모드에서 inquirer 프롬프트 호출 금지 (TTY 없음)
- 신규 handler는 `runVhkCli(args, headline)` 헬퍼 패턴 사용 (`src/mcp/server.ts`)
- 대화형 커맨드 (gate/init/design palette/theme) 는 MCP 제외
- 기존 tool API 시그니처 변경 금지 (GA 안정성)

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
- 자동 생성 조건: 블로커 3개 누적 (`docs/state/blockers.md`) / 토큰 예산 초과 감지
- 해제: `vhk resume --confirm` 만 가능 (사람이 직접 실행, 자동 호출 금지)
- 게이트 스크립트 (`scripts/check-*.sh`) 는 시작 시 이 파일을 검사한다
- `.vhk/HARD_STOP` 자체는 `.gitignore` 에 등록되어 로컬 전용 신호로 동작

## Goals / State 체계 (v1.1+)

- 단계별 미션은 `goals/<n>-<name>.md` (YAML frontmatter + 표준 섹션)
- 공통 게이트는 `goals/_meta.md` + `scripts/check-meta.sh`
- 현재 상태 SoT 는 `docs/state/next-task.md` / `blockers.md` (교훈은 v2 부터 `vhk memory` failures.lesson — `learnings.md` 는 흡수·동결)
- 자세한 규약은 `goals/_meta.md` 와 `goals/0-mcp-full-coverage.md` 참조

## Stability Gates (v1.3.1+)

- 모든 PR/작업 전: `npm run build && npm test` 통과 필수
- MCP 핸들러 수정 시: 시크릿 가드 체크리스트 확인
- 새 이벤트 리스너 등록 시: 해제 로직 반드시 짝으로 작성
- 캐시(Map/Set) 신규 추가 시: TTL 또는 maxSize 필수
- 문서 관련 코드 변경 시: README/CLAUDE.md 동시 업데이트
