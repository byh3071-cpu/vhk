---
vhk_format: 1
type: goal
id: 13
title: vhk verify 증거화 (Evidence Ledger v0) — P1
status: NOT_STARTED
priority: P1
version: v1.7.0
---

# Goal 13: vhk verify 증거화 (Evidence Ledger v0)

> 설계 전문: `docs/superpowers/specs/2026-06-02-verify-evidence-design.md` (착수 시 작성)
> PRD 전문: 핸드오프 페이지 §5. 출처: 성장 루프(learning·pattern·evolve) 입력 데이터 토대.

## 배경
verify가 lite — 체크리스트 텍스트만 출력, 실제 실행·결과 저장 X (verify.ts 주석: "메타러너 자리 — 묶음 안내만(lite)"). 거짓완료를 잡을 증거가 안 남고, 성장 루프 입력이 없어 후속 기능 전부 막힘.

## 철학
① 결과는 실제 실행 신호에서만 — 거짓 PASS 금지 ② 성공·실패 무관 항상 증거 남김 ③ Windows 1급 ④ 기존 verify 시그니처 호환(옵션 추가만).

## 동작 (파일·계약)
- `src/commands/verify.ts`: 게이트(tsc / test:run / build / secure scan) 실제 실행 + 각 exit code 수집. CLI엔 한 줄 요약 + 파일 경로만 출력.
- `.vhk/reports/latest.json`: 항상 생성/갱신. 스키마 `{ schemaVersion, generatedAt, status(PASS|WARN|FAIL), summary, gates[], nextActions[] }` (head=기계용 / body=사람용).
- `--json` 옵션: 경로 대신 stdout JSON (CI용). 날짜=localDate(), 타임스탬프=UTC.
- 크로스플랫폼: execFile cmd.exe 래핑(CVE-2024-27980), maxBuffer 상향(ENOBUFS 거짓실패 방지).
- secret/env 값 latest.json 미포함 (.vhkignore 존중).

## Completion Check
- [ ] verify 실행 시 성공·실패 무관 latest.json 생성 + 스키마 통과
- [ ] 게이트별 실제 종료코드 기반 (파이프로 exit code 안 가림)
- [ ] test 일부러 깸 → status=FAIL + 해당 gate fail 기록 (거짓 PASS 회귀 가드)
- [ ] package.json scripts 없음 → skip+WARN (거짓 PASS 금지)
- [ ] HARD_STOP 존재 → 거부 + exit 1
- [ ] --json stdout 출력 + secret 누출 0 (vhk secure scan)
- [ ] vhk goal sync → check-goal-13.mjs 생성 → vhk goal check --id 13 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 540+ 회귀 0

## 제외 범위
- HTML 리포트(latest.html) → 배치 6
- vhk review 적대 검증 → 별도 goal
- 반복 패턴 감지 / evolve / pattern suggest → 배치 8+

## Mandatory Reading
- `src/commands/verify.ts` (현재 lite 구현)
- `goals/11-noninteractive-guard.md` (Windows cmd.exe 래핑 / .mjs 게이트 선례)
- 핸드오프 페이지 §5 PRD (상세 요구사항)
