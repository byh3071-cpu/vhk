---
rfc: 0066
title: Permission levels and risk based approval design
status: Draft
created: 2026-08-13
updated: 2026-08-13
relates: ADR-009, ADR-011, RFC 0054, RFC 0067
covers: 작업 단위 124
---

# RFC 0066 — 권한 단계 + 위험도별 승인 규칙 설계

> **상태: Draft — 오너 결정(2026-08-13)으로 구현 조기 착수.**
> 단 **`enforce` 활성화는 관찰 게이트 통과 후** — 코드는 전부 기본 off로만 들어간다.
> **예외 하나:** §7.3의 설정 보호 조치(`.gitignore`·공개 경계·`PATH_RULES` 등재와 해시
> 베이스라인)는 `enforce`와 무관하게 **항상 동작한다.** 스위치를 지키는 자물쇠가 스위치에
> 딸려 있으면 자물쇠가 아니다.
> 게이트 조건은 그대로다: 4주 AND 유효 실행 10회 + 사람 승인.
> 이 문서의 파일 경로·타입·명령 이름은 **제안**이며 첫 커밋 직전에 재확인한다.

> 이 RFC는 [작업 단위 124](../roadmap/2.x-roadmap.md)의 T1~T4에 1:1 대응한다.
> 작업 정의의 원본은 로드맵, 수용 기준의 원본은 [PRD 2.x](../PRD-2.x.md) §6-5다.
> 용어는 [ADR-011](../adr/ADR-011-terminology.md) 대응표를 따른다.

> **개정 이력**
>
> - **2026-08-13 (1차 적대 검증)** §4.3(전이 트리거)·§4.5(CAS)·§5.3(혼합 커밋)·§7(설정 보호·
>   부작용 정의) 재작성.
> - **2026-08-13 (2차 적대 검증)** §7.3을 **위협 모델**로 재구성했다 — 1차 수정의 `.gitignore`
>   등재와 `PATH_RULES` 등재가 서로를 무효화했고(gitignore된 파일은 `git diff`에 안 나타난다),
>   런 도중 해시 비교만으로는 런과 런 사이의 편집을 놓쳤다. **런 밖 영속 해시 베이스라인**을
>   도입하고 "차단이 아니라 무흔적 변조 방지"라는 목표를 명시했다. §5.2에 커밋 게이트의 경로
>   집합을 정의하고, "동작 불변" 문구를 "기존 경로의 분류 결과 불변 + additive 예외"로 정정했다.
>
> 변경 사유는 각 절에 인라인으로 남긴다.

---

## 0. 요약

작업 단위 110이 만든 **3중 판정**(검증 통과 + 검증 리포트 유효 + 사람 개입 0)을 입력으로,
"이 저장소의 자율 실행에 지금 어느 정도 권한을 줄 수 있는가"를 **계산만** 한다.

```text
autonomy-run.jsonl ─┐
                    ├─▶ 3중 판정(110, 기존)──▶ 권한 단계 판정(신규·순수)──▶ 출력만
receipt-log.jsonl ──┘                      └─▶ 위험도 분류(신규·순수)──▶ 출력만

                       활성화 플래그가 있을 때만: ──▶ policy-decision.jsonl 기록
                       실제 집행: 이 RFC 범위 밖 (작업 단위 126 이후)
```

핵심 결정 네 가지.

| # | 결정 |
|---|---|
| 1 | 권한 단계는 **저장하지 않는다.** 기존 원장에서 매번 재계산하는 파생값이다 |
| 2 | 단계 전이는 **자율 런 종결 이벤트에서만** 일어난다. 조회 명령은 전이를 만들지 않는다 |
| 3 | 위험도는 신규 분류 체계를 만들지 않고 기존 `TaskKind`를 두 갈래로 접되, **미분류가 섞이면 `human`** |
| 4 | 활성화 플래그가 없으면 **원장 기록도 하지 않는다.** 판정은 순수 계산이라 항상 가능하다 |

---

## 1. 목표와 비목표

### 목표

- 110의 3중 판정 집계를 권한 단계로 접는 **결정론적 순수 함수**를 정의한다.
- 작업 유형을 자동 허용과 사람 필수 두 갈래로 접는 규칙을 정의한다(ADR-009 ③).
- 승급·축소 전이를 남길 **기록 스키마**를 정의한다. 이 스키마는 [RFC 0067](0067-command-allowlist-budget-design.md)이 그대로 재사용한다.
- 활성화 플래그가 없을 때 파일 변경·외부 호출·쓰기 스폰이 0임을 설계로 보장한다(124-T4).
- 기존 명령·`.vhk` 포맷·MCP 시그니처를 하나도 바꾸지 않는다.

### 비목표

- 실행. 이 작업 단위는 명령을 돌리지 않는다(실행 레인은 작업 단위 126).
- 머지·배포·발행 경로. ADR-009 ②의 상한은 push + PR이고, 이 RFC는 그보다 앞단이다.
- 권한 단계를 근거로 사람 확인을 **건너뛰는** 경로. 단계는 상한만 낮추고 올리지 않는다.
- 자기 보고를 판정에 넣는 것. 110의 전제(자기 보고는 카운터 자격이 없다)를 그대로 상속한다.
- MCP 노출. 검증 계층 MCP 노출은 2.17 종료 후로 이연돼 있다.
- 신규 원장 마이그레이션. 기존 원장 라인은 한 줄도 고치지 않는다.

---

## 2. 입력 — 110의 3중 판정 재사용 (124-T1의 전제)

이미 존재하는 계산을 다시 만들지 않는다. 입력은 아래 하나다.

| 입력 | 원본 | 이 RFC의 사용 |
|---|---|---|
| 자율 런 이벤트 | `.vhk/events/autonomy-run.jsonl` | 직접 읽지 않음 — 아래 집계를 통해서만 |
| 기계 판정 영수증 | `.vhk/events/receipt-log.jsonl` | 직접 읽지 않음 — 아래 집계를 통해서만 |
| **3중 판정 집계** | `calcAutonomyStats()` | 권한 단계 판정의 **유일한** 입력 |
| 작업 유형 | `deriveTaskKindDetailed()` (신규·additive) | 위험도 분류의 유일한 입력 |

집계에서 쓰는 필드는 다음으로 한정한다.

| 필드 | 형식 | 판정에서의 역할 |
|---|---|---|
| `judgedRuns` | number | 표본 크기 + **전이 트리거 조건**(§4.4 1단계) |
| `rollingFailures` | number \| null | 최근 10회 실패 수. `null`은 표본 부족 |
| `demotionTriggered` | boolean \| null | 축소 트리거(110-T4) |
| `infraAbuseSuspected` | boolean | 자기 보고 남용 의심 — 승급 차단 신호 |
| `rollingSelfReportedOnly` | number | **신규 additive.** 최근 창 안의 자기 보고 격차(§4.4) |
| `unjudgeable` | number | 구형 라인. 분모·분자 밖이므로 판정에 쓰지 않고 표시만 |

`selfReportedOnly`(전기간 누적)를 쓰지 않는 이유는 §4.4에 있다.

### 2.1 선행 리팩터 — 계산기의 위치 (구현 승인 후 124의 첫 커밋)

`calcAutonomyStats()`는 지금 `src/commands/stats.ts`에 있다. 커맨드 계층이다.
권한 판정 모듈이 이것을 import하면 `lib → commands` 역방향 의존이 생긴다.

| 항목 | 내용 |
|---|---|
| 이관 대상 | `calcAutonomyStats` · `AutonomyStats` · `groupRuns` · `isVerifiedComplete` · `ROLLING_WINDOW` · `DEMOTION_FAILURE_THRESHOLD` · `INFRA_ABUSE_RATIO` · `INFRA_RATIO_MIN_SAMPLE` · `RunOutcome` |
| 목적지 | `src/lib/autonomy-stats.ts` (신규) |
| 호환 | `src/commands/stats.ts`는 같은 이름으로 re-export만 남긴다. 공개 표면과 출력은 불변 |
| additive | 같은 커밋에서 `AutonomyStats`에 optional `rollingSelfReportedOnly`를 추가한다(§4.4) |
| 검증 | 기존 `tests/stats*.test.ts`가 무수정으로 통과해야 한다 |
| 위험 | 순수 함수 이동이라 낮음. 단 이 변경 자체는 `TaskKind` 규칙상 `source`로 분류된다 |

`groupRuns`·`isVerifiedComplete`는 현재 파일 안의 비공개 함수다. 이관하면서 export하되,
판정 계약의 원본이 두 곳으로 갈리지 않도록 `stats.ts`에는 재정의를 남기지 않는다.

이 리팩터는 124의 첫 커밋이며, 다른 변경과 섞지 않는다.

---

## 3. 공유 기록 스키마 (124-T3 · RFC 0067이 참조)

> 로드맵 §4가 "2.15.0은 직렬(124 → 125), 충돌 지점은 **같은 기록 스키마**"라고 적은 그 스키마다.
> 여기서 한 번 정의하고, RFC 0067은 **봉투를 바꾸지 않고 변형별 필드만** 추가한다.

### 3.1 왜 새 원장인가

| 후보 | 판정 |
|---|---|
| `ai-actions.jsonl` 확장 | 부적합. 이것은 CLI 가드 chokepoint의 행동 로그다. 판정만 하고 실행하지 않는 레코드를 섞으면 `ran: false`의 의미가 두 가지가 된다 |
| `autonomy-run.jsonl` 확장 | 부적합. 런 단위 원장이고 111-T1이 이미 `RunEvent \| MorningObservation` 두 타입을 얹었다. 세 번째 축을 얹으면 완주율 집계 입력 계약이 흐려진다 |
| **신규 `policy-decision.jsonl`** | **채택.** 이 저장소의 관례는 관심사별 별도 원장이다(action·autonomy·receipt·cost). 판정 원장은 네 번째 관심사다 |

경로와 상수 제안.

```ts
// src/lib/policy-log.ts (신규)
export const POLICY_LOG_PATH_REL = join('.vhk', 'events', 'policy-decision.jsonl')
export const POLICY_SCHEMA_VERSION = 1
```

`.vhk/events/*.jsonl`은 이미 `.gitignore`에 있고, `.vhk/events/`는
`scripts/check-public-boundary.mjs`의 `PRIVATE_TRACKED_PATHS`에도 있다.
새 원장이 그 아래 들어가므로 공개 경계 설정 변경이 필요 없다.
**설정 파일 `.vhk/policy.json`은 사정이 다르다 — §7.3을 반드시 같이 본다.**

### 3.2 공통 봉투 `PolicyDecisionV1`

모든 라인이 공유하는 필드다. 판별자는 `kind`. **RFC 0067은 이 봉투에 필드를 추가하지 않는다.**

| 필드 | 형식 | 규칙 |
|---|---|---|
| `schemaVersion` | number | 항상 `1`. 없는 라인은 손상으로 보고 skip |
| `ts` | string | UTC ISO. 기계용 정확 시각 |
| `kind` | `'level' \| 'risk' \| 'allowlist' \| 'budget'` | 닫힌집합. `level`·`risk`는 이 RFC, `allowlist`·`budget`은 RFC 0067 |
| `verdict` | `'allow' \| 'require-human' \| 'deny'` | 판정 결과. 세 값만 |
| `reasonCode` | string | 안정적인 닫힌집합 코드. **사람 문장·원문 금지** |
| `runId` | string? | 있으면 `autonomy-run.jsonl`과의 조인 키 |
| `sha` | string \| null? | 판정 시점 HEAD 전체 SHA. git 아님·커밋 0이면 `null` |
| `taskKind` | TaskKind? | 기계 유도값만. 에이전트 신고값을 넣지 않는다 |

`reasonCode`를 문자열 코드로 고정하는 이유는 RFC 0065 §5.3의 `Diagnostic`과 같다.
원문·예외 메시지·경로를 원장에 넣으면 공개 경계가 원장 라인마다 새로 생긴다.

> **초안에 있던 `enforced` 필드는 제거했다.** off 상태에서는 라인이 아예 기록되지 않으므로
> 이 필드는 항상 `true`인 죽은 값이었다(§7). 죽은 필드는 나중에 "false도 있나 보다"라는
> 오독을 만든다.

### 3.3 `kind: 'level'` — 권한 단계 전이 (124-T3)

| 필드 | 형식 | 규칙 |
|---|---|---|
| `from` | PermissionLevel \| null | 직전 라인의 `to`. 최초 라인은 `null` |
| `to` | PermissionLevel | 이번 계산 단계 |
| `transition` | `'init' \| 'promote' \| 'demote' \| 'hold'` | `from`·`to`에서 유도되지만 조회 편의를 위해 명시 |
| `judgedRuns` | number | **전이 근거 표본 수. 다음 판정의 CAS 기준값이다**(§4.5) |
| `rollingFailures` | number \| null | 최근 창의 실패 수 |
| `window` | number | 롤링 창 크기. `ROLLING_WINDOW` 값을 그대로 |

예시(값은 전부 가짜다).

```json
{
  "schemaVersion": 1,
  "ts": "2026-09-01T21:00:00.000Z",
  "kind": "level",
  "verdict": "allow",
  "reasonCode": "PROMOTE_ROLLING_CLEAN",
  "runId": "sample-run-id",
  "sha": "sample-sha",
  "from": "L1",
  "to": "L2",
  "transition": "promote",
  "judgedRuns": 12,
  "rollingFailures": 1,
  "window": 10
}
```

### 3.4 `kind: 'risk'` — 위험도 판정 (124-T2)

| 필드 | 형식 | 규칙 |
|---|---|---|
| `riskClass` | `'auto' \| 'human'` | 두 갈래만 |
| `unclassifiedPaths` | number | **미분류 경로 수.** 1 이상이면 `riskClass`는 반드시 `human`(§5.3) |
| `derivedFrom` | `'paths' \| 'none'` | `paths`는 커밋 diff에서 유도. `none`이면 범위를 못 구한 것이고 `human` 고정 |

### 3.5 읽기·쓰기 계약

`action-ledger.ts`의 계약을 그대로 따른다. 발명하지 않는다.

| 항목 | 계약 |
|---|---|
| 쓰기 | append-only · dedup 없음 · `appendFileSync` O(1) |
| 읽기 | BOM-safe · 손상 라인은 관용적 skip · `schemaVersion !== 1` 라인도 skip |
| 동시성(라인) | 한 줄 단위 원자적 append. lost-update 없음 |
| 동시성(상태) | **append 원자성은 상태 갱신 원자성이 아니다** — `kind: 'level'` 라인은 §4.5의 CAS 규칙을 추가로 지킨다 |
| 크기 | 회전·정리 없음. 이번 계열에서는 다루지 않는다(§11 Q4) |

---

## 4. 권한 단계 (124-T1)

### 4.1 단계 정의

단계는 **무엇을 허용하는가의 상한**이다. 낮은 단계가 높은 단계의 부분집합이다.

| 단계 | 이름 | 상한 |
|---|---|---|
| `L0` | 관찰 | 읽기만. 파일 변경 0 |
| `L1` | 제안 | 작업 트리 변경까지. 커밋 없음 |
| `L2` | 커밋 | 로컬 커밋까지. push 없음 |
| `L3` | 제출 | push + PR까지. **머지 없음 — 이것이 절대 상한이다** |

`L3`가 상한인 근거는 ADR-009 ②다. `L4`는 정의하지 않는다.
"자동 머지 활성화"는 로드맵 §8에서 이번 계열 밖으로 명시 제외돼 있다.

### 4.2 안전 모드와의 구분 — 다른 축이다

기존 `SafetyMode`(lite / standard / strict)와 혼동하면 안 된다.

| 축 | 무엇을 정하나 | 누가 정하나 | 대상 |
|---|---|---|---|
| `SafetyMode` | 위험 작업을 만났을 때의 **가드 강도**(warn / confirm / preview) | 사람이 `vhk mode`로 직접 | 사람이 부른 명령 |
| `PermissionLevel` | 자율 실행이 **어디까지 갈 수 있는가**의 상한 | 원장에서 기계가 계산 | 자율 런 |

둘은 곱해진다. 낮은 쪽이 이긴다. 한 축이 다른 축을 완화하는 경로는 만들지 않는다.

### 4.3 전이 트리거 — 조회로는 승급하지 않는다

> **적대 검증 지적(치명 3)으로 재작성한 절이다.** 초안은 전이 트리거를 명시하지 않아
> `vhk policy level`을 세 번 부르면 `L1 → L2 → L3`로 올라가는 경로가 열려 있었다.
> 자율 런이 자기 권한을 조회만으로 올릴 수 있으면 판정 전체가 무의미하다.

전이는 두 조건을 **모두** 만족할 때만 일어난다.

| 조건 | 내용 |
|---|---|
| 호출 지점 | **자율 런 종결 이벤트 기록 직후**에만 판정 함수가 append 경로로 호출된다 |
| 표본 증가 | `stats.judgedRuns > 직전 level 라인의 judgedRuns` — 판정 대상 런이 실제로 하나 이상 늘었다 |

`vhk policy level` · `risk` · `show`는 **같은 순수 함수를 부르지만 결과를 출력만 한다.**
조회 경로에는 append 호출 자체가 없다. 이것은 관례가 아니라 모듈 경계로 강제한다 —
`src/commands/policy.ts`는 `policy-log.ts`의 append 함수를 import하지 않는다(§10.7 테스트).

### 4.4 판정 알고리즘 (의사코드)

```text
입력: stats      (3중 판정 집계)
      config     (사람이 설정한 상한)
      last       (원장의 마지막 kind:'level' 라인 · 없으면 null)
출력: { level, transition, reasonCode }

LEVELS  = [L0, L1, L2, L3]
clamp(x) = max(L0, min(L3, x))          # 하한·상한 둘 다 고정
ceiling  = config.maxLevel ?? L3         # 사람은 낮출 수만 있다

# 0) 신규 진입 — 원장에 level 라인이 없다
if last == null:
    return { level = clamp(min(L1, ceiling)), transition = init,
             reasonCode = LEDGER_EMPTY }

previous = last.to

# 1) 전이 트리거 — 판정 대상 런이 늘지 않았으면 아무 일도 없다 (치명 3)
if stats.judgedRuns <= last.judgedRuns:
    return { level = previous, transition = hold,
             reasonCode = NO_NEW_JUDGED_RUN }

# 2) 표본 부족 — 유지한다. 하강시키지 않는다 (중대 15)
#    초안은 여기서 min(L1, ceiling)을 반환해 L3 에서 L1 으로 두 칸 떨어졌다.
#    "한 번에 한 칸"과 정면으로 모순이었다. 표본이 없다는 것은 나쁜 소식이 아니라 무소식이다.
if stats.rollingFailures == null:
    return { level = clamp(min(previous, ceiling)), transition = hold,
             reasonCode = INSUFFICIENT_SAMPLE }

# 3) 축소가 승급보다 먼저다 — 순서를 바꾸면 실패 중에도 승급이 난다
if stats.demotionTriggered == true:          # 최근 10회 중 3회 이상 실패
    return { level = clamp(min(previous - 1, ceiling)), transition = demote,
             reasonCode = DEMOTE_ROLLING_FAILURES }

# 4) 승급 차단 신호 — 하나라도 켜지면 유지
if stats.infraAbuseSuspected:              blockers += INFRA_ABUSE_SUSPECTED
if stats.rollingSelfReportedOnly > 0:      blockers += SELF_REPORT_GAP
if blockers not empty:
    return { level = clamp(min(previous, ceiling)), transition = hold,
             reasonCode = blockers[0] }      # 첫 신호만 기록

# 5) 승급 — 창이 충분히 깨끗할 때만 한 칸
if stats.rollingFailures <= PROMOTION_FAILURE_MAX:
    return { level = clamp(min(previous + 1, ceiling)), transition = promote,
             reasonCode = PROMOTE_ROLLING_CLEAN }

# 6) 그 사이 — 히스테리시스 구간
return { level = clamp(min(previous, ceiling)), transition = hold,
         reasonCode = HOLD_HYSTERESIS }
```

`clamp`는 하한 `L0`과 상한 `L3`을 둘 다 고정한다. `previous - 1`이 `L0` 아래로 내려가는 경로,
`previous + 1`이 `L3` 위로 올라가는 경로가 코드에 없어야 한다.

**`rollingSelfReportedOnly`가 롤링인 이유(중대 15).** `AutonomyStats.selfReportedOnly`는
전기간 누적이다. 축소는 롤링 창 기준인데 승급 차단만 전기간이면, 한 번의 자기 보고 격차가
영구 승급 봉쇄가 된다. 두 신호의 시간 축을 맞춘다 — 최근 `ROLLING_WINDOW` 판정 런 안의
격차만 센다. 이 필드는 §2.1 이관 커밋에서 optional로 추가한다.

### 4.5 원장 갱신의 원자성 — 마지막 라인 CAS

> **적대 검증 지적(중대 15)으로 신설한 절이다.** append 한 줄의 원자성은 보장되지만,
> "읽고 → 계산하고 → 쓰는" 사이에 다른 세션이 끼어드는 것은 막지 못한다.
> 병렬 worktree 두 개가 동시에 종결하면 같은 `previous`를 읽어 둘 다 승급을 쓴다.

`kind: 'level'` 라인은 append 직전에 다음을 확인한다.

```text
1. 판정을 시작할 때 읽은 마지막 level 라인을 base 로 기억한다
2. append 직전에 원장 끝을 다시 읽는다
3. 마지막 level 라인이 base 와 동일(같은 ts + 같은 to + 같은 judgedRuns)하면 append
4. 다르면 append 하지 않고 재계산한다. 재시도 상한 도달 시 CAS_CONFLICT 로 기록 없이 종료
```

이것은 완전한 잠금이 아니다. 파일 잠금 없이 마지막 라인만 비교하는 낙관적 방식이라
극단적 경합에서는 여전히 창이 남는다. 완전한 상호배제는 이번 계열 범위 밖이고,
`vhk worktree` 계열이 이미 병렬 세션을 다른 방식으로 다루고 있다.
여기서 막으려는 것은 **흔한 사고**(밤에 런 두 개가 몇 초 차이로 끝남)다.

`kind: 'risk' | 'allowlist' | 'budget'` 라인은 상태 갱신이 아니라 관측 기록이므로 CAS가 없다.

### 4.6 임계값 — 새 임의값을 만들지 않는다

| 상수 | 값 | 출처 |
|---|---|---|
| `ROLLING_WINDOW` | 10 | 기존. 110-T4와 관찰 게이트가 공유하는 창 |
| `DEMOTION_FAILURE_THRESHOLD` | 3 | 기존. 110-T4 "최근 10회 중 3회" |
| `PROMOTION_FAILURE_MAX` | **1** | **신규 — 유일한 새 상수** |

`PROMOTION_FAILURE_MAX = 1`의 근거는 진동(flapping) 방지다.
관찰 게이트의 통과선은 "실패 2회 이하"이고 축소선은 "3회 이상"이다.
승급선을 통과선과 같은 2로 두면 실패 2건과 3건 사이를 오갈 때 매 런마다 승급·축소가 번갈아 난다.
승급 ≤1 / 유지 =2 / 축소 ≥3으로 한 칸을 비워 히스테리시스를 만든다.

한 번의 판정에서 단계는 **최대 한 칸**만 움직인다. 두 칸 이동 경로는 어디에도 없다.

### 4.7 상태를 저장하지 않는다

권한 단계는 `.vhk/config.json`에 저장하지 않는다. 파생 스냅샷이 원본이 되는 것을 막는다.

| 항목 | 처리 |
|---|---|
| 현재 단계 | 원장의 마지막 `level` 라인의 `to` |
| 원장이 비었을 때 | `L1`(제안)에서 시작 — §11 Q1 기본값 채택 |
| 사람이 정하는 것 | `.vhk/policy.json`의 `maxLevel` — **하향만** 가능 |

원장이 통째로 사라지면 단계는 `L1`로 돌아간다. 이것은 결함이 아니라 fail-closed다.
"과거 로컬 진행 상태는 복구된 것으로 추측하지 않고 unknown으로 돌아간다"는 CLAUDE.md 규율과 같다.

---

## 5. 위험도 분류 (124-T2)

### 5.1 새 분류 체계를 만들지 않는다

`src/lib/task-kind.ts`가 이미 7종 닫힌집합을 갖고 있고, 그 파일의 주석이 이 작업 단위를 명시 예고한다.

> ADR-009 ③이 chore·docs·deps를 자동 허용 후보로 지정해 놓았으므로(작업 단위 124),
> 스키마 변경을 chore로 신고하면 승인 경계를 우회할 수 있다.
> → 유형은 변경된 파일 경로에서 유도하고, 에이전트 신고는 힌트로만 받는다.

따라서 위험도는 **`TaskKind`를 두 갈래로 접는 순수 매핑**이다.

| `TaskKind` | `RiskClass` | 근거 |
|---|---|---|
| `chore` | `auto` | ADR-009 ③ 자동 허용 |
| `docs` | `auto` | ADR-009 ③ 자동 허용 |
| `deps` | `auto` | ADR-009 ③ 자동 허용 (§11 Q2 재검토 대상) |
| `source` | `human` | ADR-009 ③이 자동 허용으로 지정하지 않음 → fail-closed |
| `schema` | `human` | ADR-009 ③ 사람 필수 |
| `security` | `human` | ADR-009 ③ 사람 필수 |
| `unknown` | `human` | 유도 실패. 낙관 추정 금지 |

`auto`는 "사람 없이 진행 가능"이 아니라 **"이 단계에서 상한을 낮추는 추가 사유가 없다"**는 뜻이다.
`human`은 권한 단계가 무엇이든 **사람 확인 없이 넘어가지 않는다.**

### 5.2 단계 × 위험도 매트릭스

```text
                 riskClass = auto        riskClass = human
L0 관찰          읽기만                   읽기만
L1 제안          작업 트리 변경까지        판정만 + 사람 확인 필요
L2 커밋          로컬 커밋까지            판정만 + 사람 확인 필요
L3 제출          push + PR까지            판정만 + 사람 확인 필요
```

`human` 열이 단계와 무관하게 같다는 점이 이 표의 전부다.
**권한 단계는 `human` 위험도를 절대 완화하지 않는다.** 단계가 올라가면 `auto` 열만 넓어진다.

이 매트릭스가 적용되는 지점은 **커밋·push 같은 런 종결 행위**다.
개별 명령 실행 전 검사(RFC 0067 §4)에는 적용하지 않는다 — 근거는 그쪽 문서에 있다.

**어느 경로 집합으로 판정하는가.** 게이트마다 대상이 다르므로 명시한다.

| 게이트 | 경로 집합 | 빈 목록일 때 |
|---|---|---|
| 커밋 직전 | `git diff --cached --name-only` — **스테이징된 목록** | `unknown` → `human`. 바꿀 게 없는데 커밋하려는 것은 정상 상태가 아니다 |
| push 직전 | 이번 push에 포함될 커밋 범위의 변경 경로 | `unknown` → `human` |
| 런 종결 기록 | 기존 `deriveRunTaskKind()` 그대로(start SHA → HEAD) | 기존 동작 불변 |

커밋 게이트에서 작업 트리 전체(`git diff --name-only`)가 아니라 **스테이징 목록**을 쓰는 이유는,
실제로 커밋될 것만이 판정 대상이기 때문이다. 스테이징하지 않은 파일까지 세면
관련 없는 로컬 변경 하나가 모든 커밋을 `human`으로 만든다.

세 게이트 모두 §5.3의 미분류 규칙을 그대로 적용한다.

### 5.3 혼합 커밋 — 미분류가 섞이면 `human` (재작성)

> **적대 검증 지적(치명 1)으로 뒤집은 절이다.** 초안은 "`deriveTaskKind()`가 이미
> 위험도 최댓값을 돌려주므로 fail-closed"라고 적었다. **코드와 반대다.**

`src/lib/task-kind.ts`의 `RISK_ORDER`에는 `unknown`이 들어 있지 않다.

```ts
const RISK_ORDER = ['chore', 'docs', 'deps', 'source', 'schema', 'security']  // unknown 없음
```

`deriveTaskKind()`는 각 경로의 순위를 `RISK_ORDER.indexOf()`로 구하는데,
`unknown`은 `-1`이라 **어떤 분류된 유형에도 진다.** 결과는 이렇다.

| 입력 | `deriveTaskKind` 결과 | 초안이 주장한 것 | 실제 위험도 |
|---|---|---|---|
| `['docs/a.md']` | `docs` | `auto` | `auto` — 맞음 |
| `['docs/a.md', 'Dockerfile']` | **`docs`** | `auto` | **`auto` — 틀림** |
| `['Dockerfile']` | `unknown` | `human` | `human` — 맞음 |

두 번째 행이 구멍이다. `Dockerfile`은 어떤 `PATH_RULES`에도 안 걸려 `unknown`이 되는데,
문서 파일 하나가 같이 있으면 런 전체가 `docs` = `auto`로 통과한다.
컨테이너 정의·CI 보조 파일·확장자 없는 스크립트가 전부 이 경로로 샌다.

**규칙을 다시 쓴다.**

> 변경 경로 중 **미분류(`unknown`)가 하나라도 있으면 `riskClass`는 `human`이다.**
> 최댓값 유형이 무엇이든 상관없다.

`deriveTaskKind()`의 시그니처·동작은 **바꾸지 않는다.** 기존 호출부(`src/commands/agent.ts`)가
원장에 쓰는 `taskKind` 값의 의미가 달라지면 과거 라인과 비교가 깨진다.
대신 additive 함수를 하나 더 둔다.

```ts
// src/lib/task-kind.ts 에 추가 (기존 export 무변경)
export interface TaskKindBreakdown {
  kind: TaskKind          // deriveTaskKind 와 동일한 값
  total: number           // 검사한 경로 수
  unclassified: number    // classifyPath 가 'unknown' 을 준 경로 수
}
export function deriveTaskKindDetailed(paths: readonly string[]): TaskKindBreakdown
```

위험도 판정은 이 함수만 쓴다.

```text
riskClass(breakdown):
    if breakdown.total == 0:          return human   # 범위를 못 구했다
    if breakdown.unclassified > 0:    return human   # 미분류가 섞였다 (치명 1)
    return RISK_MAP[breakdown.kind]                  # §5.1 표
```

`unclassifiedPaths`는 §3.4에 따라 원장에 기록한다.
실측에서 이 값이 계속 1 이상이면 `PATH_RULES`에 빠진 패턴이 있다는 뜻이고,
그때는 규칙을 넓히지 말고 **왜 빠졌는지를 먼저 본다** — 넓히는 순간 다시 낙관 추정이 된다.

---

## 6. 모듈 경계 (제안)

### 신설

| 경로 | 책임 | 부작용 |
|---|---|---|
| `src/lib/autonomy-stats.ts` | 3중 판정 집계 이관(§2.1) | 없음 (순수) |
| `src/lib/permission-level.ts` | 단계 정의 · 전이 판정 · clamp | 없음 (순수) |
| `src/lib/risk-class.ts` | `TaskKindBreakdown` → `RiskClass` · 단계×위험도 매트릭스 | 없음 (순수) |
| `src/lib/policy-config.ts` | `.vhk/policy.json` 로더 | 읽기만 |
| `src/lib/policy-log.ts` | `policy-decision.jsonl` 읽기 · CAS append | 쓰기 — **`enforce`일 때만 호출** |
| `src/commands/policy.ts` | `vhk policy` 커맨드 | 출력만. **append 함수 import 금지** |

### 수정 — additive만

| 경로 | 변경 |
|---|---|
| `src/lib/task-kind.ts` | **`deriveTaskKindDetailed`·`TaskKindBreakdown` 추가**(§5.3) + `PATH_RULES` `security`에 `.vhk/policy.json` 등재(§7.3 조치3). 기존 export 시그니처 무변경 |
| `src/commands/stats.ts` | 집계 함수 re-export만 남김. 출력·공개 표면 불변 |
| `src/index.ts` | `vhk policy` 컨테이너 등록 |
| `src/lib/command-registry.ts` | `TOP_LEVEL_COMMANDS` · `CONTAINER_SUBCOMMANDS` · `CONTAINER_ALIASES` · `CONTAINER_SUBCOMMAND_ALIASES` |
| `src/i18n/ko.ts` | `policy` 메시지 블록 |
| `src/lib/nlp-router.ts` | 키워드 추가 |
| `.gitignore` · `scripts/check-public-boundary.mjs` | `.vhk/policy.json` 보호(§7.3) |

> 초안은 `task-kind.ts`를 "손대지 않는 것"에 넣었다. 치명 1의 수정이 그 파일의 additive 확장을
> 요구하므로 이쪽으로 옮겼다.
>
> **정확한 불변 조건:** "동작 불변"이 아니라 **"기존 경로의 분류 결과 불변"**이다.
> §7.3 조치3이 `PATH_RULES`에 `.vhk/policy.json`을 추가하므로, **그 신규 경로 하나에 한해
> `classifyPath()`의 반환값이 `unknown`에서 `security`로 바뀐다.** 이것은 additive 예외이며,
> 그 외 어떤 경로의 분류 결과도 바뀌지 않는다. 회귀 테스트는 "전체 동작 불변"이 아니라
> "기존 경로 집합의 분류 결과 불변 + `.vhk/policy.json` → `security`"로 고정한다.

### 손대지 않는 것

`src/lib/autonomy-log.ts` · `src/lib/receipt-log.ts` · `src/lib/risk-policy.ts` ·
`src/lib/safety-mode.ts` · `src/lib/exec.ts` · `src/mcp/**` · 기존 원장 파일 전부.

`risk-policy.ts`를 건드리지 않는 이유는 그것이 **사람이 부른 CLI 명령**의 가드 정책이기 때문이다.
자율 런의 권한 축과 별개 차원이다. `cost-policy.ts`가 `risk-policy.ts`를 중복이라 부르지 않고
"별도 정책 차원"이라 선언한 선례를 그대로 따른다.

---

## 7. 기본 off (124-T4)

Goal 카드의 완료 조건은 "활성화 플래그 없이 실행 시 부작용 0(파일 변경·외부 호출 0)"이다.
**원장 기록도 파일 변경이다.** 따라서 off일 때는 원장에도 쓰지 않는다.

### 7.1 4층 분리와 부작용 정의

> **적대 검증 지적(중대 13)으로 "부작용" 정의에 서브프로세스 스폰을 추가했다.**
> `vhk policy risk`는 위험도를 구하려고 `git diff --name-only`를 띄운다. 스폰은 부작용이다.

| 층 | 무엇 | 언제 | 파일 쓰기 | 프로세스 스폰 | 네트워크 |
|---|---|---|---|---|---|
| 판정 | 순수 함수 계산 | 항상 | 0 | 0 | 0 |
| 수집 | 원장·설정 읽기, `git diff` 실행 | 조회·종결 양쪽 | 0 | **읽기 전용 git만** | 0 |
| 표시 | stdout 출력 | 사람이 `vhk policy`를 부를 때 | 0 | 0 | 0 |
| 기록 | `policy-decision.jsonl` append | `enforce: true` **AND** 런 종결 | 1줄 | 0 | 0 |
| 집행 | 실제 명령 차단·중단 | **이 RFC 범위 밖** (작업 단위 126 이후) | — | — | — |

"부작용 0"의 정확한 정의는 이렇다.

> **파일 생성·수정 0 · 네트워크 호출 0 · 쓰기를 하는 스폰 0.**
> 읽기 전용 git 서브커맨드(`diff --name-only`·`rev-parse`) 스폰은 허용하되 §7.5에서 횟수와
> argv를 단언한다. `.git/` 내부의 인덱스 캐시 갱신은 스냅샷 대상에서 제외한다.

124-T3("전이를 기록에 남김")과 124-T4("플래그 없으면 무동작")가 충돌하는 지점이 여기다.
**T4가 이긴다.** off 상태에서 남는 것은 stdout뿐이다.

### 7.2 구조적 순환 — 정직하게 적어둔다

> **적대 검증 지적(중대 12).** 다음 순환이 실재한다.

```text
enforce = false  ──▶ 원장 라인 0줄  ──▶ previous 가 영구 L1
                                       ──▶ 켜기 전까지 승급 이력이 하나도 안 쌓임
                                       ──▶ "켜도 되나"를 판단할 데이터가 없음
                                       ──▶ 켜기를 미룸  ──▶ 처음으로
```

이것은 관찰 게이트가 이미 겪고 있는 문제와 같은 모양이다. 실행하지 않으면 실행 데이터가 없다.

**이번 계열의 기본값은 "기록 없음 유지"다(T4 우선).** 순환을 해소하는 세 갈래는 §11 Q5로 승격했다.
켜기 판단은 원장이 아니라 `vhk stats`의 3중 판정 지표(이미 4주간 쌓이는 중)로 한다 —
권한 단계는 그 지표의 파생값이므로, 지표가 충분하면 단계 이력이 없어도 켜기 판단은 가능하다.

### 7.3 설정 파일 보호 — 위협 모델

> **적대 검증 2차 지적(치명 8 잔여).** 1차 수정의 네 조치 중 1번과 3번이 **서로를 무효화**했다.
> `.gitignore`에 올린 파일은 `git diff`에 영원히 나타나지 않고, `changedPathsBetween()`은
> git diff 기반이다. 즉 `PATH_RULES`에 `.vhk/policy.json`을 등재해도 **이 저장소에서는
> 한 번도 매칭되지 않는 죽은 규칙**이다. 4번도 런 도중만 보므로 **런과 런 사이의 편집**을 놓친다.

#### 정직한 한계부터

**`L1` 이상 권한을 가진 에이전트의 로컬 파일 쓰기는 원천 차단할 수 없다.**
같은 사용자 권한으로 도는 프로세스가 같은 디스크에 쓰는 것을 코드로 막을 방법이 없다.

따라서 이 조치들의 목표는 **차단이 아니라 무흔적 변조 방지**다.
변조는 가능하되, 변조하면 **흔적이 남고 다음 런이 거부**되도록 만든다.
이 구분을 문서에 적어두지 않으면 나중에 이 절을 "자율 런은 스위치를 못 만진다"로 오독한다.

#### 계층별 방어

`.vhk/policy.json`을 커밋하는지 여부에 따라 유효한 방어가 다르다. **두 환경을 나눠 정의한다.**

| 환경 | 예 | 유효한 방어 |
|---|---|---|
| **A. 설정을 커밋하지 않음** | VHK 자체(`.vhk/config.json` 관례를 따라 `.gitignore` 등재) | **런 밖 영속 해시 베이스라인이 유일한 방어**(아래 (1)) |
| **B. 설정을 커밋함** | `policy.json`을 팀 공용으로 추적하는 다른 프로젝트 | 베이스라인 + `PATH_RULES` `security` 등재가 추가 방어로 작동 |

`PATH_RULES` 등재는 **환경 B에서만 살아 있는 규칙**이다. 환경 A에서 죽은 규칙임을 알고도 넣는
이유는 VHK가 다른 프로젝트에서도 돌기 때문이다. 죽은 규칙이라 해서 빼면 환경 B가 무방비가 된다.
다만 **환경 A의 방어를 여기에 기대면 안 된다** — 그것이 1차 수정의 오류였다.

#### (1) 런 밖 영속 해시 베이스라인

| 항목 | 내용 |
|---|---|
| 무엇 | `.vhk/policy.json`의 내용 해시를 **런과 무관하게 영속 보관** |
| 어디 | `.vhk/policy-baseline.json` (비추적 — `.gitignore` 등재) |
| 언제 검사 | **런 시작 시** 현재 해시와 베이스라인을 대조 |
| 불일치 시 | `POLICY_CONFIG_MUTATED` 기록 + **자율 레인 fail-closed(전부 거부)** |
| 갱신 | **사람 명령으로만.** 자율 레인에는 갱신 경로가 없다 |
| 런 도중 | 시작·종료 해시도 계속 비교(1차 수정의 4번 유지) — 런 중 변경은 그 런의 판정을 무효화 |

런 시작 검사가 핵심이다. 런과 런 사이에 파일이 바뀌면 다음 런 시작에서 걸린다.
"런 도중만" 보던 1차 설계의 사각지대가 이것으로 닫힌다.

#### 베이스라인의 순환 — 완전 방어가 아니다

베이스라인 파일 자체도 같은 디스크에 있고 같은 프로세스가 쓸 수 있다.
`policy.json`과 `policy-baseline.json`을 **같이** 고치면 대조는 통과한다.

이 순환은 닫히지 않는다. 닫으려면 저장소 밖(다른 사용자 권한·원격·하드웨어)에 신뢰 기점이
있어야 하고, 그것은 이번 계열의 범위가 아니다. 여기서 얻는 것은 **탐지 확률**이다.

| 얻는 것 | 못 얻는 것 |
|---|---|
| 파일 하나만 고치면 반드시 걸린다 | 두 파일을 같이 고치면 안 걸린다 |
| 변조가 우발적이면 거의 다 잡힌다 | 변조가 의도적이고 이 문서를 읽었으면 못 잡는다 |
| 사람이 나중에 원장에서 이력을 본다 | 실시간 차단 |

**이 정도가 상한이라는 것을 알고 켠다.** 진짜 방어선은 여전히 `enforce`가 기본 off이고
켜는 것이 사람이라는 사실이다.

#### 124 완료 조건

| # | 조치 | 대상 | 유효 환경 |
|---|---|---|---|
| 1 | `.vhk/policy.json` · `.vhk/policy-baseline.json`을 `.gitignore`에 추가 | `.gitignore` | A |
| 2 | 두 파일을 `PRIVATE_TRACKED_PATHS`에 추가 | `scripts/check-public-boundary.mjs` | A·B |
| 3 | `PATH_RULES`의 `security` 규칙에 `.vhk/policy.json` 등재 | `src/lib/task-kind.ts` | **B만** |
| 4 | 런 **시작** 시 베이스라인 대조 → 불일치면 `POLICY_CONFIG_MUTATED` + 자율 레인 전부 거부 | 124-T4 | A·B |
| 5 | 런 시작·종료 해시 비교 → 런 중 변경이면 그 런의 판정 무효화 | 124-T4 | A·B |
| 6 | 베이스라인 갱신은 사람 명령만. 자율 레인에 갱신 경로 없음(정적 검사) | 124-T4 | A·B |

**이 여섯 조치는 `enforce`와 무관하게 항상 동작한다**(헤더의 예외 조항).
`enforce: false`일 때도 베이스라인 대조는 돌고, 불일치는 `vhk policy show` 출력에 표시된다.
단 §7.1의 부작용 규칙은 지킨다 — off 상태에서 베이스라인 **파일을 새로 쓰지는 않는다.**
베이스라인이 아직 없으면 "미설정"으로 표시하고 사람에게 생성 명령을 안내한다.

`enforce`를 켜는 CLI 명령을 만들지 않는 이유도 같은 규율이다. 사람이 편집기로 직접 쓴다.
이것은 128-T3("머지를 실행하는 경로가 코드에 없다")과 같다.

### 7.4 설정 파일과 손상 처리

```jsonc
// .vhk/policy.json — 파일 자체가 없으면 off (기본)
{
  "schemaVersion": 1,
  "enforce": false,     // 키가 없어도 false. true 는 사람이 직접 쓴다
  "maxLevel": "L2"      // optional. 사람이 상한을 낮출 때만
}
```

> **적대 검증 지적(치명 6)으로 손상 처리를 RFC 0067과 통일했다.** 초안은 0066이 "off 폴백",
> 0067이 "전부 거부"로 서로 달랐다. 같은 파일에 두 해석이 있으면 안 된다.

**손상·미지원 버전일 때의 단일 규칙.**

> 설정을 신뢰할 수 없으면 → **자율 레인 fail-closed(전부 거부) · 사람 CLI 무영향.**

이 한 문장이 두 RFC가 공유하는 유일한 어휘다. "off 폴백"·"집행 없음" 같은 표현을 쓰지 않는
이유는, 그것이 "아무 일도 안 일어남"으로 읽히기 때문이다. 설정이 깨졌을 때 자율 레인이
조용히 예전처럼 도는 것은 안전한 상태가 아니다. **깨지면 멈춘다.**

**무효화 범위를 섹션 단위로 나눈다.**

| 섹션 | 파싱 실패 시 |
|---|---|
| `enforce` · `maxLevel` | **독립 파싱.** 이 두 키를 못 읽으면 → 자율 레인 fail-closed |
| `allow` (RFC 0067) | 그 섹션만 무효 → 빈 허용목록 → 자율 레인 fail-closed. `enforce`는 살아 있음 |
| `limits` (RFC 0067) | 그 섹션만 무효 → 자율 레인 fail-closed |
| 해시 베이스라인 불일치(§7.3) | 자율 레인 fail-closed |

허용목록 항목 하나의 오타가 `enforce` 해석까지 날리면, 사람이 파일을 고치는 동안
"내가 무엇을 끈 건지" 알 수 없게 된다. 섹션을 분리하면 진단이 구체적이 된다.
그러면서도 **어느 섹션이 깨지든 자율 레인의 결과는 fail-closed로 같다.**
사람 CLI는 네 경우 모두 영향을 받지 않는다.

| 규칙 | 내용 |
|---|---|
| 단일 소스 | 플래그는 이 파일 하나. 환경변수 이중 경로를 만들지 않는다 |
| 켜는 주체 | **사람만.** CLI에 `enforce`를 켜는 명령을 만들지 않는다 |
| 상한 방향 | `maxLevel`은 계산 결과를 **낮추기만** 한다. 올리는 경로 없음 |
| 잘못된 `maxLevel` 값 | `L0~L3` 밖이면 `maxLevel` 미설정이 아니라 **판단 불가**로 취급 |

### 7.5 부작용 0을 어떻게 증명하나

RFC 0065 §9의 "무쓰기" 검증 패턴을 확장한다.

1. 임시 프로젝트에 원장·설정을 준비한다.
2. **`.git/` 을 제외한** 전체 파일 목록 + 내용 해시 + mtime을 스냅샷한다.
3. `child_process`의 spawn 계열을 계측기로 감싸 **스폰 횟수와 argv를 수집**한다.
4. `vhk policy` 계열 명령을 전부 실행한다.
5. 스냅샷 완전 일치를 단언한다. 신규 파일 0, mtime 변화 0.
6. 수집된 스폰이 **읽기 전용 git 서브커맨드 화이트리스트**에만 속함을 단언한다. 그 외 스폰 0.
7. `.vhk/policy.json` 부재 / `enforce: false` / 손상 세 경우를 각각 검사한다.
8. `enforce: true` + 조회 명령에서도 원장 라인이 0줄임을 단언한다(§4.3 — 조회는 기록하지 않는다).

---

## 8. CLI 표면

> §11 Q3의 밤샘 기본값으로 **신규 컨테이너 `vhk policy`를 채택**했다. 아침 재검토 대상이다.

### 8.1 명령

신규 top-level 컨테이너 하나. 서브커맨드는 전부 **읽기 전용이고 원장에 기록하지 않는다**(§4.3).

| 명령 | 한글 별칭 | 하는 일 | 기록 |
|---|---|---|---|
| `vhk policy level` | `정책 단계` | 현재 단계 · 직전 라인 · 다음 전이에 필요한 조건 출력 | **없음** |
| `vhk policy risk` | `정책 위험도` | 현재 HEAD 기준 작업 유형 · 미분류 경로 수 · 위험도 출력 | **없음** |
| `vhk policy show` | `정책 보기` | 위 둘 + `enforce` 상태 + `maxLevel` + 설정 손상 여부 | **없음** |

컨테이너 별칭은 `정책`. RFC 0067이 여기에 `check` 하나를 추가한다.
**신규 top-level 명령은 이 계열에서 `policy` 하나뿐이다.**

`vhk policy level`의 출력에는 "다음 승급까지 필요한 것"을 명시한다 —
현재 `judgedRuns`, 직전 전이의 `judgedRuns`, 남은 실패 여유. 조회로는 올라가지 않으므로
사람이 무엇을 기다려야 하는지 보이는 편이 낫다.

### 8.2 대안 — 신규 명령 없이

`vhk stats --policy` 플래그로 붙이는 안도 있다. 신규 top-level 0이고 등록 지점이 줄어든다.
단점은 `stats`가 이미 6개 섹션을 출력하는 대시보드라 판정 표면이 통계에 묻힌다는 것,
그리고 RFC 0067의 `check`가 인자를 받아야 해서 플래그로는 표현이 어색해진다는 것이다.

### 8.3 신규 명령 등록 4지점 체크리스트

`vhk policy`를 실제로 추가할 때 아래를 전부 채운다.
하나라도 빠지면 자연어 라우터 가드가 무력화되고 인자가 유실된다.

- [ ] **`src/index.ts`** — commander 컨테이너 + 서브커맨드 정의 + `.alias('정책')` + 서브별칭
- [ ] **`src/lib/command-registry.ts`**
  - [ ] `TOP_LEVEL_COMMANDS`에 `{ name: 'policy', desc: ... }`
  - [ ] `CONTAINER_SUBCOMMANDS`에 `policy: ['level', 'risk', 'show']`
  - [ ] `CONTAINER_ALIASES`에 `정책: 'policy'`
  - [ ] `CONTAINER_SUBCOMMAND_ALIASES`에 `policy: { 단계: 'level', 위험도: 'risk', 보기: 'show' }`
- [ ] **`src/lib/cli-args.ts`** — 컨테이너 목록은 레지스트리에서 파생되므로 자동이다. 다만 서브커맨드가 인자를 받으면(RFC 0067의 `check`) `FREEFORM_ARG_COMMANDS` 판단을 명시적으로 검토한다
- [ ] **`src/i18n/ko.ts`** — `policy` 메시지 블록. 영문 문자열 하드코딩 금지
- [ ] **`src/lib/nlp-router.ts`** — "권한", "단계", "위험도" 키워드
- [ ] **문서** — `COMMANDS.md` · `README.md` 사용법

**실측 필수:** 영문 경로(`vhk policy level`)와 한글 경로(`vhk 정책 단계`) 둘 다 직접 실행한다.
한글 서브별칭이 레지스트리에 없으면 자연어 라우터가 삼켜 인자가 조용히 사라진다
(이 저장소에서 2회 실증된 결함 클래스).

### 8.4 MCP

노출하지 않는다. 로드맵 §8이 "MCP에 검증 계층 노출"을 2.17 종료 후로 이연했다.
기존 MCP 도구 시그니처는 한 글자도 바뀌지 않는다.

---

## 9. 기존 기능과의 호환성

| 대상 | 영향 | 근거 |
|---|---|---|
| 기존 명령 이름·플래그 | 없음 | 추가만. `stats` 출력도 불변 |
| `.vhk/config.json` | 없음 | 새 키를 넣지 않고 별도 `policy.json`을 쓴다 |
| `autonomy-run.jsonl` | 없음 | 필드 추가 0. 읽기도 집계 함수를 통해서만 |
| `receipt-log.jsonl` | 없음 | 동일 |
| `ai-actions.jsonl` | 없음 | 새 원장으로 분리 |
| `deriveTaskKind()` | 없음 | 시그니처 불변. `deriveTaskKindDetailed`를 추가만(§5.3) |
| `classifyPath()` | **신규 경로 1개만** | 기존 경로의 분류 결과 불변. `.vhk/policy.json`이 `unknown` → `security`로 바뀌는 additive 예외(§7.3 조치3) |
| 원장의 기존 `taskKind` 값 | 없음 | 과거 라인은 재계산하지 않는다. `.vhk/policy.json`은 지금까지 존재한 적이 없어 소급 영향이 0이다 |
| MCP 도구 | 없음 | 미노출 |
| `SafetyMode` | 없음 | 별개 축(§4.2) |
| 구형 v1 자율 런 라인 | 없음 | `unjudgeable`로 이미 격리돼 판정에 안 들어간다 |
| 기존 프로젝트(`policy.json` 없음) | 없음 | off. 명령을 안 부르면 아무 일도 없다 |

`.vhk` 포맷의 breaking change가 없다. 신규 필드는 전부 optional이고,
신규 파일은 전부 부재를 정상 상태로 취급한다.

---

## 10. 테스트 전략

### 10.1 전이 트리거 (치명 3 회귀 가드)

| 케이스 | 기대 |
|---|---|
| `vhk policy level` 10회 연속 호출 | 원장 라인 0줄. 단계 불변 |
| 종결 이벤트 없이 판정 함수 append 경로 호출 | `NO_NEW_JUDGED_RUN` · 기록 없음 |
| `judgedRuns` 동일 | `hold` |
| `judgedRuns` +1 | 전이 판정 진행 |
| `commands/policy.ts`의 import 그래프 | `policy-log.ts`의 append 함수가 포함되지 않음(정적 검사) |

### 10.2 판정 경계값

| 케이스 | 입력 | 기대 |
|---|---|---|
| 원장 없음 | `last = null` | `init` · `L1` · `LEDGER_EMPTY` |
| 표본 부족 | `rollingFailures = null`, `previous = L3` | `hold` · **`L3` 유지**(두 칸 하강 없음) |
| 창 경계 | `judgedRuns = 9` / `= 10` | 9는 표본 부족, 10부터 판정 |
| 승급선 | `rollingFailures = 0` / `= 1` | 둘 다 `promote` |
| 히스테리시스 | `rollingFailures = 2` | `hold` |
| 축소선 | `rollingFailures = 3` | `demote` 한 칸 |
| 축소 우선 | `demotionTriggered` AND 승급 조건 동시 | `demote` |
| 하한 클램프 | `previous = L0` + `demote` | `L0` 유지. `L0` 아래 없음 |
| 상한 클램프 | `previous = L3` + `promote` | `L3` 유지 |
| 남용 의심 | `infraAbuseSuspected = true` | `hold` |
| 롤링 자기보고 격차 | `rollingSelfReportedOnly > 0` | `hold` |
| 전기간 격차만 있음 | `selfReportedOnly > 0`, `rollingSelfReportedOnly = 0` | **승급 가능**(중대 15) |
| 상한 | `maxLevel = 'L1'`, 계산 `L3` | 결과 `L1` |
| 상한 역방향 | `maxLevel = 'L3'`, 계산 `L1` | 결과 `L1` |
| 잘못된 `maxLevel` | `"L9"` | 판단 불가 → 자율 레인 거부 |

### 10.3 CAS (중대 15)

| 케이스 | 기대 |
|---|---|
| base 이후 다른 라인이 끼어듦 | append 안 함. 재계산 |
| 재시도 상한 도달 | `CAS_CONFLICT`. 기록 없이 종료 |
| 동시 종결 2건 시뮬레이션 | `level` 라인이 2줄 생기더라도 두 번째의 `from`이 첫 번째의 `to`와 일치 |

### 10.4 위험도 fail-closed (치명 1 회귀 가드)

| 케이스 | 기대 |
|---|---|
| `['docs/a.md', 'Dockerfile']` | **`human`** — 이 케이스가 이 절의 존재 이유다 |
| `['docs/a.md']` | `auto` |
| `[]` (범위 못 구함) | `human` |
| `TaskKind` 7종 전수 | §5.1 표와 완전 일치. 누락 시 실패하는 exhaustive 테스트 |
| `unknown` 단독 | `human` |
| `deriveTaskKind` 반환값 | 기존 테스트가 무수정 통과(시그니처·기존 경로 결과 불변) |
| `classifyPath` 기존 경로 전수 | 결과 불변. `.vhk/policy.json` 한 경로만 `security`로 신규 매칭 |
| 에이전트 신고값 주입 | 판정 입력에 도달하지 않음 |

### 10.5 설정 보호 (치명 8 · 위협 모델 §7.3)

| 케이스 | 기대 |
|---|---|
| `.vhk/policy.json` · `policy-baseline.json`이 `git status`에 뜨는가 | 뜨지 않음(`.gitignore` 등재) |
| `boundary:check` | 두 파일 `PRIVATE_TRACKED_PATHS` 등재 확인 |
| `classifyPath('.vhk/policy.json')` | `security` — **환경 B에서만 유효한 규칙임을 주석에 명시** |
| **런과 런 사이** 파일 변경 후 새 런 시작 | `POLICY_CONFIG_MUTATED` · **자율 레인 fail-closed** (1차 사각지대 회귀 가드) |
| 런 도중 파일 변경 | `POLICY_CONFIG_MUTATED` · 그 런 판정 무효 |
| 베이스라인 없음 | "미설정" 표시 + 사람 생성 명령 안내. **자동 생성 안 함** |
| `enforce: false` + 베이스라인 불일치 | 대조는 돌고 `vhk policy show`에 표시. 파일 쓰기 0 |
| 자율 레인 모듈에서 베이스라인 갱신 함수 참조 | 정적 검사 실패(§7.3 조치6) |
| 두 파일을 같이 고침 | **통과한다.** §7.3의 명시된 한계 — 이것이 통과함을 테스트로 고정해 나중에 "막힌다"고 오해하지 않게 한다 |

### 10.6 손상 처리 통일 (치명 6)

| 케이스 | 기대 |
|---|---|
| 잘린 JSON | 자율 레인 fail-closed(전부 거부) · 사람 CLI 무영향 |
| `schemaVersion: 2` | 동일 |
| `allow`만 손상, `enforce: true` 유효 | `enforce`는 살아 있고 허용목록은 빈 목록 → 자율 레인 fail-closed |
| 사람이 부른 `vhk verify`·`vhk save` (위 네 경우 전부) | 영향 0 — 어휘 통일 회귀 가드 |
| BOM 있는 파일 | 정상 파싱 |

### 10.7 기본 off 부작용 0 (중대 13)

§7.5의 8단계 절차. 스폰 카운트 단언과 `.git/` 제외를 포함한다.

### 10.8 등록·별칭

기존 `tests/command-registry.test.ts`의 드리프트 가드가 commander 실등록과 레지스트리를
양방향 대조한다. 신규 컨테이너가 여기에 자동으로 걸리는지 먼저 확인하고,
영문·한글 두 경로의 인자 전달을 별도 케이스로 고정한다.

### 10.9 결정론

같은 입력으로 100회 호출해 동일 출력을 단언한다.
판정 함수에 `Date.now()`·난수·네트워크·파일 읽기가 없어야 한다.
시각이 필요하면 호출부가 주입한다.

### 10.10 공통 검사

```text
pnpm typecheck && pnpm lint && pnpm test:run && pnpm build && pnpm boundary:check && pnpm security:audit
```

`lint`를 빼면 로컬이 통과해도 CI가 실패한다.

---

## 11. 미해결 질문 — 사람이 결정할 것

> **결정 순서 주의.** 아래 Q1·Q7보다 **§4.3의 전이 트리거 수정(치명 3)이 선행이다.**
> 조회로 승급되는 상태에서는 시작 단계를 무엇으로 정하든, `L2 → L3`에 승인을 걸든 의미가 없다.
> 트리거가 고쳐진 코드 위에서 Q1·Q7을 본다.

| # | 질문 | 선택지 | 상태 |
|---|---|---|---|
| Q1 | 원장이 비었을 때 시작 단계 | (A) `L0` 완전 fail-closed (B) `L1` 제안까지 | **기본값 채택됨: (B) `L1`** — 아침 재검토 대상 |
| Q2 | `deps`를 `auto`로 둘 것인가 | (A) ADR-009 ③ 그대로 `auto` (B) `human`으로 올리고 ADR-009 개정 | 미결. 관찰 게이트 종료 시 판정 |
| Q3 | CLI 표면 | (A) 신규 컨테이너 `vhk policy` (B) `vhk stats --policy` 플래그 | **기본값 채택됨: (A) 컨테이너** — 아침 재검토 대상 |
| Q4 | `policy-decision.jsonl` 회전·보존 | (A) 이번 계열에서 안 다룸 (B) 라인 수 상한 + archive | 미결. 기본은 (A) — 다른 원장 4종도 회전이 없다 |
| Q5 | **off일 때 원장 0줄 순환(§7.2)을 어떻게 끊나** | (A) 끊지 않음 — T4 우선, 켜기 판단은 `vhk stats`로 (B) `--record` 옵트인 신설 (C) 판정 이력만 `.vhk/` 비추적 경로에 별도 보관 | **기본값 채택됨: (A)** — 중대 12로 승격된 질문. 아침 재검토 대상 |
| Q6 | `rollingSelfReportedOnly > 0` 승급 차단이 과한가 | (A) 그대로 (B) 비율 임계로 완화 | 미결. 4주 실측 뒤 |
| Q7 | `L2 → L3` 도달에 사람 1회 승인을 요구할 것인가 | (A) 계산만으로 도달 (B) 승인 필수 | 미결. **§4.3 수정 확인 후** 판정 |

**Q1·Q3·Q5는 밤샘 기본값이 본문에 반영돼 있다.** 아침에 뒤집으면 §4.7·§8.1·§7.2를 고친다.
Q2·Q6·Q7은 관찰 게이트 종료 판정과 같은 자리에서 본다.

---

## 12. 관련

- [ADR-009](../adr/ADR-009-vhk-auto-extension-not-new-module.md) — ①③이 이 RFC의 근거
- [RFC 0067](0067-command-allowlist-budget-design.md) — 이 RFC의 §3 스키마를 재사용하는 짝
- [RFC 0054](0054-execution-evolution.md) — 재개 3조건
- [RFC 0065](0065-goal-phase-task-projection.md) — 읽기 전용 · 무쓰기 · 안정 code 계약의 선례
- [로드맵 2.x](../roadmap/2.x-roadmap.md) §5 작업 단위 124
- [PRD 2.x](../PRD-2.x.md) §6-5 수용 기준 124
