---
vhk_format: 1
type: goal
id: 14
title: vhk verify --report (Human Panel HTML v0) — P2
status: NOT_STARTED
priority: P2
version: v1.7.1
---

# Goal 14: vhk verify --report (Human Panel HTML v0)

> 출처: Trust Loop 로드맵 배치 6. 전제: Goal 13(verify 증거화 / latest.json) 완료됨 (v1.7.0).
> 성장 루프에서 "증거 → 사람이 읽는 패널" 단계. 증거는 이미 latest.json에 있음 → 사람용 표면만 추가.

## 배경
Goal 13으로 `vhk verify`가 `.vhk/reports/latest.json`(기계용)을 항상 남기게 됐다. 하지만 비개발자·리뷰어가 JSON을 직접 읽긴 어렵다. 같은 증거를 **사람이 한눈에 보는 정적 HTML**로 렌더해 검증 결과를 설득력 있게 보여준다.

## 철학
① 새 증거 만들지 않음 — latest.json을 읽어 렌더만 (단일 진실원천 유지) ② 무빌드·무의존 — 외부 CDN/번들러 없이 인라인 정적 HTML ③ 오프라인 동작 ④ 기존 verify 동작 무손상 (옵션 추가만).

## 동작 (파일·계약)
- `vhk verify --report`: 최신 `.vhk/reports/latest.json`을 읽어 `.vhk/reports/latest.html` 생성.
  - latest.json이 없으면 verify를 1회 선실행해 생성한 뒤 렌더 (또는 명확한 안내 후 종료).
- `latest.html`: 인라인 CSS, 외부 의존 0. status 배지(PASS/WARN/FAIL) + 게이트별 결과 표 + nextActions + generatedAt.
- `--open`(선택): 생성 후 기본 브라우저로 열기 (비대화형/CI/MCP에서는 자동 스킵).
- 크로스플랫폼: 경로 조합 path.join, 쓰기 권한 없으면 친절 에러 + exit≠0.
- secret/env 값 미포함 (latest.json이 이미 미포함 — 그대로 렌더).

## Completion Check
- [ ] `vhk verify --report` → latest.json 읽어 latest.html 생성 (외부 의존 0)
- [ ] latest.json 없을 때 동작 정의대로 (verify 선실행 or 안내 종료)
- [ ] status=FAIL 리포트가 HTML에 FAIL로 정확히 렌더 (거짓 PASS 표시 회귀 가드)
- [ ] --open 비대화형/CI/MCP에서 자동 스킵 (TTY 없으면 안 엶)
- [ ] HTML에 secret 누출 0 (vhk secure scan)
- [ ] vhk goal sync → check-goal-14.mjs 생성 → vhk goal check --id 14 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 599 회귀 0

## 제외 범위
- 멀티 리포트 히스토리 뷰어 / 추세 그래프 → 배치 8+ (Evidence Ledger 확장)
- vhk review 적대 검증 → 별도 goal
- 서버·웹 대시보드 (정적 파일만)

## Mandatory Reading
- `src/commands/verify.ts` (Goal 13 verifyEvidence/buildReport — latest.json 스키마)
- `.vhk/reports/latest.json` 스키마: { schemaVersion, generatedAt, status, summary, gates[], nextActions[] }
- 핸드오프 페이지 §1 릴리즈 큐 (배치 6 위치)
