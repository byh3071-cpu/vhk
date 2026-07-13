# scripts/archive — archive된 goal의 게이트 스크립트 보존소

> 출처: RFC 0058 T6 (check-goal 스크립트 부채 정리) · 이동일: 2026-07-13
> 원칙: **삭제 금지 — 감사 보존** (append-only 감사 원칙). `goals/archive/` 로 내려간 goal 의
> `check-goal-<id>.{mjs,sh}` 게이트를 여기로 이동해 `scripts/` 에는 활성 goal 게이트만 남긴다.

## 이동된 파일 (83개)

- `check-goal-<id>.mjs` × 80 — archive goal id: 0~49, 51~61, 63~64, 66~72, 74~78, 80~84
- `check-goal-<id>.sh` × 3 — id 0·1·2 (legacy POSIX 래퍼, 짝인 .mjs 와 함께 이동)

이동 시 내용 변경은 "이동으로 깨진 경로의 기계적 수정"만 — 검증 로직 무변경:

| 파일 | 수정 | 사유 |
|---|---|---|
| `check-goal-0/1/2/60.mjs` | `'./_lib.mjs'` → `'../_lib.mjs'` | 상대 import 이동 보정 |
| `check-goal-0/1/2/60.mjs` | 루트 고정 `resolve(HERE, '..')` → `'../..'` | 자기위치 기반 repo 루트 계산 이동 보정 |
| `check-goal-5.mjs` | 하위 게이트 실행 경로 `scripts/check-goal-N` → `scripts/archive/check-goal-N` | 함께 이동한 게이트 0~4 실행 |
| `check-goal-6.mjs` | `read('scripts/check-goal-5.mjs')` → `scripts/archive/...` | 상호참조 대상 함께 이동 |
| `check-goal-60.mjs` | `read('scripts/check-goal-${id}.mjs')` → `scripts/archive/...` | 상호참조 대상(34~38) 함께 이동 |

`read('scripts/_lib.mjs')`·`readdirSync('scripts')`(check-goal-53 ratchet) 등 cwd(레포 루트)
기준 경로는 대상이 `scripts/` 에 잔류하므로 수정 불필요 — 53의 잔류 게이트 집계는 이동 후
비율 0.63→0.25 로 상한(0.85) 아래 유지.

## scripts/ 에 잔류한 활성 goal 게이트 (21개)

id: 50, 62, 65, 73, 79, 85~100 (+ `check-goal-frontmatter.mjs` 는 goal 게이트가 아닌
전역 frontmatter 스키마 가드라 원래부터 이동 대상 아님).

## "검증 0 스캐폴드" 실측 (RFC 0058 §1 클러스터 G "27개 추정" 정정)

레포 자체 스텁 판정(SoT: `scripts/_lib.mjs` `isStubGate` — M.4 메타게이트가 쓰는 정의)으로
전수 실측한 결과 **스캐폴드는 5개뿐이며 전부 활성 goal 것**이라 이동하지 않고 목록만 남긴다:

| 파일 | goal 상태 | 비고 |
|---|---|---|
| `scripts/check-goal-50.mjs` | DEFERRED | 범용 게이트(typecheck+lint+test+build)만, 고유 검증 0 |
| `scripts/check-goal-62.mjs` | NOT_STARTED | 〃 (미착수 goal 이라 스캐폴드가 정상) |
| `scripts/check-goal-65.mjs` | NOT_STARTED | 〃 |
| `scripts/check-goal-73.mjs` | CANCELED | 〃 (goal 취소 — 게이트도 미충전) |
| `scripts/check-goal-79.mjs` | OBSERVING | 〃 |

- archive goal 게이트 83개는 전부 실질 검증 보유(스캐폴드 0) — "27개" 는 감사 시점(2026-07-05)
  이후 goal 85~100 게이트가 충전되며 해소됐거나 과대추정. 현행 실측이 SoT.
- 교차 측정(goal-drift 휴리스틱 = 고유 `must()` 호출 0): 8개 — 위 5개 + id 0/1/2
  (구식 수동 if 검증 게이트라 must 미사용일 뿐 실질 검증 있음 → 오탐).
- DONE 인데 스텁인 goal 은 0건 — M.4(`check-meta.mjs`) 가 계속 감시.

## 참조 깨짐 0 검증 (이동 전 전수 grep, 2026-07-13)

| 참조 지점 | 결과 |
|---|---|
| `vhk goal check/sync/drift` (`src/commands/goal.ts`·`src/lib/goal-drift.ts`) | `goals/`·`scripts/` 최상위만 스캔(비재귀) — archive goal id 를 자동으로 조회하지 않음 |
| `scripts/check-meta.{sh,mjs}` M.4 (`findCompletedStubGates`) | `goals/` 최상위만 스캔 — 영향 0 |
| CI (`.github/workflows/ci.yml:55`) | check-goal-* 미연결(NOTE 명시) — 영향 0 |
| tests | 전부 temp dir 픽스처. 실 디렉토리 스캔 2건(`meta-gate.test.ts:142`, `guard-behavior-migration.test.ts`)은 활성 잔류분만 계산 — ratchet 비율 0.63→0.25 (상한 0.85 이하) |
| `package.json`·eslint(`src` 한정)·check-no-stray(src/tests 한정)·check-no-raw-json-parse(src 한정) | 참조/스캔 없음 |
| 주석 참조(`src/commands/seo/submit.ts:23` check-goal-22, `tests/vhk-artifact-tracking.test.ts:14` check-goal-82) | 경로 아닌 이름 언급 — 해당 파일은 이 폴더에 보존됨 |

## 사용 노트

- archive goal 게이트를 다시 돌리려면: 레포 루트에서 `node scripts/archive/check-goal-<id>.mjs`
  (cwd = 레포 루트 필수 — 게이트가 `src/`·`goals/` 를 상대경로로 읽음).
  이동 후 실측: check-goal-6·60 PASS (경로 보정 검증).
- ⚠️ 일부 archive 게이트는 **작성 당시 트리 상태를 단언**해 현재 트리에선 실패할 수 있다 —
  이동과 무관한 기존 드리프트. 예: `check-goal-1` 은 `vhk goal list` 출력에 id 0/1/2 가
  있길 단언하는데, goal 0/1/2 카드가 `goals/archive/` 로 내려간 시점부터 성립 안 함.
  역사적 감사 기록으로 보존하는 것이지 현행 green 을 보증하지 않는다.
- `vhk goal check --id <archive된 id>` 는 "goal id 없음" 을 보고한다(카드가 `goals/` 최상위에
  없음 — 이동 전부터 동일). 필요하면 위처럼 직접 실행.
- `goals/archive/*.md` 카드 본문의 `scripts/check-goal-<id>` 경로 언급은 작성 당시 역사 기록
  (append-only)이라 수정하지 않는다.
