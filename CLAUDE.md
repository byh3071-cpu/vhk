---
id: claude-md-vhk
tags: [process, constitution]
---

# CLAUDE.md — vhk 헌법 + 현재 상태

> 📖 **읽는 법 (필수):** 이 파일은 두 구역이다.
> 1) 위 = 🔒 영구 헌법 (절대 수정 금지)
> 2) 맨 아래 = ✏️ LIVE 현재 상태 (매 세션 갱신, 여기만 수정)
> **반드시 맨 아래 ✏️ LIVE 구역까지 읽고 "다음 할 일"에서 이어간다. 스킵 금지.**
> 사실 SoT: 버전·테스트 = package.json·CHANGELOG / 상세 상태 = docs/state/.

════════════ 🔒 영구 헌법 (수정 금지) ════════════

## 언어·소통 규칙
- 응답은 무조건 한국어. 영어는 기술 용어(commit·MCP·build 등)에만.
- 사용자는 비개발자 → 두괄식(결론 먼저) + 전문용어는 쉬운 말로 풀이.
- 결론 → 이유 → 다음 행동 순, 짧게.

## 프로젝트 좌표 (포인터)
- 레포: github.com/byh3071-cpu/vhk (public) · npm: @byh3071/vhk
- 패키지 매니저: pnpm (npm 아님)
- 규칙 단일소스 → RULES.md → (vhk sync) → .cursorrules·AGENTS.md 등 / 명령 사용법 → COMMANDS.md
- 단계 미션 → goals/<n>-<name>.md · 공통 게이트 → goals/_meta.md
- 상태 SoT → docs/state/next-task.md · blockers.md

## 세션 시작 의례
1. `vhk work` 실행 → 상태 수집 + 시작 프롬프트를 클립보드에 복사 (HARD_STOP 자동 확인)
2. `claude` 실행 후 Ctrl+V 붙여넣기
3. Claude는 이 파일(✏️ LIVE 포함)을 1순위로 읽고 → AGENTS.md는 참고만 →
   docs/state/next-task.md·.vhk/context.md 기준으로 이어서 작업

## 작업 단위 의례
- 1 iteration = active goal 하나 + 작은 commit 하나 + 게이트 통과(or 정직한 블로커)
- 범위 계약: `vhk mission set` → `vhk mission check`
- 완료 주장 전 `vhk review`(거짓완료 자기검증)
- 막히면(3 cycle 진전 없음): `vhk blocker "<증상>"` → 다음 태스크

## 세션 중단/종료 의례 (🔒 dev log = 영구·삭제 금지)
- `vhk work handoff` 실행 → 인수인계 프롬프트 클립보드 복사 →
  Claude가 완료/미완 정리 + next-task.md 갱신 + 커밋 가능 여부 판단
- dev log `docs/log/YYYY-MM-DD-<작업명>.md` = append-only. 추가만, 수정·삭제 금지.
- 미완으로 꺼도 next-task.md에 "다음 할 일" 반드시 남김

<!-- vhk:rules:start -->
> ⚡ 아래 규칙 섹션은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.

## 기록 규칙
- 의사결정 → docs/adr/ · 에러 → docs/troubleshooting/ · 배움 → docs/til.md · 설계 → docs/rfc/
- dev log `docs/log/YYYY-MM-DD-<작업명>.md` = append-only (추가만, 수정·삭제 금지)
- 코드 변경이 동작/사용법을 바꾸면 README 만 같이 갱신 (CLAUDE.md 는 갱신 대상 아님)
- 교훈·결정·실패·성공 = `vhk memory`(4버킷) / `vhk learn`. learnings.md 는 v2 흡수·동결 → 신규 기록 금지.
- 상태 SoT = docs/state/next-task.md · blockers.md (append-only)

<!-- vhk:rules:end -->

## Safety — HARD_STOP
- 작업 시작 시 `.vhk/HARD_STOP` 확인 → 있으면 즉시 중단 (vhk work가 자동 체크)
  PowerShell: `if (Test-Path .vhk/HARD_STOP) { Write-Host '🛑 HARD STOP'; exit 1 }`
- 자동 생성: 블로커 3개 누적 / 토큰 예산 초과
- 해제: `vhk resume --confirm` (사람만, 자동 호출 금지)

## Stability Gates
- 작업 전 게이트 통과 필수: `pnpm build; pnpm test`
  (PowerShell은 `&&` 미지원 → 반드시 `;` 로 연결)
- 게이트 실패 시 done 금지
- publish는 항상 main에서만 (가드 #119가 feature 브랜치/미커밋 발행 차단)
- 새 이벤트 리스너 → 해제 로직 짝으로 / 새 캐시(Map·Set) → TTL 또는 maxSize 필수

## Goals / State 체계
- 단계 미션 = goals/<n>-<name>.md (frontmatter + 표준 섹션)
- 공통 게이트 = goals/_meta.md + scripts/check-meta.sh
- 상태 SoT = docs/state/next-task.md · blockers.md

## Forbidden
- 🔒 영구 구역 수정 / 상태값을 영구 구역에 박제 금지 (버전 줄은 LIVE 예외 ↓)
- dev log·blockers 과거 항목 수정·삭제 금지 (append-only)
- 게이트 실패에 done / `vhk resume` 자동 호출 금지
- 코딩·디자인 규칙 여기 적기 금지 → RULES.md
- AGENTS.md·.cursorrules 직접 편집 금지 → RULES.md 단일소스 + `vhk sync` 로만

════════════ ✏️ LIVE — 현재 상태 (매 세션 갱신 · 여기만 수정) ════════════

> 세션 시작: 이 구역 읽고 "다음 할 일"부터.
> 세션 종료: 마지막 갱신·버전·Phase·다음 할 일 갱신. (위 🔒 구역은 절대 건드리지 마.)
> ⚠️ 아래 `**버전:**` 줄은 CI(version-sync.test.ts)가 강제 — 형식 `**버전:** vX.Y.Z` 유지, 릴리즈마다 package.json 따라 갱신.

**마지막 갱신:** 2026-06-10
- **버전:** v2.5.1 (발행 완료) — 사실 확인은 package.json·CHANGELOG
- **테스트:** 1385 pass(main) · **MCP tools:** 29 — 사실값은 package.json·CHANGELOG
- **Phase:** measure-first 2종. recall(RFC 0049) #232·#233. diff-coverage(RFC 0050·Goal 50) PR1 #236+파서픽스 #239 — `vhk diff-cover` 측정(자문·차단 0). 둘 다 실측 누적 후 게이트/ML 결정. 추가: 콜드스타트 −37%(#240 inquirer lazy).
- **블로커:** 없음
- **진행 중(미발행):** diff-coverage PR1 + 콜드스타트(#240) main 머지(미발행). diff-cover §5 실측 **5 실제 diff 완료**(2026-06-10 dev log) → 실로직 미검증 2/5(#233·#232, 둘 다 CLI 명령부), 과반 미달=승격 임계 불충족·기각도 아님. PR2 가면 "명령부 미검증 경고"형(차단 아님)으로 좁힘.
- **다음 할 일:** measure-first 2종 측정 완료 — diff-cover 5건(승격 보류) + recall eval **재현 56%@N34**(기억 18→34에도 불변·robust, 미스 8건 KR↔EN 어휘격차). **둘 다 임계 미달·실사용 미축적 → 승격/ML 보류**(measure-first가 조기결정 차단). 남은 건 **사람 게이트**: `vhk recall` 며칠 실사용 → `vhk memory eval --init` 실쿼리 라벨 → 진짜 Recall@5(<70 반복이면 2차 ML bge-m3). 병행: 미완 goal(린트 25/27·#128, SEO 21~26). 열린 이슈 = 0개(#38 포함 전부 closed, 2026-06-10 확인).
- **주의:** publish는 main에서만(#119)·사용자 직접(2FA) / 직접 main push 차단 → PR 경유
