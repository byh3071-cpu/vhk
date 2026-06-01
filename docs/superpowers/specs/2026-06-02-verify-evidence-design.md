# 설계 — vhk verify 증거화 (Evidence Ledger v0, Goal 13)

- **날짜:** 2026-06-02
- **goal:** 13 (P1, v1.7.0)
- **PRD:** 핸드오프 페이지 §5 / `goals/13-verify-evidence.md`
- **상태:** 설계 확정 → 구현 완료

## 1. 문제

`vhk verify` 가 lite — 체크리스트 텍스트만 출력하고 **실제 실행·결과 저장이 없다**
(verify.ts 구 주석: "메타러너 자리 — 묶음 안내만(lite)"). 결과:

- "테스트 없이 완료 선언" 같은 **거짓완료를 잡을 증거가 안 남는다.**
- 성장 루프(learning·pattern·evolve)의 **입력 데이터가 없어** 후속 기능이 전부 막힌다.
- 매 검증마다 사람이 결과를 눈으로 보고 옮기는 **수동 반복.**

## 2. 철학 (핵심)

1. **결과는 실제 실행 신호에서만** — 게이트 프로세스의 실제 종료코드로만 PASS/FAIL 판정. 거짓 PASS 금지.
2. **성공·실패 무관 항상 증거** — `vhk verify` 는 어떤 결과든 `.vhk/reports/latest.json` 을 쓴다.
3. **Windows 1급** — `.cmd` shim 은 `cmd.exe` 래핑(CVE-2024-27980), maxBuffer 상향(ENOBUFS 거짓실패 방지).
4. **기존 시그니처 호환** — 옵션(`--json`)만 추가. `verify()` 무인자 호출(nlp-run) 그대로 동작.

## 3. 동작 (계약)

### 3.1 게이트 4종

| id | 라벨 | 실행 방식 | pass 조건 |
| --- | --- | --- | --- |
| `typecheck` | `tsc --noEmit` | 외부(pm run typecheck → 없으면 tsconfig 있을 때 `pm exec tsc --noEmit`) | exit 0 |
| `test` | `test:run` | 외부(`test:run` → vitest `test -- --run` → `test`) | exit 0 |
| `build` | `build` | 외부(`pm run build`) | exit 0 |
| `secure` | `secure scan` | **in-process** `scanProjectForSecrets` | severe(critical/high) 0건 |

- 외부 게이트의 스크립트/설정이 없으면 **skip(WARN)** — 거짓 PASS 금지(돌리지 않은 걸 통과로 안 봄).
- `secure` 는 우리 스캐너라 in-process 실행 — **시크릿 본문은 리포트에 안 넣고 severe count 만** 기록(누출 0).
- 실행 자체 실패(ENOENT 등)는 **fail 로 기록**, 추측 금지.

### 3.2 상태 집계

`fail` 하나라도 → **FAIL** · 없고 `skip` 있으면 → **WARN** · 전부 `pass` → **PASS**.
`process.exitCode = FAIL ? 1 : 0` (WARN/PASS 는 0 — CI 가 skip 을 치명으로 안 보게).

### 3.3 `.vhk/reports/latest.json` 스키마

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-02T...Z",   // UTC ISO (머신용)
  "date": "2026-06-02",                // localDate (사람용)
  "status": "PASS",                    // PASS | WARN | FAIL
  "summary": { "total": 4, "pass": 4, "fail": 0, "skip": 0 },   // head(기계용)
  "gates": [ { "id","label","status","exitCode","skipped","detail?" } ],  // body(사람용)
  "nextActions": [ "..." ]
}
```

- 항상 생성/갱신(`mkdir -p .vhk/reports`). `reports/` 는 로컬 전용 → `.vhk/.gitignore` 등재(RFC 0038).
- `--json`: 경로 대신 리포트 JSON 을 stdout 으로(CI용). 다른 콘솔 출력 없음.
- CLI 기본: 게이트별 한 줄 + 상태 배지 + 파일 경로만(상세는 파일).

## 4. 컴포넌트 변경

| 파일 | 변경 |
| --- | --- |
| `src/commands/verify.ts` | lite → 증거화. `execGate`/`runGates`/`runSecureGate`/`aggregateStatus`/`buildReport`/`verifyEvidence`/`verify(opts)` 추가. `verificationChecklist` 보존(mode.test 호환). |
| `src/index.ts` | `verify` 에 `--json` 옵션 + opts 전달 |
| `.vhk/.gitignore` | `reports/` 자동 등재(`ensureVhkIgnored`) |

## 5. 테스트

- **순수 함수**: `aggregateStatus`(FAIL>WARN>PASS 우선), `buildReport`(스키마·summary 카운트), `buildNextActions`.
- **planning/gate**: `detectPm`(lockfile), `runGates`(temp 프로젝트 — 스크립트 유무 → pass/skip), `runSecureGate`(시크릿 0/유 → pass/fail, **리포트에 시크릿 본문 없음**).
- **거짓 PASS 회귀 가드**: test 게이트를 일부러 깬 temp 프로젝트 → `status=FAIL` + 해당 gate `fail`.
- **scripts 없음** → skip+WARN(PASS 아님).
- **증거 기록**: `verifyEvidence` 가 성공·실패 무관 `.vhk/reports/latest.json` 생성 + 스키마 통과.
- **--json**: stdout 에 리포트 JSON, secret 본문 0.
- **HARD_STOP**: 존재 시 `verify` 거부 + exitCode 1.

## 6. 제외 범위 (이번 아님)

- HTML 리포트(`latest.html`) → 배치 6 (`vhk verify --report`).
- 리포트 히스토리/타임스탬프 스냅샷 → RFC 0038 §7 미해결.
- `vhk review` 적대 검증 / 반복 패턴 감지 / evolve → 배치 8+.

## 7. 결정 기록

- **secure 는 in-process** (외부 `vhk secure scan` spawn 아님): 자기 CLI 의 서브커맨드를 자기가 spawn 하는 건
  느리고 dist 의존. in-process 가 실제 신호 + 시크릿 본문 미수집을 동시에 만족.
- **exitCode 매핑**: FAIL→1, WARN/PASS→0. WARN(=skip)을 치명으로 보면 게이트 미구비 프로젝트가 CI 에서
  항상 깨져 도입 장벽이 됨. skip 은 커버리지 경고지 실패가 아님.
- **시크릿 미포함**: gates 엔 id/label/status/exitCode/메타만. secure 는 count 만 → `.vhk/reports/latest.json`
  자체가 `vhk secure scan` 에 안 걸림(누출 0).
