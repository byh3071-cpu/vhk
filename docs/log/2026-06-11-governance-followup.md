# 2026-06-11 — governance 후속 (feat/governance-followup-goals)

> 출처: governance 배치(#261·#263) dev log 의 "미수정(후속 기록)" 3건을 goal 로 승격·구현.

## 기안 — goal 카드 3장 + 게이트 백필

- goal 63(P1): `vhk sync --check` — 8타겟 drift 검사 내장(검사기의 drift 원천 차단).
- goal 64(P1): COMMANDS.md 전 명령 문서화 + registry 기반 게이트 + --strict 승격.
- goal 65(P2·조건부): pre-commit L2 — **착수 트리거(우회 실측) 미충족, 기안만**.
  트리거·판정 방법을 카드에 명문화(ADR-001 §결과 이행). 조건 전 IN_PROGRESS 금지.
- `vhk goal sync` 로 check-goal-62~65 스캐폴드 백필 + goals/README 재생성(66건).

## Goal 63 — vhk sync --check (구현 완료)

- `syncCheck(rootDir)` 순수 함수: **buildSyncPlan 재사용**(생성 로직과 동일 경로) →
  drifted(존재+내용 다름) / missing(파일 없음) 분리. 쓰기 0.
- `sync --check` CLI 분기: drift 시 `process.exitCode = 1`(MCP 규칙 process.exit 금지
  준수 — exitCode 대입은 프로세스 비종료). RULES.md 없으면 비적용 통과.
- ko.ts 메시지 5종(checkPass/Drift/Missing/Fail/NoRules) + index.ts `--check` 옵션.
  신규 "명령"이 아니라 기존 sync 의 옵션 — 4지점 등록 비대상(별칭·NL 라우팅 기존 유지).
- 테스트 7(tmpdir 픽스처): 동기화 ok / 타겟 변조 / RULES 변경 / 타겟 삭제 / CLAUDE 블록
  변조 / CRLF-only 비drift(normalizeForCompare 보존) / 무쓰기 검증.
- 라이브 e2e 3단: 정상 exit 0 → .cursorrules 변조 exit 1 → 복구 exit 0.
- check-goal-63 게이트: 바인딩 단언(syncCheck export·buildSyncPlan 재사용·exitCode·
  --check 등록·ko 메시지·테스트 존재) + `vhk sync --check` 라이브 실행.
- README 사용법 1줄(+CI/게이트 용도 설명). COMMANDS.md 행은 goal 64 전수 작업에서.
