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

## Goal 64 — COMMANDS.md 커버리지 (구현 완료)

- **SoT 강제 = tests/commands-doc.test.ts**: 명령 우주를 command-registry.ts
  (TOP_LEVEL_COMMANDS 53 + CONTAINER_SUBCOMMANDS)에서 유도 — governance v0 게이트의
  파일명 휴리스틱 한계(과대집계·미커버) 해소. test:run 포함이라 CI 자동 강제 =
  "--strict 승격"의 실체(별도 플래그 불요).
- COMMANDS.md: **전체 명령 카탈로그 표 54행**(registry desc 1:1) + 상세 섹션 보강
  (memory remove/resolve/unarchive/eval · design palette · pattern detect ·
  evolve suggest/apply/reject · seo 5종). 내부 구현 파일(verify-report·memory-eval)은
  독립 명령 아님 명시.
- 검증: 신규 테스트 미등장 0건 + 구 보조 게이트 --strict 49/49 PASS(이중 확인).
  check-commands-doc.mjs 는 보조 리포트로 격하(헤더 주석).
- 교훈: 게이트 채우면 goal 43 드리프트 가드가 "구현됐는데 NOT_STARTED"를 잡고,
  `vhk goal done` 은 게이트 안 test:run 이 그 드리프트 테스트를 포함해 닭-달걀 —
  배치에선 frontmatter 직접 DONE 전이 + 전체 green 확인이 관례(63·64 동일).
