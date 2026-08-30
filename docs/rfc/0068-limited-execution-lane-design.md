---
rfc: 0068
title: Limited execution lane design (vhk auto, dual enforcement wiring, post-execution verification)
status: Draft
created: 2026-08-30
updated: 2026-08-30
relates: ADR-009, ADR-021, RFC 0056, RFC 0063, RFC 0066, RFC 0067
covers: 작업 단위 125b · 126 · 127 (릴리스 2.16.0)
depends: RFC 0067 (Draft — §10 Q9)
---

# RFC 0068 — 제한 실행 레인 설계 (`vhk auto` + 이중 집행 배선 + 실행 후 검증)

> **이 문서는 구현을 열지 않는다.** 로드맵 §관찰 게이트 개정(2026-08-13·28)은 관찰 중
> "125b·126은 설계 검토만 허용"이다. 여기서 말하는 관찰 게이트는 로드맵 §관찰 게이트 개정이 정의한
> **단일 게이트**(4주 AND 유효 실행 10회 · 최근 10회 실패 2회 이하 · 치명적 안전 위반 0 · 사람 계속 승인)다.
>
> **2026-08-30 실측(`vhk stats`):** 표본 7/10 · 관측 16/28일 · 검증된 완주 4/7 · blocked 2 · 자기 보고만 1.
> 실패 3건(자기 보고 1 · blocked 2)이 **앞쪽**이고 그 뒤 4건이 검증 완주다. 그래서 3회만 더 성공하면
> 최근 10회 창에 실패 3건이 그대로 들어가 게이트를 **못 넘는다.** 새 실패가 없다는 전제의 최소치는
> **연속 검증 완주 4회 + 관측 12일 + 치명적 안전 위반 0 + 사람의 명시적 "계속"** 이다.
>
> 구현 착수 조건 = ① 위 게이트 통과 ② 사람의 계속 결정 ③ 이 RFC `Accepted` ④ 선행 RFC 0066·0067의
> reconcile/accept 또는 오너 예외(§10 Q9). 하나라도 없으면 Goal 126·127은 `DEFERRED`다.
>
> **검증 이력.** 1차(Claude) 14건 → 2차 독립 감사(Codex) FAIL(C2·I7·사실 3) → 3차(Codex CLI) FAIL(C2·I6·M1)
> → 4차(Claude Opus — Codex CLI 3회 크래시) FAIL(C2·I8·M2) → 5차(Claude Opus) FAIL(C2·I7·M6) → **6차(Claude Opus) FAIL(C2·I7·M6)** —
> `LANE_IGNORE_ENTRIES` 정의 모순·누락 · `autonomous` 라벨 생성 경로 부재 · 사전 점검의 lstat 누락 · lease tmp 패턴 · 기존 프로젝트 마이그레이션 ·
> 잠금 잔재 회복 · Windows 종료 훅 한계 · 종결 경로 우회 · 검사 스크립트 불일치 · `getCommitInfo` null · `labels[].name` · action-ledger 필드 · dry-run 순서.
> 이 v7이 그 전부를 반영하며, **7차 독립 재검증을 Accepted 전에 돈다.** "잔존 0"은 독립 검증자만 말할 수 있다.

## 0. 요약

| 항목 | 내용 |
|---|---|
| 무엇 | 자율 런 1회를 명령 하나(`vhk auto`)로 시작·게이트·종결하고, **상한 push + draft PR + 계측 라벨**까지 집행한다. 머지 경로는 코드에 없고 PR Ready 전환은 사람이다 |
| 구조 | **호출 측** = `src/commands/auto.ts`(오케스트레이션) · **실행 측** = `src/lib/guarded-exec.ts`(자율 레인 전용 스폰 진입점). 둘은 RFC 0067 §4의 같은 순수 판정기 `preflight`를 **각자 독립 입력**으로 부르고, 런 시작에 고정한 **정책 해시 핀**을 각자 대조한다(§3.6). 전달값은 `runId` 하나 |
| 수명주기 | 레인이 **start → 에이전트 → verify → receipt → terminal** 을 소유하되, 시작·종결 기록은 **오늘 `vhk autonomy-log`가 쓰는 같은 코드 경로**(`agent.ts`에서 추출한 함수)를 부른다(§3.1·§3.9). 작업 SHA(`workSha`)와 증거 SHA(`proofSha`)를 분리하고, dirty·변경 경로 판정은 `getCommitInfo`·`isSelfTrackedPath`의 self-tracked 필터 의미를 쓴다(Goal 85). `vhk receipt`는 게이트를 **다시 실행**해 현재 HEAD에 묶으므로 receipt·review의 신선도 로직은 바꾸지 않는다(§3.2) |
| 판정 원칙 | 합·불은 **종료 코드·디스크 증거·구조화 출력의 결정론 파싱**으로만 정한다. 자연어·LLM 해석은 어떤 단계에도 없다. 구조화 출력(`--json`·porcelain·`ls-remote` 행)은 호출 측 어댑터가 파싱하고 술어는 파싱된 값만 받는다(§3.1) |
| 자동 허용 범위 | ADR-009 ③ · `RISK_MAP` 그대로 — **`chore`·`docs`·`deps`만 push**한다. Goal 카드가 `task_kind`를 그 셋 중 하나로 선언해야 레인이 시작하고, 종결 전 유도 위험도가 `auto`여야 push한다(§3.7) |
| 레인이 쓰는 파일 | autonomy-run.jsonl · policy-decision.jsonl · ai-actions.jsonl(셋 다 self-tracked) · run-state.json · goal-lease.json(둘 다 무시 파일). **`.vhk/.gitignore`는 런 전에 `src/`의 모든 `ensureVhkIgnored` 인자를 이미 갖고 커밋돼 있어야 하며**(0단계 사전 점검 — §3.1) 레인은 그것을 바꾸지 않는다. Goal 카드도 바꾸지 않는다 |
| 허용목록과의 정합 | 레인이 집행하는 명령 **9개**는 전부 정적 argv다(§3.5). RFC 0067의 정확 일치 규칙을 바꾸지 않는다 |
| 기본 off | `policy.json` 부재 / `enforce:false` / `auto` 섹션 없음만 exit 2. 설정 손상·섹션 사용 불가·베이스라인 누락·변조·사전 점검 실패·잠금 잔재는 **시작 실패(exit 1)** 이며 action-ledger에 1줄 남긴다(§3.8). `--dry-run`은 어떤 상태든 쓰기 0. 시작 시점에는 `HARD_STOP`을 만들지 않는다 |
| 127 | 단계마다 **기대 결과 술어**(기계 대조)를 두고 불일치면 종결한다. 폐기 런의 비용은 `cost.jsonl`에 `runId`로 조인한다(자기 보고 — 하드리밋 밖) |
| 코드 변경의 정직한 목록 | **additive:** `exec.ts` 비동기 결과 계약 함수 1개(§3.11) · `run-state.ts` `acquireGoalLease`·`releaseGoalLease`(§3.9) · `policy-pin.ts` · `self-tracked.ts` 헬퍼 1개 · `policy-files.ts` `LANE_IGNORE_ENTRIES` + `goal-lease.json`·`.goal-lease.json.tmp-*` · `policy-config`의 `auto` 섹션 · `policy show --fix-ignore`(index.ts 옵션 + ko.ts) · Goal 카드 `task_kind` 키 · Skill INV-9·10·11 한 줄씩 · 템플릿 `reports/`·`.goal-lease.json.tmp-*`. **리팩터(동작 동일):** `backup.ts`에서 `missingIgnoreEntries` 추출 · `agent.ts` 액션 본문에서 `recordAutonomyStart`·`recordAutonomyTerminal` 추출·export. **기존 함수 동작 변경 1건 — `agent.ts` `deriveRunScope`에 self-tracked 필터(§3.7 · §8)**. 그 외 기존 함수 시그니처·동작 변경 0 |
| 위협 모델 | 막는 것은 **폭주·오작동·실수**와 **런 중 정책 변조**다. 직접 자식은 종료하고 손자는 트리 종료를 시도하되 보장하지 않으며, 레인 자신이 죽을 때도 잡을 수 있는 신호에서는 그룹을 정리한다(Windows 한계 명시). 같은 OS 사용자로 도는 악의적 에이전트의 증거 위조는 막지 않는다(§3.12) |

## 1. 목표와 비목표

### 목표

- **126** — 자율 런의 시작 → 구현 위임 → 결정론 게이트 → 위험도 확인 → push → draft PR → 종결을 한 명령으로 묶는다. 사람이 오늘 `scripts/auto_pr_goal.ps1` 래퍼(RFC 0063)로 하던 꼬리를 CLI 안으로 들이되, 실행 전 검사는 새로 만들지 않는다.
- **125b** — RFC 0067 §5가 설계한 두 집행 지점을 실제 코드로 만든다. 허용목록 밖 명령은 **프로세스가 생성되지 않고**, 한도 초과는 **프로세스가 종료되며**, 한 지점을 무력화해도 다른 지점이 막는다. 런 시작에 고정한 정책 해시를 두 지점이 각자 대조해 **런 중 정책 변조를 hardstop**한다.
- **127** — 실행 후 결과가 의도와 맞는지 기계로 대조하고, 폐기된 런의 비용을 기록해 `vhk stats`에 낸다.

### 비목표

| 항목 | 이유 |
|---|---|
| 머지 — 자동·반자동 전부. **머지 트리거 라벨(`auto-merge`) 부여·Ready 전환 포함** | ADR-009 ②. 저장소에 추적되는 `.agents/skills/auto-merge`는 `auto-merge` 라벨이 붙은 PR을 사람이 명시 호출한 세션에서 머지한다. Ready 전환은 사람 하드게이트(오너 결정 2026-08-30). 계측 라벨 `autonomous`는 예외다(§3.5) |
| 라벨 **생성** | 레인은 `gh label create`를 부르지 않는다. 저장소에 `autonomous` 라벨이 없으면 시작 실패 + 사람 처방(§3.5) — 현행 래퍼가 생성까지 하는 것과 다른 점이며 의도적이다(외부 저장소 메타데이터를 레인이 만들지 않는다) |
| `source`·`schema`·`security` 작업의 자동 push | `RISK_MAP`이 `human`이다(ADR-009 ③이 자동 허용으로 지정하지 않음) |
| LLM·자연어 판정 | vhk-auto Skill INV-1·INV-4. 구조화 출력의 결정론 파싱과는 다르다(§3.1) |
| 간접 실행 차단(npm script 본문·설정 파일·shim 교체) | RFC 0067 §3.4 · §12 Q4 — 이 계열 밖 |
| 악의적 에이전트의 증거 위조 차단 | §3.12. 128·CI 서버 측 필수 검사의 축 |
| 허용목록 매칭 규칙 변경(와일드카드·슬롯) | RFC 0067 §3.2가 거부한 설계. 레인은 정적 argv만 쓴다(§3.5) |
| Windows shim 목록 확장(`cmd.exe` 래핑 대상 추가) | 인젝션 표면 확대. 에이전트 실행 파일은 직접 스폰 가능한 형태로 사람이 지정한다(§3.11) |
| `vhk receipt`·`vhk review`·`vhk verify` 신선도 로직 변경 | 필요 없다 — receipt가 게이트를 다시 실행해 현재 HEAD에 묶는다(§3.2). "evidence-only 관용" 제안은 **철회**(Q10) |
| `.vhk/.gitignore`를 레인이 고치거나 커밋하는 것 | 추적 파일이다. 사람이 `vhk policy show --fix-ignore`(베이스라인 무변경) 뒤 커밋한다(§3.1) |
| OS-temp 잠금 잔재의 자동 정리 | RFC 0067 §5.3-3·`run-state.ts`의 정책 — 죽은 PID의 잠금도 자동 삭제하지 않는다. 레인은 그 정책을 상속한다(§3.9) |
| 128 머지 승인 기준 · 129 비용 서킷브레이커 | 2.17.0 |
| MCP 노출 | 실행 부작용이 있는 명령. RFC 0066 §8.4와 같은 이유 |
| 기존 `vhk-auto`·`overnight-vhk-auto` Skill 폐기 | Skill은 **에이전트 측** 계약, `vhk auto`는 **하네스 측** 계약. 병존한다. INV-9·10·11에 `VHK_RUN_ID` 조건부 한 줄씩(§3.10 · Q7). INV-7(에이전트는 push·PR 금지)은 그대로다 |
| 이 RFC의 `Accepted` 승격 | 이 개정에서 하지 않는다 |
| 관찰 게이트 조건·판정 변경 | 무변경 |

## 2. 상속하는 것

| 출처 | 상속 항목 |
|---|---|
| ADR-009 | 신규 서브커맨드 · 별도 모듈 없음 · 상한 push+PR · 리스크 티어 레인(③ — 자동 허용 = `chore`·`docs`·`deps`) · 안전 계약 4조각(④) |
| vhk-auto Skill INV-1~11 | 진행 허가 = verify green만 · HARD_STOP 선확인 · autonomy-log `runId` 시작/종결 쌍 · 커밋 직후 receipt · 단일 writer · 범위 밖 변경 차단 |
| `vhk autonomy-log`(`agent.ts`) | 시작 = `startRun(cwd, runId, nowIso, snapshot.contentHash)` + start 라인 · 종결 = `withRunStateLock(synchronizeTermination, {ensureIgnored:false})` + `ensureTerminalRequestSnapshotLocked`/`ensureTerminationPolicySnapshotLocked` + `runPolicyInvalidation`(정책 무효 시 complete→blocked 강등) + `terminalKindChanged` 게이트 + terminal 라인. **레인은 이 경로를 그대로 재사용한다**(§3.1 1·10단계) |
| RFC 0056 · Goal 85 | 증거 원장(`.vhk/ledger.jsonl`·`.vhk/events/*.jsonl`)은 **기본 git 추적**. dirty 판정은 `getCommitInfo` → `filterSelfTrackedLines`로 그 파일들을 제외한다. `.vhk/.gitignore` 자체는 추적 파일이며 self-tracked가 **아니다** — 그래서 그 파일의 변경은 `getCommitInfo`가 dirty로 잡는다 |
| Goal 137 | 작업 기준선 SHA와 검증 신선도를 분리한다. 이 RFC는 그 방향을 `workSha`/`proofSha`로 확장한다 |
| 111 · `pr-metrics.ts` | autonomous 코호트 = 종결 SHA 조인 **AND** `autonomous` 라벨(`AUTONOMOUS_LABEL`) 이중 신호. 한 신호만이면 `unknown`으로 격리. `gh pr view --json labels`는 `{name,…}` 객체 배열이며 기존 파서가 `.name`을 뽑는다 |
| RFC 0063 · `auto_pr_goal.ps1` | 상한 push+PR · 머지 0 · clean+unpushed → push-only · `gh label create autonomous` 뒤 `gh pr edit --add-label autonomous` |
| RFC 0066 | `policy.json` 플래그(`record`·`enforce`) · 베이스라인 해시(§7.3 — 무흔적 변조 방지: 불일치 시 **기록** + 자율 레인 fail-closed) · 4층 부작용 정의(§7.1) · 부작용 0 증명(§7.5) · 권한 단계 · 위험도 · 혼합 커밋 `human`(§5.3) · 매트릭스 적용 지점 = 커밋·push 같은 런 종결 행위(§5.2) · policy-config 독트린 "깨지면 멈춘다, off 폴백이라 부르지 않는다" |
| RFC 0067 | 허용목록 **정확 일치**(§3.1·§3.2) · `AllowEntry.maxDurationSec` · `preflight` 5단계 · 시간 예산의 `TIME_LIMIT_WOULD_EXCEED` 사전 거부 · run-state(카운터·시계·잠금·`policyConfigHash`·`RUN_STATE_TTL_SEC`·잠금 잔재는 사람이 정리) · 두 지점 독립성(§5.2) · `runGuardedCommand` 진입점(§5.3) · Q1·Q2·Q3·Q5 확정 |
| ADR-021 | 비-TTY 커밋 계약 — 에이전트는 `vhk save --no-push -m`으로 로컬 커밋만 한다. 레인은 작업 커밋을 만들지 않는다 |

## 3. 레인 구조 (126-T1 · 125b)

### 3.1 판정 원칙·스폰 3분류·사전 점검·한 런의 수명주기

**판정 원칙.** 합·불은 세 가지로만 정한다 — ① 종료 코드 ② 디스크 증거(`latest.json`·receipt-log·git 상태) ③ **구조화 출력의 결정론 파싱**(`gh --json` 필드값 · `git ls-remote --heads` 행 · porcelain). 자연어·LLM 해석은 어떤 단계에도 없다(INV-1·INV-4의 뜻). ③의 파싱은 호출 측 어댑터가 하고, 술어 함수(`auto-postcheck`)는 **파싱된 값만** 받는다 — 술어 입력 타입에 원문 문자열 필드가 없게 타입으로 막는다. 그래서 `GuardedResult`는 `out`을 **가진다**(§3.4). 그 `out`을 판정에 쓰는 곳은 0단계 라벨 점검과 §4.1의 8·9단계 술어뿐이다.

레인이 프로세스를 띄우는 방식은 세 가지다. 섞지 않는다.

| 분류 | 무엇 | 통로 | 허용목록·카운터·핀 |
|---|---|---|---|
| **수집** | 읽기 전용 git 조회 — HEAD·dirty·브랜치·변경 경로 | 기존 함수 재사용: `git-repo.ts`의 `getCommitInfo`, `git-session.ts`의 `currentBranch`, `task-kind.ts`의 `changedPathsBetweenDetailed` | **밖.** RFC 0066 §7.1이 수집 층에 허용한 "읽기 전용 git". §7.5 방식으로 횟수·argv를 단언한다 |
| **집행** | 부작용이 있거나 외부로 나가는 스폰 — 라벨 점검·에이전트·verify·receipt·push·PR·라벨·원격 조회 2종 | **`runGuardedCommand`만** | **안.** 전부 허용목록 정확 일치 + 카운터·시계 + 정책 핀 대조 |
| **안전 종료** | 집행 스폰이 타임아웃됐거나 레인 자신이 종료될 때의 프로세스 트리 종료 — win32 `taskkill /PID <pid> /T /F` · posix 프로세스 그룹 신호 | `safeExecFileDetailed` 내부(비동기) + 레인의 종료 훅(동기 — §3.11) | **밖.** 허용목록이 잠기거나 예산이 소진된 상태에서도 죽일 수 있어야 하므로 판정을 지나지 않는다. argv는 상수 템플릿 + pid 정수뿐 |

**0단계 사전 점검 — `.vhk/.gitignore`.** run-state를 쓰는 모든 경로(`write`·잠금 획득)는 `ensurePolicyFilesIgnored`로, `vhk verify`·`vhk receipt`·`vhk sync`·memory 계열·cloud 계열은 각자의 인자로 **추적 파일 `.vhk/.gitignore`를 멱등 보강**한다. 에이전트는 2단계에서 임의의 vhk 명령을 부를 수 있으므로 "레인이 스폰하는 명령의 인자"로는 집합이 닫히지 않는다 — 그래서 점검 대상은 **`src/` 전수**다. `ensureVhkIgnored`의 "빠짐" 판정은 존재 여부가 아니라 "마지막 양성 규칙이 마지막 부정(`!`) 규칙보다 앞이거나 없음"이고, 그 앞단에서 `.vhk`가 정규 디렉터리·`.vhk/.gitignore`가 정규 파일(둘 다 비-심볼릭)인지 검사해 아니면 **throw**한다. 빠진 항목이 없으면 쓰지 않지만, 하나라도 빠져 있으면 첫 런이 추적 파일을 더럽혀 3단계 clean 검사·6단계 receipt(`dirty`)·Skill INV-11을 스스로 깨뜨린다(`.gitignore`는 self-tracked가 아니다).

| 항목 | 내용 |
|---|---|
| 점검 대상 | `LANE_IGNORE_ENTRIES`(`policy-files.ts`에 additive) = **`src/` 전체의 `ensureVhkIgnored(` 호출 인자 전수 합집합**. 2026-08-30 실측 9곳: `POLICY_LOCAL_FILES`(`policy.json`·`policy-baseline.json`·`run-state.json`·`run-state.lock`·`run-state-recovery.lock` + **`goal-lease.json`**) · `POLICY_LOCAL_TEMP_PATTERNS`(`.policy-baseline.json.tmp-*`·`.run-state.json.tmp-*` + **`.goal-lease.json.tmp-*`** — `atomicWriteFile`이 `.<basename>.tmp-<pid>-<n>`을 만들고 크래시 시 정리하지 않는다) · `reports/` · `receipts/` · `backups/` · `.synced` · `recall-log.jsonl` · `eval/recall-eval.json` · `cloud.json` · `.cloud.json.tmp-*`. 회귀 테스트가 `src/`의 호출 인자를 모아 이 상수와 **정확히 같은지** 대조한다 — 새 호출이 생기면 깨진다 |
| 판정 | ① `.vhk`가 정규 디렉터리·`.vhk/.gitignore`가 정규 파일·둘 다 비-심볼릭(`lstat` — `ensureVhkIgnored`의 throw 조건과 동일) ② `backup.ts`에서 순수 함수 `missingIgnoreEntries(content, entries)`를 **추출**(리팩터 — `ensureVhkIgnored`가 그것을 부르므로 동작 동일)해 레인이 같은 판정을 쓴다 — "`ensureVhkIgnored`가 쓰기를 하지 않을 상태"가 통과 조건이다 |
| clean 조건 | `getCommitInfo(cwd)?.dirty === false` — `null`(비-git·조회 실패)은 시작 실패. `.vhk/.gitignore`는 self-tracked가 아니라 dirty로 잡힌다 |
| 실패 시 | 빠진 항목·lstat 사유를 출력하고 exit 1 + action-ledger 1줄(§3.8). 처방은 **`vhk policy show --fix-ignore`**(126이 추가하는 플래그 — `LANE_IGNORE_ENTRIES`만 보강하고 **베이스라인은 건드리지 않는다**) 뒤 사람이 `.vhk/.gitignore`를 **커밋**. `vhk policy baseline --confirm`을 처방으로 쓰지 않는다 — 정책 핀을 현재 파일로 **재고정**하는 부작용이 있다 |
| 선행 작업 | `VHK_GITIGNORE_TEMPLATE`에 `reports/`·`.goal-lease.json.tmp-*` 추가(§9 순서 2). **기존 프로젝트 마이그레이션:** `POLICY_LOCAL_FILES`가 늘어나면 첫 run-state 접촉(`vhk autonomy-log --event start` 포함)이 `.vhk/.gitignore`를 자동 수정한다 — 업그레이드 뒤 레인 밖 현행 Skill 런에서도 INV-11이 깨질 수 있으므로 CHANGELOG에 "업그레이드 직후 `vhk policy show --fix-ignore` + 커밋"을 명시한다(§8) |
| 보장 | 점검이 통과한 상태에서는 런 중 어떤 `ensureVhkIgnored` 호출도 파일을 쓰지 않는다(멱등 — 추적 저장소 통합 테스트가 mtime·내용 불변을 단언) |

```text
vhk auto [--goal <n>] [--dry-run] [--json]

 0 진입 검사     수집: existsSync(HARD_STOP_PATH) · policy 스냅샷 + 베이스라인 + 판정 순서(§3.8) · .vhk/.gitignore 사전 점검(위)
                 · getCommitInfo(cwd)?.dirty === false · currentBranch 가 main/master/detached 아님 · startSha = HEAD
                 · 집행: runGuardedCommand(`gh label list --json name`).out 을 JSON 파싱 → 'autonomous' 존재 (§3.5)
 1 Goal + 런 시작 --goal <n> 또는 selectActiveId → 카드 상태·의존성·task_kind 선언(§3.7) 검사
                 → acquireGoalLease(cwd, {goalId, runId, nowUtc}) — 잠금 임계구역 ① (§3.9)
                 → recordAutonomyStart(cwd, {runId, goal, sha: startSha, policyConfigHash}) — agent.ts 에서 추출한 기존 시작 경로 (startRun 은 그 안에서 잠금 ②)
 2 구현 위임     집행: runGuardedCommand(auto.agent, runId) — 환경변수 VHK_RUN_ID · VHK_GOAL_ID (§3.10)
 3 작업 SHA      수집: workSha = HEAD · workSha ≠ startSha · getCommitInfo(cwd)?.dirty === false · 브랜치 불변
                 · startSha..workSha 변경 경로에 self-tracked 밖 경로 ≥ 1 (실제 작업이 있다)
 4 verify        집행: runGuardedCommand(`vhk verify`) → 직후 latest.json: commit.sha === workSha AND commit.dirty === false
                 AND status === 'PASS' (WARN·FAIL 거부) AND generatedAt ≥ 단계 시작 UTC. verify 가 증거 커밋을 만들면 HEAD 가 옮겨진다
 5 증거 SHA      수집: proofSha = HEAD · proofSha === workSha OR workSha..proofSha 의 변경 경로가 전부 isSelfTrackedPath (§3.2)
 6 receipt       집행: runGuardedCommand(`vhk receipt`) — 게이트를 다시 실행해 HEAD(= proofSha)에 묶는다 → receipt-log 마지막 라인:
                 sha === proofSha AND receiptTs ≥ 단계 시작 UTC AND gateStatus === 'PASS' AND decision !== 'block' AND dirty === false AND stale !== true
 7 위험도        수집: changedPathsBetweenDetailed(cwd, startSha, proofSha).paths.filter(p => !isSelfTrackedPath(p))
                 → deriveTaskKindDetailed → riskClassOf === 'auto' 여야 push (§3.7)
 8 push          집행: runGuardedCommand(`git push -u origin HEAD`) → 술어: runGuardedCommand(`git ls-remote --heads origin`).out 을
                 행 단위로 파싱(`<sha>\trefs/heads/<branch>`)해 현재 브랜치 행의 SHA == proofSha
 9 PR + 라벨     집행: runGuardedCommand(`gh pr create --base main --fill --draft`) → runGuardedCommand(`gh pr edit --add-label autonomous`)
                 → 술어: runGuardedCommand(`gh pr view --json headRefOid,baseRefName,isDraft,labels`).out 을 JSON 파싱하고 labels[].name 을 뽑아
                   headRefOid == proofSha · baseRefName == auto.base · isDraft === true · names ∋ 'autonomous' · names ∌ 'auto-merge'
10 종결          recordAutonomyTerminal(cwd, {runId, event, …}) — agent.ts 에서 추출한 기존 종결 경로(잠금·스냅샷·정책 무효화·terminalKindChanged·terminal 라인 전부 포함)
                 → releaseGoalLease(cwd, goalId, runId). receipt.sha === terminal.sha === proofSha 가 isVerifiedComplete 조인 조건이다 — 6단계 뒤에 SHA 를 바꾸는 단계가 없다
```

| 원칙 | 내용 |
|---|---|
| 시작·종결은 기존 경로 | 오늘 `vhk autonomy-log --event start|complete|blocked|hardstop`의 액션 본문이 하는 일(§2 표)을 `recordAutonomyStart`·`recordAutonomyTerminal`로 **추출·export**하고 레인은 그것을 부른다. 종결 경로의 정책 무효화 강등·`terminalKindChanged` 게이트를 레인이 우회하거나 이중 구현하지 않는다 — "같은 원장·같은 판정"의 근거다 |
| 레인은 작업 커밋을 만들지 않는다 | 작업 커밋은 에이전트가 ADR-021 계약으로 만든다. 증거 커밋은 `vhk verify`가 만든다. 레인은 receipt 뒤에 **어떤 커밋도 만들지 않는다** — 만들면 `receipt.sha ≠ terminal.sha`가 되어 완주 조인이 깨진다 |
| 추적 파일을 더럽히지 않는다 | 레인이 쓰는 파일은 autonomy-run·policy-decision·ai-actions(self-tracked) · run-state·goal-lease(무시)뿐이다. `.vhk/.gitignore`는 사전 점검으로 무변경을 보장하고, Goal 카드는 런 중 편집하지 않는다 |
| 재시도 없음 | 단계 하나가 실패하면 그 자리에서 종결한다. 재시도는 사람이 `vhk auto`를 다시 부르는 것이다 |
| 종결 분기 | 안전 위반(외부 상태가 의도와 다름 — §4.1) · **런 중** 정책 핀 불일치·누락·손상(§3.6) · `clockAnomaly` · run-state 단조성 위반 · 기록 실패 · 트리 종료 실패(`treeKilled:false`) = `hardstop`(+`HARD_STOP` 생성). 그 밖의 단계 실패 · deny · `require-human` · 위험도 `human` · 바인딩 깨짐 · `getCommitInfo` null · `treeKilled:null`(판단 불가) = `blocked`. `HARD_STOP`은 사람이 `vhk resume --confirm`으로만 푼다. `writeHardStop`은 `process.cwd()` 기준이라 레인은 저장소 루트에서만 돈다(§5) |
| 표본 자격 | 레인 런도 관찰 게이트·완주율의 같은 원장에 같은 코드 경로로 남는다. `isVerifiedComplete`는 무변경이다. 111 코호트 조인은 `autonomous` 라벨로 성립한다(§3.5) |

### 3.2 작업 SHA와 증거 SHA (Critical A)

오늘의 사실 넷.

| 사실 | 근거 |
|---|---|
| `vhk verify`는 리포트를 **게이트 시작 시점 HEAD**에 묶고(`verifyEvidence`), 명령 본체가 끝나면 `commitPaths('chore(vhk): evidence ledger [skip ci]', [ai-actions.jsonl, ledger.jsonl])`로 **증거 커밋을 만들어 HEAD를 옮긴다** | `src/commands/verify.ts` |
| 사용자 프로젝트에서 그 파일들은 **기본 추적**이다(`.vhk/.gitignore` 템플릿이 `ledger.jsonl`·`events/`를 제외하지 않는다 — RFC 0056). vhk 저장소 자신만 루트 `.gitignore`로 제외해 증거 커밋이 생기지 않는다 | `.vhk/.gitignore` · `src/lib/evidence-ledger.ts` |
| `checkEvidenceFreshness(report, current)`는 `report.commit.sha !== current.sha`이면 stale이다 | `src/commands/verify.ts` |
| **`vhk receipt`는 `verifyEvidence(cwd)`를 다시 실행한다** — 게이트를 다시 돌려 그 시점 HEAD에 묶은 새 리포트로 신선도를 판정하고, 증거 커밋은 만들지 않는다. `latest.json`도 그 리포트로 덮어쓴다 | `src/commands/receipt.ts` `collectReceipt` |

따라서 "`latest.json.commit.sha == HEAD`"를 verify **뒤**에 요구하면 추적 프로젝트에서 정상 경로가 스스로 막힌다. 레인은 SHA 둘을 분리하고, 각 술어를 **그 SHA가 유효한 시점에** 검사한다.

| 이름 | 정의 | 누가 만드나 | 검사 시점 |
|---|---|---|---|
| `startSha` | 0단계 HEAD | — | — |
| `workSha` | 에이전트가 끝난 뒤 HEAD. `getCommitInfo(cwd)?.dirty === false` · `startSha..workSha`에 self-tracked 밖 경로 ≥ 1. 에이전트가 자기 verify로 만든 증거 커밋은 이 범위 안에 있으며 3단계 조건(작업 경로 ≥ 1)과 7단계 필터가 그것을 자연히 흡수한다 | 에이전트의 `vhk save --no-push` | 3단계 |
| verify 리포트 | `report.commit.sha === workSha AND report.commit.dirty === false AND report.status === 'PASS'` — `ReportStatus`의 실제 값은 `'PASS' \| 'WARN' \| 'FAIL'`이며 `'WARN'`(스캔 불완전)은 fail-closed | `vhk verify` | **4단계 직후, receipt 전** — receipt가 `latest.json`을 `proofSha` 기준으로 덮어쓰기 때문 |
| `proofSha` | 4단계 뒤 HEAD. `proofSha === workSha`(증거 파일이 무시 대상인 저장소) 또는 `workSha..proofSha`의 변경 경로가 **전부** `isSelfTrackedPath`(레인의 verify가 만든 증거 커밋만) | `vhk verify`의 `commitPaths` | 5단계 |
| receipt | receipt가 `proofSha`에서 게이트를 다시 돌린다 → `sha === proofSha` · `stale === false`가 자연히 성립. 추가로 `receiptTs ≥ 6단계 시작 UTC`(receipt-log `ts` 필드 — 같은 SHA의 과거 receipt를 받아들이지 않는다: append는 best-effort라 실패가 삼켜지기 때문)와 **`gateStatus === 'PASS'`** — `decideReceipt`는 WARN을 `caution`으로만 낮추므로 `decision`만 보면 마지막 게이트 실행의 WARN이 열려 있다 | `vhk receipt` | 6단계 |

이 수명주기에서 receipt·review·`checkEvidenceFreshness`는 **바꿀 것이 없다.** `self-tracked.ts`에 추가하는 `isEvidenceOnlyChange(paths)`(순수)는 5단계 `proofSha` 검사에만 쓴다.

비용 — receipt가 게이트를 다시 돌리므로 한 런에 게이트가 두 번 돈다. `perRunSec`·허용목록 항목의 `maxDurationSec`는 이를 감안해 잡는다(§3.10 부등식).

### 3.3 호출 측 집행 (125b-T2)

`auto.ts`는 집행 스폰 요청을 **만들기 전에** 매번 독립 `ctx`(`PreflightContext`)를 짓고 `preflight`를 돌며, 그 전에 §3.6의 정책 핀을 대조한다.

| `PreflightContext` 필드 | 호출 측이 어떻게 얻나 |
|---|---|
| `hardStopActive` | `existsSync(join(cwd, HARD_STOP_PATH))` — `ensureNotHardStopped`는 차단 시 action-ledger에 쓰는 부작용 함수라 쓰지 않는다 |
| `allowlist` · `limits` | `readPolicyConfigSnapshot(cwd)` → `config.allow`(필드명은 `allow`, ctx 키는 `allowlist`)·`config.limits`. 매 단계 다시 읽고, 그 스냅샷의 `contentHash`를 핀과 대조한다(§3.6) |
| `level` | `lastLevelLine(cwd)` |
| `runCommandCount` · `startedAtUtc` · `lastSeenUtc` · `clockAnomaly` | `inspectRunRecord(cwd, runId)` — `kind:'valid'`의 `record`에서. `missing`·`corrupt`면 fail-closed |
| `nowUtc` | 호출 측이 직접 잰다. 경과·이상 시계·`TIME_LIMIT_WOULD_EXCEED`는 `preflight` 내부(`evaluateTimeBudget`)가 판정한다 |

| 판정 | 호출 측 동작 | 종결 이벤트 | 종료 코드 |
|---|---|---|---|
| `allow` | 요청을 만들어 실행 측으로 넘긴다 — 넘기는 값은 `{bin, args, cwd, env}` + `runId` | — | — |
| `deny` | 요청을 만들지 않는다. 원장 `kind:'allowlist'|'budget'`, `site:'call'` | `blocked` | 1 |
| `require-human` | 요청을 만들지 않는다. 사람이 풀 수 있는 것임을 출력에 적는다(RFC 0067 Q3) | `blocked` | **2** |
| 핀 불일치·누락·손상 | 요청을 만들지 않는다 | `hardstop` | 1 |

종결 **이벤트**(원장)와 프로세스 **종료 코드**는 다른 축이다. `require-human`은 원장에서 `blocked`지만 종료 코드는 2다.

호출 측의 `allow`는 실행 측에 **전달되지 않는다**. 전달 표면은 타입 하나 —

```ts
interface GuardedRequest { bin: string; args: readonly string[]; cwd: string; env?: Readonly<Record<string, string>> }
interface GuardedRunContext { runId: string }          // 시각·카운터·판정 결과·핀 값 필드 없음 — 정적 가드
```

`env`는 에이전트 단계에만 쓰며 키는 `VHK_RUN_ID`·`VHK_GOAL_ID` 둘뿐이다(정적 가드).

### 3.4 실행 측 집행 — `runGuardedCommand` (125b-T1 · T3)

```text
runGuardedCommand(req: GuardedRequest, run: GuardedRunContext): Promise<GuardedResult>
  1 policy 스냅샷 + 베이스라인 — 자기가 다시 읽는다 (호출 측 스냅샷을 받지 않는다)
  2 HARD_STOP — existsSync 로 자기가 다시 확인한다
  3 inspectRunRecord(runId) — missing · corrupt → fail-closed. (이 함수는 TTL 을 판정하지 않는다 — 만료는 §3.9 의 레인 계산)
  4 정책 핀 대조 (§3.6) — record.policyConfigHash 와 1의 contentHash·베이스라인. 불일치 → hardstop 반환, 프로세스 미생성
  5 진입 거부 목록 — argv 리터럴에 '--force' '--force-with-lease' '--delete' '--mirror' 가 있으면 deny (§3.5)
  6 preflight(req, ctx) — 순수 함수, 스폰 0. 결과의 commandCapSec · nextLastSeenUtc 를 받는다
  7 deny | require-human → 원장 site:'exec' → 반환. 프로세스 미생성
  8 bumpCommandCount(runId, baseCount) — 실행 **전** +1 (CAS · 잠금). baseCount 가 낡았으면 재판정
  9 await safeExecFileDetailed(req.bin, req.args, { cwd, env, timeoutMs: commandCapSec × 1000 })   (§3.11 — 타임아웃 시 안전 종료 스폰)
 10 반환 GuardedResult { verdict, exitCode, timedOut, treeKilled, durationMs, spawnError?, out, stderr }
    — out 은 상한(1 MiB)까지 보관한다. 판정에 쓰는 out 은 0단계 라벨 점검과 §4.1 의 8·9단계 술어(구조화 출력 파싱)뿐이다
```

| 한도 | 어떻게 집행되나 | 필요한 변경 |
|---|---|---|
| 명령 하나 | `preflight`의 `commandCapSec`(= `resolveClock`: `AllowEntry.maxDurationSec ?? perCommandSec`, 런 상한 이하)를 `timeoutMs`로 넘긴다 — 초과 시 **프로세스 종료** | `safeExecFileDetailed`(additive, §3.11) |
| 런 누적 `perRunSec` | **현행 `evaluateTimeBudget` 의미를 그대로 쓴다.** `elapsedSec + commandMaxSec > perRunSec`이면 스폰 **전에** `TIME_LIMIT_WOULD_EXCEED`로 거부한다. 스폰된 명령은 항상 런 상한 안에서 끝난다(§4.3) | 없음 |
| 호출 수 | `preflight` ③ + 실행 전 카운터 증가 | 없음 |

**run-state 단조성 대조.** 레인은 시작 시점의 `startedAtUtc`·`policyConfigHash`와 자기가 마지막으로 본 `commandCount`를 메모리에 둔다. 3단계에서 읽은 레코드가 그 기억과 어긋나면(`startedAtUtc` 다름 · `commandCount` 감소 · 핀 다름) `RUN_STATE_TAMPERED`로 `hardstop`한다.

`runGuardedCommand`는 **자율 레인에서 `exec.ts`를 직접 import하는 유일한 모듈**이다. `auto.ts`는 `exec.ts`·`child_process`를 직접 import하지 않는다(수집 층 함수와 종료 훅의 동기 트리 종료(§3.11)는 각각 `git-repo.ts`·`guarded-exec.ts`의 export를 경유한다). 둘 다 정적 검사로 고정한다(§7).

`vhk verify`·`vhk receipt`를 레인이 스폰하는 것은 `vhk` 자신을 띄우는 일이지만, 그 자식은 자율 레인이 아니라 사람 CLI 경로(`safeExecFile` 공용 통로)로 돈다. 자식이 다시 `vhk auto`를 부르는 경로는 없다.

### 3.5 상한 — push + draft PR + 계측 라벨, 머지 없음 (126-T2)

허용목록은 argv 토큰 정확 일치다(RFC 0067 §3.1). 브랜치명·제목·파일 경로처럼 런마다 달라지는 값은 통과할 수 없다. 그래서 레인의 집행 argv는 **전부 정적**이고, 가변값은 git·gh가 스스로 해석하게 둔다. 레인이 쓰는 허용목록 항목은 다음 **9개**이며 사람이 `policy.json`에 **리터럴 그대로** 등록한다. `vhk policy show`가 `auto` 섹션이 요구하는 9항목의 존재와 예산 부등식(§3.10)을 대조한다.

| # | 단계 | argv (정적) | 가변값은 누가 푸나 | 거부 조건 |
|---|---|---|---|---|
| 1 | 0 라벨 점검 | `gh label list --json name` | 레인이 JSON을 파싱해 `autonomous` 존재를 본다 | 없으면 시작 실패 + 처방 "사람이 `gh label create autonomous`를 1회" — 레인은 라벨을 만들지 않는다(§1 비목표) |
| 2 | 2 에이전트 | `auto.agent.bin` + `auto.agent.args` | — | §3.11 스폰 가능성 |
| 3 | 4 verify | `vhk verify` | — | — |
| 4 | 6 receipt | `vhk receipt` | — | — |
| 5 | 8 push | `git push -u origin HEAD` | git이 `HEAD`를 현재 브랜치로 해석 | 0단계에서 `main`·`master`·detached를 거부했다. `--force*`·`--delete`·`--mirror` 토큰은 **`guarded-exec` 진입 검사(§3.4 5단계)** 가 거부하고 `vhk policy show`가 미리 경고한다 |
| 6 | 8 술어 | `git ls-remote --heads origin` | 레인이 `<sha>\trefs/heads/<branch>` 행을 파싱해 현재 브랜치 행을 고른다 | — |
| 7 | 9 PR | `gh pr create --base main --fill --draft` | gh가 현재 브랜치를 head로, 커밋 메시지를 제목·본문으로 | argv 빌더가 `--label`·`--head`·`--title`·`--body*`·`--web`을 **낼 수 없다**(옵션 타입 없음). `--draft`는 **항상** 붙고 뺄 수 있는 옵션이 없다. `--base` 리터럴은 `auto.base`와 같아야 하며 다르면 fail-closed |
| 8 | 9 라벨 | `gh pr edit --add-label autonomous` | gh가 현재 브랜치의 PR을 고른다 | 라벨 리터럴은 `pr-metrics.ts`의 `AUTONOMOUS_LABEL` 상수와 같아야 한다(정적 테스트). 다른 라벨을 붙이는 argv는 만들 수 없다 |
| 9 | 9 술어 | `gh pr view --json headRefOid,baseRefName,isDraft,labels` | gh가 현재 브랜치의 PR을 고른다. `labels`는 `{name,…}` 객체 배열이며 어댑터가 `name`을 뽑는다 | — |

**왜 라벨을 붙이나.** 111의 코호트 판정(`classifyCohort`)은 종결 SHA 조인 **AND** `autonomous` 라벨을 요구하고 한 신호만이면 `unknown`으로 격리한다. 라벨 없이 PR을 열면 레인의 런이 병목 계측에서 **전량 누락**된다. 현행 래퍼는 `gh label create autonomous` 뒤 같은 라벨을 붙인다 — 레인은 **생성은 하지 않고** 0단계에서 존재만 점검한다. `autonomous`는 계측 라벨이지 머지 트리거가 아니다 — 머지 트리거인 `auto-merge`와는 §4.1 술어가 구분한다. 대안(라벨 없이 SHA 조인만으로 코호트 성립)은 §10 Q14.

PR은 **draft로만** 연다. Ready 전환은 사람 하드게이트다(오너 결정 2026-08-30). 111 병목 계측의 사람 대기시간은 `ready_at`부터 재므로, 사람이 Ready로 바꾼 시점이 그 시계의 시작이다.

**머지·Ready 경로 부재의 정적 검사.** 문자열 전수검사가 아니라 **스폰 argv 생성 지점**만 본다 — `src/**`에서 argv 리터럴 배열에 `'pr', 'merge'` · `'pr', 'ready'` · `'--merge'` · `'--squash'` · `'--rebase'` · `'--admin'` 토큰이 등장하지 않고, `mergePullRequest`·`enableAutoMerge` 호출이 없다. 술어·거부 목록에 `auto-merge` 같은 **문자열이 데이터로** 등장하는 것은 허용한다. 126 완료 조건이자 128(2.17)까지 유지되는 회귀 가드다.

### 3.6 정책 해시 핀 — 런 중 정책 변조 방어 (Critical B)

RFC 0066 §7.3의 베이스라인은 "사람이 고정한 `policy.json`과 지금 파일이 같은가"를 보는 **탐지 장치**이며, 불일치 시 **기록**과 자율 레인 fail-closed를 요구한다. 그것만으로는 **런 중에 정책을 바꾸고 베이스라인까지 다시 고정**하면 두 집행 지점이 같은 새 허용목록을 함께 받아들인다. 그래서 런 시작 값에 고정한다.

| 시점 | 동작 | 종료 코드 |
|---|---|---|
| 런 시작(0·1단계) | `snapshot = readPolicyConfigSnapshot(cwd)` · `baseline = checkPolicyBaseline(cwd, snapshot)`. 판정 순서는 §3.8. `baselineMissing`·`mutated`는 **시작 실패 + action-ledger 1줄**(§3.8 엔트리 형식) — 무흔적 변조 방지라는 RFC 0066 §7.3의 목표를 지키되, 이 시점의 `mutated`는 사람이 정당하게 고치고 재고정을 잊은 경우와 베이스라인 파일 손상까지 포함하므로 **`HARD_STOP`은 만들지 않는다.** 통과하면 1단계 `recordAutonomyStart`가 기존 경로대로 `startRun(cwd, runId, nowIso, snapshot.contentHash)`를 부른다 | 손상·누락·변조 = 1 |
| 매 집행 스폰 직전 — **호출 측·실행 측 각자** | `verifyPolicyPin(record, snapshot, baseline)` (순수, `src/lib/policy-pin.ts` 신설·policy-purity 대상): `record.policyConfigHash` 없음 → `POLICY_PIN_MISSING` · `snapshot.contentHash === null` → `POLICY_CONFIG_UNREADABLE` · `baseline.mutated \|\| baseline.baselineMissing` → `POLICY_BASELINE_INVALID` · `record.policyConfigHash !== snapshot.contentHash` → `POLICY_PIN_MISMATCH`. 하나라도면 **hardstop**(+`HARD_STOP` · 원장 `site` 기록) — 런이 이미 시작된 뒤의 변조는 안전 위반이다 | 1 |
| run-state 손상 | `inspectRunRecord`가 `corrupt`면 `RUN_STATE_CORRUPT` → hardstop | 1 |

두 지점이 **같은 순수 함수**를 각자 부르고 입력(`record`·`snapshot`·`baseline`)을 각자 읽는다. 호출 측이 실행 측에 핀 값이나 판정을 넘기지 않는다(§3.3 전달 표면).

| 테스트 | 기대 |
|---|---|
| 동적 — 런 중 정책 확장 + 재고정 | 시작 뒤 `policy.json`의 `allow`를 넓히고 `vhk policy baseline --confirm`까지 다시 돌린 상태 → 호출 측만 살아 있어도, 실행 측만 살아 있어도 각각 `POLICY_PIN_MISMATCH` hardstop. 스폰 0 |
| 동적 — 핀 누락 | `policyConfigHash` 없는 레코드(구형 start) → 양쪽 `POLICY_PIN_MISSING` hardstop |
| 동적 — 손상 | run-state 파일 손상 → `RUN_STATE_CORRUPT` hardstop, 원본 보존 |
| 동적 — 시작 시 상태 | §3.8 각 행의 exit·스폰 0·`HARD_STOP` 없음·action-ledger 1줄 유무 |
| 정적 — 두 지점 모두 핀을 본다 | `auto.ts`·`guarded-exec.ts` 둘 다 `verifyPolicyPin(`을 호출하고, 베이스라인만 보는 경로가 없다 |
| 정적 — 핀 값 전달 없음 | `GuardedRunContext`·`GuardedRequest.env`에 해시 필드·`VHK_POLICY_*` 키 없음 |

### 3.7 위험도 레인 (ADR-009 ③ · 124 재사용) — 선언 + 대조

`RISK_MAP`의 사실 — `chore`·`docs`·`deps` = `auto`, **`source`·`schema`·`security`·`unknown` = `human`**. `deriveTaskKind`는 경로 집합의 **위험도 최댓값**(`RISK_ORDER` chore < docs < deps < source < schema < security)을 돌려준다.

RFC 0066 §5.2의 적용 지점은 "커밋·push 같은 런 종결 행위"다. 레인은 push는 막을 수 있지만 에이전트의 **로컬 커밋은 이미 만들어진 뒤**에야 위험도를 안다. 그래서 두 겹으로 한다.

| 겹 | 언제 | 무엇 |
|---|---|---|
| **선언(사전)** | 1단계 | Goal 카드 frontmatter에 `task_kind: chore \| docs \| deps`(additive 키 — 파서는 미지 키를 이미 허용한다: `resumed_reason` 등)가 **선언돼 있어야** 레인이 시작한다. 미선언·`source`·`schema`·`security` 선언 → exit 1, 스폰 0. `human` 유형의 작업은 레인에서 **시작조차 하지 않는다** — 로컬 커밋도 생기지 않는다 |
| **대조(사후)** | 7단계 | `changedPathsBetweenDetailed(cwd, startSha, proofSha)`의 경로에서 `isSelfTrackedPath`를 뺀 뒤 `deriveTaskKindDetailed` → `riskClassOf`. **`riskClassOf(breakdown) === 'auto'`일 때만 push** — 소스·스키마·보안·미분류 경로가 하나라도 있으면 `blocked` + "사람이 검토·push" 안내(로컬 커밋은 그대로, 되돌리기는 사람). 선언한 `task_kind`와 유도된 `kind`가 다른 것(예: `chore` 선언에 README 한 줄, `docs` 선언에 `package.json`)은 둘 다 `auto`인 한 **정보로만 출력**한다 — 유도값이 최댓값이라 동등 비교는 정상 런을 상시 막는다 |

**정직하게 적어둔다.** 선언은 `human` 티어 진입만 막는다. `auto` 티어 안의 유형 드리프트(`docs` 선언인데 `deps`까지 바뀜)는 ADR-009 ③이 셋 다 자동 허용으로 지정했으므로 계약 위반이 아니지만 선언이 가두지 못한다. 더 좁히려면(선언보다 위험도가 높은 유도값은 blocked) §10 Q15.

필터가 없으면 증거 커밋이 섞여 `.vhk/events/receipt-log.jsonl`은 `-log.` 규칙으로 `schema`, `.vhk/ledger.jsonl`은 미분류가 되어 **모든 런이 `human`** 이 된다.

**124와의 정합(126-T5) — 기존 함수 동작 변경.** 오늘 124의 종결 위험도(`src/commands/agent.ts` `deriveRunScope`)는 같은 함수를 쓰지만 self-tracked 필터가 **없다.** 추적 프로젝트에서는 원장의 위험도가 증거 경로 때문에 `human`으로 기록된다. `deriveRunScope`에 같은 필터를 넣는다 — 이것은 **기존 함수의 동작 변경**이며, 그 전후로 원장 `taskKind`·`riskClass`의 의미가 달라지고 `terminalKindChanged` 경로(재시도 시 유도 유형이 기존 공개 terminal과 다르면 exit 1)와 상호작용한다(§8). 회귀 테스트(증거만 바뀐 범위 → 유형 유지)를 같이 추가한다.

### 3.8 4층 off와 시작 실패 — 판정 순서 (126-T4)

`sectionsUsable`은 정상 off(`defaultOff`, `allow` 섹션 없는 `{record:true, enforce:false}`)에서도 `false`이고 `reasonCode`는 `failClosed`일 때만 있다. 그래서 상태를 아래 **순서**로 판정한다 — 앞 행이 맞으면 거기서 끝난다. **`--dry-run`은 이 순서를 그대로 평가하되 어떤 행에서도 파일을 쓰지 않고**(action-ledger 포함) 그 행의 결과·종료 코드만 출력한다.

| 순서 | 상태 | `vhk auto` 동작 | 파일 쓰기(dry-run 아닐 때) | 스폰 | exit |
|---|---|---|---|---|---|
| ① | `policy.json` **부재** | 계획만 출력 | 0 | 0 | **2** (off) |
| ② | `failClosed`(읽기 불가·스키마 불일치·플래그 오타·심볼릭 링크) | 시작 실패 + `reasonCode` 출력. RFC 0066 독트린 "깨지면 멈춘다, off 폴백이라 부르지 않는다" | action-ledger 1줄 | 0 | **1** |
| ③ | `enforce:false` · `auto` 섹션 없음 | 계획만 출력 | 0 | 0 | 2 |
| ④ | `enforce:true`인데 `sectionsUsable:false`(`allow`·`limits` 섹션 사용 불가) | 시작 실패 — "allow/limits 섹션 사용 불가" 전용 사유(`reasonCode`는 없다) | action-ledger 1줄 | 0 | 1 |
| ⑤ | 베이스라인 누락 · 변조 | 시작 실패 — 고정·재고정 안내. `HARD_STOP` 없음 | action-ledger 1줄 | 0 | 1 |
| ⑥ | `.vhk/.gitignore` 사전 점검 실패(항목 누락·lstat) · `getCommitInfo` null · dirty · 보호 브랜치 · Goal 미선언·`human` 선언 · `autonomous` 라벨 부재 · lease 점유(`LEASE_HELD`·`LEASE_PENDING`) · 잠금 잔재(`RUN_STATE_LOCK_TIMEOUT` — §3.9) | 시작 실패 — 빠진 것·처방을 출력 | action-ledger 1줄 | 라벨 점검 1회만 | 1 |
| ⑦ | 전부 통과 | 전체 레인 | 런 원장·run-state·lease | 허용목록 안에서만 | 0 / 1 / 2 |

**action-ledger 엔트리 형식(②④⑤⑥ 공통).** `AiActionEntry`의 필드값은 타입상 `string`이지만 실사용은 닫힌집합이다(`channel` ∈ `cli`·`mcp`·`nl`·`hardstop`, `guard` ∈ `confirm`·`preview`·`warn`·`allow`·`hardstop`). 새 값을 만들지 않고 다음으로 고정한다 — `{ ts, action: 'auto', channel: 'cli', guard: 'preview', ran: false, reason: 'auto-start-refused', result: <행의 사유코드: POLICY_CONFIG_FAILCLOSED | POLICY_SECTIONS_UNUSABLE | POLICY_BASELINE_MISSING | POLICY_CONFIG_MUTATED | IGNORE_PRECHECK_FAILED | COMMIT_INFO_UNAVAILABLE | WORKTREE_DIRTY | PROTECTED_BRANCH | GOAL_KIND_UNDECLARED | GOAL_KIND_HUMAN | LABEL_MISSING | LEASE_HELD | LEASE_PENDING | RUN_STATE_LOCK_TIMEOUT> }`. `guard:'preview'`·`ran:false`는 "보여주기만 하고 실행하지 않았다"는 기존 뜻이다. 그 파일(`.vhk/events/ai-actions.jsonl`)은 self-tracked라 clean 검사와 충돌하지 않는다.

off 상태의 "스폰 0"에는 수집 층의 읽기 전용 git도 포함된다 — 계획 출력은 설정 파일만 읽는다. exit 2는 **명시적 off·`require-human`에만** 쓴다.

off 상태에서 새로 켜는 경로는 없다. `enforce`·`auto`는 사람이 `policy.json`에 직접 쓰고 `vhk policy baseline --confirm`으로 고정한다(RFC 0066 §7.3).

### 3.9 Goal 바인딩 — lease와 기존 시작 경로 (Important E)

오늘 `vhk goal next`는 선택만 하고(`selectActiveId`) 상태를 바꾸지 않으며, `--goal <n>`은 어디에도 전달되지 않는다. 카드 편집은 하지 않는다(§3.1).

잠금의 사실 — `withRunStateLock`은 `openSync(lockPath, 'wx')` 배타 생성 기반의 **비재진입** 잠금이고(`EEXIST`면 5초까지 재시도 뒤 `RUN_STATE_LOCK_TIMEOUT`), **죽은 PID의 잠금도 자동 삭제하지 않는다**(사람이 정리 — RFC 0067 §5.3-3). 기존 `startRun`은 자기 안에서 그 잠금을 잡고, run-state의 읽기(`readRunStateForMutation`)·쓰기(`write`)는 **모듈 비공개**다. 그래서 lease는 시작 경로를 복제하지 않고 **별도 임계구역**으로 앞에 둔다.

| 항목 | 내용 |
|---|---|
| 위치 | `run-state.ts`에 additive 함수 둘 — `acquireGoalLease`·`releaseGoalLease`. 별도 모듈은 만들지 않는다(비공개 read/write를 안에서 재사용). `startRun`은 손대지 않는다 |
| `acquireGoalLease(cwd, { goalId, runId, nowUtc }): { ok: true } \| { ok: false; reason: 'LEASE_HELD' \| 'LEASE_PENDING'; heldBy: { runId, leasedAtUtc } }` | `withRunStateLock(cwd, …)` 임계구역 ① 안에서 — lease 파일을 읽어 점유를 판정하고 통과면 `{ runId, leasedAtUtc: nowUtc }`를 **쓴다**. 레코드는 만들지 않는다 |
| 시작(1단계) | ①이 끝난 뒤 `recordAutonomyStart(...)`(`agent.ts`에서 추출한 기존 경로)가 자기 임계구역 ②에서 `startRun`을 부른다. 두 임계구역은 **중첩되지 않는다**(교착 없음) |
| ①과 ② 사이의 창 | lease는 있고 레코드는 없다. 이 창을 두 번째 레인이 "죽은 런"으로 오인하지 않도록 **유예**를 둔다 — 아래 점유 판정 |
| 점유 판정(①) | 기존 lease가 없으면 획득. 있으면 그 `runId`의 레코드를 본다: ⓐ 레코드 `valid`이고 `now − record.lastSeenUtc ≤ RUN_STATE_TTL_SEC` → `LEASE_HELD` ⓑ 레코드 `valid`이고 TTL 초과 → 죽은 런으로 보고 **인수** ⓒ 레코드 `missing`이고 `now − lease.leasedAtUtc ≤ LEASE_GRACE_SEC`(60초) → `LEASE_PENDING`(막 시작 중인 런) ⓓ 레코드 `missing`이고 유예 초과 → 시작 전에 죽은 런으로 보고 **인수**. `inspectRunRecord`에는 TTL 판정이 없고 `pruneExpired`는 `policyRecordPending`·`terminalRequestExpected` 레코드를 나이와 무관하게 보존하므로 TTL·유예는 레인이 직접 계산한다 |
| 잠금 잔재 | ①·② 어느 임계구역 안에서든 프로세스가 죽으면 OS-temp 잠금 파일이 남고, 다음 `withRunStateLock`은 5초 뒤 `RUN_STATE_LOCK_TIMEOUT`을 throw한다. 레인은 그것을 §3.8 ⑥으로 받아 exit 1 + 잠금 경로 안내 — **사람이 잠금을 정리한 뒤에야** 위 인수 규칙이 동작한다. 이것은 RFC 0067의 정책(살아 있는 프로세스를 stale로 오판하지 않는다)을 상속한 것이다 |
| 파일 | `.vhk/goal-lease.json` — `{ [goalId]: { runId, leasedAtUtc } }`. `POLICY_LOCAL_FILES`에 `goal-lease.json`, `POLICY_LOCAL_TEMP_PATTERNS`에 `.goal-lease.json.tmp-*`를 추가해 사전 점검·보강 경로에 포함시킨다 |
| 해제(10단계) | 잠금 안에서 lease의 `runId === 내 runId`일 때만 삭제. 다르면 손대지 않는다 |
| 사람 해제 | `vhk policy show`가 살아 있는 lease(Goal·runId·나이·레코드 상태)를 표시한다. 그 전에 풀려면 사람이 `.vhk/goal-lease.json`의 항목을 지운다(무시 파일). 전용 플래그 여부는 Q13 |
| 대조(10단계) | autonomy-log start 라인의 `goal === n` AND lease의 `runId === 내 runId` AND 카드가 그 사이 `DONE`으로 바뀌지 않았다. 어긋나면 `blocked` |
| 에이전트에 | 환경변수 `VHK_GOAL_ID=n`. Skill은 이 값이 있으면 `goal next`를 부르지 않고 그 카드만 다룬다(§3.10) |

| 테스트 | 기대 |
|---|---|
| `--goal 3` | env `VHK_GOAL_ID=3` · start 라인 `goal:3` · lease `3 → runId` · run-state 레코드 존재 |
| 생략 | `selectActiveId` 결과와 같은 카드 |
| `DEFERRED`·미선언·`source` 선언 카드 | exit 1 · 스폰 0 · lease 없음 |
| **동시 시작 2개**(같은 Goal) | 정확히 하나만 lease를 얻고 다른 하나는 `LEASE_HELD` 또는 `LEASE_PENDING` exit 1 — 프로세스 2개를 실제로 띄우는 동적 테스트 |
| **중첩 잠금 회귀** | 정적: `auto.ts`가 `startRun(`·`withRunStateLock(`을 직접 호출하지 않고 `acquireGoalLease(`·`recordAutonomyStart(`만 호출한다. 동적: 잠금을 잡은 채 `startRun`을 부르면 `RUN_STATE_LOCK_TIMEOUT`(기존 동작 고정) |
| 유예 창 | lease만 쓰고 60초 안에 두 번째 레인 → `LEASE_PENDING` / 60초 뒤 → 인수 |
| 죽은 런의 lease | 레코드 `valid` + TTL 초과 → 인수 / TTL 이내 → `LEASE_HELD` |
| 잠금 잔재 | 잠금 파일을 남긴 상태에서 시작 → `RUN_STATE_LOCK_TIMEOUT` exit 1 + action-ledger + 경로 안내 · 자동 삭제 0 |
| 런 중 lease 변조 | 10단계 `blocked` |
| 종결 뒤 | 같은 runId만 lease 삭제, 다른 runId는 보존 |

### 3.10 에이전트 위임 — 정직한 한계와 Skill 개정 (Q7 재검토)

| 사실 | 함의 |
|---|---|
| 에이전트 명령(`auto.agent`)은 허용목록 항목 하나다 | 에이전트 **프로세스 내부**가 띄우는 명령은 레인의 허용목록을 지나지 않는다(RFC 0067 §3.4). 그래서 진행 허가는 결정론 증거만이다 |
| 에이전트 세션은 길다 | 전역 `perCommandSec`를 늘리지 않고 **에이전트 항목에만 `AllowEntry.maxDurationSec`** 를 준다 |
| 예산 부등식 | 레인은 §3.5의 9항목을 각 1회씩 띄운다(재시도 없음). `evaluateTimeBudget`의 `elapsedSec`는 런 시작부터의 **벽시계**라 스폰 사이의 수집·판정·기록 시간도 포함된다. `vhk policy show`는 **`perRunSec ≥ Σ(9항목의 maxDurationSec ?? perCommandSec) + 여유`** 와 `perRunCommandCount ≥ 9`를 계산해 출력하고, 미달이면 "마지막 명령이 스폰 전에 거부될 수 있다"고 적는다. 여유의 초기값 `max(60초, Σ의 10%)`는 **추정**이다 — 실사용 1회 뒤 재조정한다(§7) |
| 에이전트가 만든 커밋만 push된다 | 레인이 작업 커밋을 만들지 않으므로 push 대상은 항상 "에이전트가 `--no-push`로 남긴 커밋 + 그 위의 증거 커밋"이다 |

**Skill 개정 — 세 조항에 `VHK_RUN_ID` 조건부 한 줄씩(additive, 없으면 종전과 같다).**

| 조항 | `VHK_RUN_ID`·`VHK_GOAL_ID` 아래에서 |
|---|---|
| INV-9 | `autonomy-log --event start`를 내지 않고 종결 이벤트도 내지 않는다. 둘 다 레인 소유. Goal은 `VHK_GOAL_ID`의 카드만 다룬다(`goal next` 호출 없음) |
| INV-10 | `vhk receipt`를 부르지 않는다. 레인이 `proofSha`에서 한 번만 만든다 |
| INV-11 · 0단계 clean 검사 | 레인이 1단계에서 autonomy-run.jsonl(self-tracked)을 이미 썼으므로 raw porcelain은 비어 있지 않다. **`getCommitInfo`와 같은 규칙** — `.vhk/ledger.jsonl`·`.vhk/events/*.jsonl`을 제외한 뒤 비어 있어야 한다. 그 밖의 변경(소스·`.vhk/.gitignore`를 포함한 다른 `.vhk` 파일)은 종전대로 거부. 커밋 직전 재검사도 같은 규칙 |
| INV-1·INV-4 (`vhk verify`) | **그대로 허용.** 에이전트의 verify가 만든 증거 커밋은 `startSha..workSha` 안에 남고, 3단계(작업 경로 ≥ 1)와 7단계(self-tracked 필터)가 그것을 자연히 흡수한다 |

레인 밖(`VHK_RUN_ID` 없음)에서도 INV-11을 self-tracked 제외 규칙으로 맞추는 것이 옳지만 이 RFC 범위 밖이다 — 별도 티켓(Q7 B). 환경변수로 넘기는 값은 `runId`·goal id 둘뿐이며 위조해도 §3.4 3단계·§3.9 10단계에서 fail-closed된다.

### 3.11 Windows 스폰·안전 종료·실행 결과 계약 (Important F)

| 사실 | 근거 |
|---|---|
| `ExecResult`는 `{ok, out}` / `{ok:false, err, out, stderr?}`뿐이다. 종료 코드·타임아웃 여부·소요 시간이 없다 | `src/lib/exec.ts` |
| 세 함수 모두 타임아웃 시 **직접 자식**에만 `SIGTERM`을 보낸다. 자식이 만든 손자는 남을 수 있다 | `execFileSync`·`execFile`의 `killSignal` |
| Windows에서 `safeExecFile`은 `SHIM_BINARIES`(pnpm·npm·npx·yarn·**vhk**·vercel·netlify·wrangler)만 `cmd.exe /d /s /c <x>.cmd`로 감싼다. 그래서 레인이 띄우는 `vhk verify`·`vhk receipt`의 직접 자식은 win32에서 `cmd.exe`이고, 실제 작업은 그 손자다 — 트리 종료가 없으면 타임아웃이 `cmd.exe`만 죽인다. `codex`·`claude`는 목록에 없다 | 같은 파일 |
| npm 전역 CLI의 Windows 진입점은 `.cmd` shim이다. bare 이름은 `ENOENT`, `.cmd` 직접 스폰은 Node 보안 강화로 `EINVAL`(실측) | Node CVE-2024-27980 · `exec.ts` 주석 |
| Node는 win32에서 `SIGTERM`을 **전달하지 않는다** — `process.kill(pid,'SIGTERM')`은 핸들러 없이 즉시 종료시킨다. `exit` 이벤트 핸들러는 **동기만** 가능하다. commander는 `parseAsync`라 async action은 문제없다 | Node 문서 · `src/index.ts` |

RFC 0067이 적은 "`exec.ts` 시그니처·동작 불변"은 **기존 세 함수에 대해서만** 유지하고, 다음을 additive로 더한다.

| 변경 | 내용 |
|---|---|
| `exec.ts`에 `safeExecFileDetailed(cmd, args, opts): Promise<DetailedExecResult>` 추가 | `safeExecFileAsync`와 같은 `resolveCmd`·메타문자 거부를 공유하고, `spawn`으로 띄워 타이머를 직접 관리한다. 결과 `{ ok, exitCode: number \| null, signal: string \| null, timedOut: boolean, treeKilled: boolean \| null, durationMs: number, out, stderr, spawnError?: 'ENOENT' \| 'EINVAL' \| 'EACCES' \| string }`. `execSync` 신규 0. 기존 `safeExecFile`·`safeExecFileAsync`·`safeExecFileStream`은 바이트 단위로 무변경(테스트가 기존 동작을 고정) |
| 타임아웃 시 **안전 종료 스폰**(§3.1 3분류) | win32: `taskkill /PID <pid> /T /F`(직접 자식 + 손자 — `cmd.exe` shim 경유 트리 포함) · posix: `detached: true`로 띄운 프로세스 그룹에 `kill(-pid, 'SIGKILL')`. 허용목록·카운터·핀 판정을 지나지 않는다. 결과 정규화: 성공 → `treeKilled:true` · 대상이 이미 없음(`ESRCH`·`taskkill` "not found") → `treeKilled:true` · `taskkill` 자체가 `ENOENT`/권한 거부 → `treeKilled:null`(판단 불가) · 그 밖의 실패 → `treeKilled:false`. 레인은 `false`면 `hardstop`, `null`이면 `blocked`(사유 문구 구분). **보장이 아니라 시도**다 |
| **레인 자신의 종료** — 정직한 한계 | `guarded-exec.ts`가 살아 있는 집행 자식의 pid를 보관하고 **동기** 트리 종료 함수 `killTrackedChildrenSync()`(win32 `safeExecFile('taskkill', …)` · posix `process.kill(-pid)`)를 export한다. `auto.ts`는 **posix**: `SIGINT`·`SIGTERM`·`exit` 훅 / **win32**: `SIGINT`(Ctrl+C)·`exit` 훅에서 그것을 부르고 `blocked` 종결 기록을 시도한다. `exit` 훅은 동기만 가능하므로 여기서 `safeExecFileDetailed`(비동기)를 쓰지 않는다. **못 잡는 것:** win32의 `taskkill /F`·콘솔 창 닫힘·`SIGKILL`·전원 차단 — 그 경우 에이전트가 고아로 남을 수 있고, §3.9의 TTL 인수와 사람의 프로세스 정리에 맡긴다 |
| 자율 레인의 스폰 통로 | `guarded-exec.ts`만 `safeExecFileDetailed`를 부른다. 비동기이므로 `runGuardedCommand`·`auto.ts`의 단계 함수는 `async`다. `spawnError`는 `deny`가 아니라 `SPAWN_FAILED`로 기록하고 `blocked` 종결 |
| Windows 에이전트 실행 파일 | shim 목록을 늘리지 않는다(비목표). `auto.agent.bin`은 **직접 스폰 가능한 실행 파일**이어야 한다 — `node`(+ CLI의 JS 진입 절대경로, 정적) 또는 네이티브 `.exe`. `vhk policy show`는 win32에서 `bin`이 `.cmd`·`.bat`로 끝나거나 확장자 없는 npm CLI 이름(`claude`·`codex`·`gemini` 등 `SHIM_BINARIES` 밖)이면 **경고**하고, 레인은 스폰 전에 `SPAWN_UNSUPPORTED`로 거부한다 |

| 테스트 | 기대 |
|---|---|
| `safeExecFileDetailed('node', ['-e', 'process.exit(3)'])` | `exitCode: 3`, `timedOut: false` (전 플랫폼) |
| timeout 초과 — 자식이 손자를 띄운 상태 | `timedOut: true`, `exitCode: null`, 손자 PID 잔존 0 (win32·posix 통합 테스트) · 트리 종료 실패 주입 → `treeKilled: false` → 레인 `hardstop` · `taskkill` 부재 주입 → `treeKilled: null` → `blocked` · 이미 종료된 그룹 → `treeKilled: true` |
| 종료 훅 | posix: 레인 프로세스에 `SIGTERM` → 집행 자식 그룹 정리 + `blocked` 기록 / win32: `SIGINT`(Ctrl+C 시뮬) → 같은 결과 / `exit` 훅에서 동기 함수만 호출됨(정적) |
| win32 — `.cmd` shim 지정 | `spawnError` 분류(`ENOENT`/`EINVAL`), 레인 `SPAWN_FAILED`/`SPAWN_UNSUPPORTED`, 허용목록 원장에 `deny` 없음 |
| 기존 3함수 | 기존 테스트 전량 green + 시그니처 스냅샷 테스트 |

### 3.12 위협 모델 — 무엇을 막고 무엇을 안 막나

| 위협 | 막나 | 어디서 |
|---|---|---|
| 에이전트·하네스의 **폭주**(무한 루프·호출 폭주·장시간 점유) | 막는다 — 직접 자식 | 허용목록 · 카운터 · 시계 · 이중 집행 · 타임아웃 |
| 타임아웃 뒤 **손자 프로세스** 잔존 | **부분** — 안전 종료 스폰이 트리 종료를 시도하고 실패하면 hardstop으로 알린다. 그룹을 바꾼 손자는 못 잡는다 | §3.11 |
| 레인 자신이 죽은 뒤 에이전트가 고아로 도는 것 | **부분** — posix `SIGINT`·`SIGTERM`·`exit`, win32 `SIGINT`·`exit`에서는 정리한다. win32 `taskkill /F`·콘솔 닫힘·`SIGKILL`·전원 차단은 못 잡는다 → TTL 인수 + 사람 | §3.11 · §3.9 |
| 허용되지 않은 명령을 **레인이** 띄우는 것 | 막는다 | 두 집행 지점 |
| 런 중에 `policy.json`을 고치는 것 — 베이스라인 재고정 포함 | 막는다 | 정책 해시 핀(§3.6) |
| 런 **시작 전** 정책 변조 | 탐지 + 기록 — 베이스라인 불일치로 시작 실패(exit 1) + action-ledger 1줄. 트립와이어는 켜지 않는다 | §3.6 · RFC 0066 §7.3 |
| 런 중에 `run-state.json`의 카운터·시작 시각·핀을 되돌리는 것 | **부분** — 레인이 기억한 값과 어긋나면 다음 스폰 전에 `hardstop`. 레인 기억까지 맞춘 정교한 위조는 못 잡는다 | §3.4 단조성 대조 |
| `human` 유형 작업이 로컬 커밋으로 남는 것 | **부분** — 선언 검사가 시작을 막고, 유도 위험도 `human`은 push 없이 blocked. 선언한 유형 안에서 사람 필수 경로를 건드린 커밋은 로컬에 남는다(되돌리기는 사람) | §3.7 |
| `latest.json`·receipt-log·ledger를 **직접 써서** 증거를 위조하는 것 | **안 막는다** | 같은 OS 사용자·같은 파일시스템. Goal 85가 적어둔 자기참조 사각지대의 연장. 이 축의 방어는 128과 CI 서버 측 VHK Gate 필수 검사다 |
| PR을 열자마자 머지·Ready되는 것 | 막는다 | 머지·Ready 경로 부재 · `--draft` 강제 · `auto-merge` 라벨 부재 · `.agents/skills/auto-merge`는 그 라벨 없는 PR을 건드리지 않는다 |

## 4. 실행 후 출력 검증 + 폐기 비용 (127)

### 4.1 기대 결과 술어 (127-T1)

`src/lib/auto-postcheck.ts` — 순수 함수, 입력은 호출 측이 모아 넘긴다(policy-purity 가드 대상). 8·9단계의 입력은 호출 측 어댑터가 **구조화 출력을 파싱한 값**이며 원문 텍스트는 술어에 들어가지 않는다(§3.1 판정 원칙). 입력 필드명은 다음으로 고정한다 — `startSha`·`workSha`·`proofSha`·`branch`·`dirty`·`report{commitSha, commitDirty, status, generatedAt}`·`receipt{sha, receiptTs, gateStatus, decision, dirty, stale}`·`remoteHeads: Array<{sha, branch}>`·`pr{headRefOid, baseRefName, isDraft, labelNames: string[]}`·`stepStartedAtUtc`. 술어에 `'auto-merge'`·`AUTONOMOUS_LABEL` 같은 라벨 문자열이 **데이터로** 들어가는 것은 §3.5의 정적 검사와 충돌하지 않는다.

| 단계 | 기대 결과 | 관측 입력(분류) | 불일치 시 |
|---|---|---|---|
| 3 작업 SHA | `workSha ≠ startSha` AND `dirty === false` AND `branch` 불변 AND self-tracked 밖 변경 경로 ≥ 1 | 수집 | `blocked` |
| 4 verify | `latest.json` 존재 AND `report.commitSha === workSha` AND `report.commitDirty === false` AND `report.status === 'PASS'` AND `report.generatedAt ≥ stepStartedAtUtc` — **receipt 전에** 검사 | 파일 읽기 | `blocked` |
| 5 증거 SHA | `proofSha === workSha` OR `isEvidenceOnlyChange(workSha..proofSha)` | 수집 | `blocked` |
| 6 receipt | receipt-log 마지막 라인 `receipt.sha === proofSha` AND `receipt.receiptTs ≥ stepStartedAtUtc` AND **`receipt.gateStatus === 'PASS'`** AND `receipt.decision !== 'block'` AND `receipt.dirty === false` AND `receipt.stale !== true` — `red`는 따로 보지 않는다(`decideReceipt`가 `red`를 `block`에 흡수) | 파일 읽기 | `blocked` |
| 8 push | `git ls-remote --heads origin`(허용목록 #6) 출력을 `<sha>\trefs/heads/<branch>` 행으로 파싱한 `remoteHeads`에서 현재 `branch` 행의 `sha == proofSha`. 행이 없으면 불일치 | 집행 → 파싱 | `blocked` |
| 9 PR | `gh pr view --json …`(허용목록 #9) 출력을 JSON 파싱하고 `labels[].name`을 `labelNames`로 뽑는다 → `pr.headRefOid == proofSha` AND `pr.baseRefName == auto.base` AND `pr.isDraft === true` AND `labelNames ∋ AUTONOMOUS_LABEL` AND **`labelNames ∌ 'auto-merge'`**. 그 밖의 라벨(labeler 액션·Renovate 등 외부 자동 라벨)은 정보로만 출력 | 집행 → 파싱 | `auto-merge` 존재 또는 `isDraft === false` → **`hardstop`** · 그 밖 → `blocked` |

"단계 시작 이후 생성" 조건이 이전 런의 `latest.json`·같은 SHA의 과거 receipt 재사용을 막는다. receipt-log의 `ts`(입력명 `receiptTs`)는 `receipt.generatedAt`이며 append 실패는 receipt 명령이 삼키므로(best-effort) 이 시각 조건이 유일한 방어다 — `runId`를 receipt-log에 넣는 안은 §10 Q12로 남긴다.

### 4.2 폐기 실행 비용 (127-T2 · T3)

| 항목 | 내용 |
|---|---|
| 수집 | **자기 보고**. `vhk cost add --usd <n> --run-id <runId>` 또는 환경변수. 레인은 비용을 알 수 없다(`cost-ledger.ts`) |
| 저장 | `CostEntry.runId?: string` — optional, 구형 라인 하위호환 |
| 조인 | `vhk stats` 비용 섹션이 autonomy-run 종결 이벤트와 `runId`로 조인 — `hardstop`·`blocked` 런 = 폐기 |
| 표시 | 폐기 런 수 · 폐기 비용 합 · 런당 중앙값. `runId` 있는 항목 0이면 "표본 0" 정직 표기 |
| 판정 | **안 쓴다.** RFC 0067 Q2 확정 |

### 4.3 `perRunSec` 초과 처리 (RFC 0067 Q6 → 이 RFC Q5)

현행 `evaluateTimeBudget`이 이미 답이다 — `elapsedSec + commandMaxSec > perRunSec`이면 `TIME_LIMIT_WOULD_EXCEED`로 **스폰 전에** 거부하므로, 실행 중인 명령이 런 상한을 넘기는 상황이 생기지 않는다. 0067 Q6의 (A)·(B) 둘 다 필요 없다. 1차 개정의 "잔여시간 캡 + `elapsedSec` 노출"은 이 사전 거부와 양립하지 않아 **철회**한다.

## 5. 모듈 경계

### 신설

| 경로 | 책임 | 부작용 | 단위 |
|---|---|---|---|
| `src/lib/guarded-exec.ts` | `runGuardedCommand` — 실행 측 집행 · 진입 거부 목록 · 살아 있는 자식 pid 보관 · `killTrackedChildrenSync`. 자율 레인에서 `exec.ts`를 직접 import하는 유일한 모듈 | 판정 통과 시에만 스폰 · run-state 갱신 · 원장 append | 125b |
| `src/lib/policy-pin.ts` | `verifyPolicyPin(record, snapshot, baseline)` — 순수 | 없음 | 125b |
| `src/commands/auto.ts` | 호출 측 — 사전 점검 · 판정 순서 · 수명주기 · Goal 선언 검사 · 호출 측 `preflight`·핀 · 수집 층 호출 · 구조화 출력 파싱 어댑터 · 술어 호출 · 기존 시작·종결 경로 호출 · 종료 훅 · 출력 | 런 원장 · run-state · lease · action-ledger(`enforce` 시에만) | 126 |
| `src/lib/auto-postcheck.ts` | §4.1 술어 — 순수(파싱된 값만 입력) | 없음 | 127 |

"별도 모듈 없음"(ADR-009)과의 관계 — ADR-009가 금지한 것은 게이트를 이중 구현한 autonomous 모듈이다. 위 넷 중 실행 전 검사 로직을 가진 것은 없고, 시작·종결 기록은 기존 경로를 호출한다. `auto-postcheck`는 127이 새로 정의하는 **실행 후** 검사다.

### 수정

| 경로 | 변경 | 성격 | 단위 |
|---|---|---|---|
| `src/lib/exec.ts` | `safeExecFileDetailed` 추가(§3.11 — 비동기·안전 종료). 기존 3함수 무변경 | additive | 125b |
| `src/commands/agent.ts` | 액션 본문에서 `recordAutonomyStart`·`recordAutonomyTerminal`을 **추출·export**(잠금·스냅샷·정책 무효화·`terminalKindChanged`·라인 append 전부 포함). 액션은 그 함수를 부른다 | 리팩터(동작 동일 — 기존 `autonomy-log` 테스트로 고정) | 126 |
| `src/commands/agent.ts` `deriveRunScope` | self-tracked 필터(§3.7, 126-T5) | **동작 변경** — §8 | 126 |
| `src/lib/run-state.ts` | `acquireGoalLease`·`releaseGoalLease` 추가(§3.9 — 비공개 read/write·잠금을 안에서 재사용). `startRun` 무변경 | additive | 126 |
| `src/lib/policy-files.ts` | `POLICY_LOCAL_FILES`에 `goal-lease.json` · `POLICY_LOCAL_TEMP_PATTERNS`에 `.goal-lease.json.tmp-*` · `LANE_IGNORE_ENTRIES` 상수(`src/` 전수) | additive | 126 |
| `src/lib/backup.ts` | `missingIgnoreEntries(content, entries)` 순수 함수 추출 — `ensureVhkIgnored`가 그것을 부른다 | 리팩터(동작 동일 — 기존 테스트로 고정) | 126 |
| `src/templates/vhk-dir.ts` | `VHK_GITIGNORE_TEMPLATE`에 `reports/`·`.goal-lease.json.tmp-*` | additive | 126 |
| `src/lib/self-tracked.ts` | `isEvidenceOnlyChange(paths)` 추가 — 5단계 전용 | additive | 126 |
| `src/lib/policy-config.ts` | `auto` 섹션 파싱 — `{ agent: {bin, args[]}, base: string }`. 독립 파싱(RFC 0066 §7.4) | additive | 126 |
| `src/commands/policy.ts` (`show`) + `src/index.ts` 옵션 + `src/i18n/ko.ts` | `auto` 9항목 대조 · 예산 부등식 · `--force*` 경고 · win32 스폰 가능성 경고 · 살아 있는 lease 표시 · 사전 점검 결과 · **`--fix-ignore` 플래그**(`LANE_IGNORE_ENTRIES`만 보강, 베이스라인 무변경). 플래그 등록은 `index.ts`, 메시지는 `ko.ts` | additive | 126 |
| `src/lib/state-files.ts` `writeHardStop` | 무변경 — `process.cwd()` 기준임을 적어둔다. 레인은 저장소 루트에서만 돌고, 임시 디렉터리 테스트는 `process.chdir`로 맞춘다 | — | — |
| Goal 카드 frontmatter | optional `task_kind` 키 — 문서(`goals/_meta.md`·COMMANDS.md)와 `vhk goal drift` 경고 | additive | 126 |
| `src/lib/cost-ledger.ts` · `src/commands/cost.ts` | `CostEntry.runId?` · `cost add --run-id` | additive | 127 |
| `src/commands/stats.ts` | 비용 섹션 | additive | 127 |
| `src/index.ts` · `src/lib/command-registry.ts` · `src/lib/cli-args.ts` · `src/i18n/ko.ts` · `src/lib/nlp-router.ts` | `auto` 등록 4지점 + 키워드 | additive | 126 |
| `.agents/skills/vhk-auto/SKILL.md` INV-9 · INV-10 · INV-11 | `VHK_RUN_ID` 조건부 한 줄씩(§3.10 · Q7) | additive | 126 |
| `tests/policy-purity.test.ts` | `policy-pin.ts` · `auto-postcheck.ts` 추가 | additive | 125b · 127 |
| `COMMANDS.md` · `README.md` · `CHANGELOG.md` | 사용법 · 업그레이드 마이그레이션(§8) | — | 126 |

### 손대지 않는 것

`src/lib/command-allowlist.ts`(정확 일치 불변) · `src/lib/execution-preflight.ts`·`execution-limits.ts`(판정·시간 예산 계약 불변) · `src/lib/hard-stop-guard.ts` · `src/lib/action-ledger.ts`(스키마·`appendActionEntry` 무변경) · `src/lib/autonomy-log.ts` 스키마(v2) · `src/lib/receipt.ts`·`src/lib/receipt-log.ts` · **`src/commands/receipt.ts`·`src/commands/review.ts`·`src/commands/verify.ts`(신선도 로직 포함 — 변경 없음)** · `src/lib/goal-frontmatter.ts` · `src/lib/task-kind.ts` · `src/lib/pr-metrics.ts`(`AUTONOMOUS_LABEL`·`classifyCohort` 무변경 — Q14가 (B)면 예외) · `src/mcp/**` · `overnight-vhk-auto` Skill.

`.gitignore`(루트) 추가 0. `.vhk/goal-lease.json`과 그 tmp 패턴은 `POLICY_LOCAL_*`을 통해 보강 경로에 들어가고, 레인은 그것이 이미 커밋돼 있는지만 검사한다.

## 6. CLI 표면

| 항목 | 계약 |
|---|---|
| 명령 | `vhk auto [--goal <n>] [--dry-run] [--json]` — 신규 top-level. 서브커맨드 없음 |
| 한글 별칭 | `자율`(추천 — `autonomy-log`의 `자율기록`과 어휘 일치. `자동`은 nlp-router 일반어) — §10 Q4 |
| TTY | 요구하지 않는다. inquirer 프롬프트 0 |
| 종료 코드 | **0** = complete + draft PR 열림 · **1** = `blocked`·`hardstop`·시작 실패(§3.8 ②④⑤⑥ — `RUN_STATE_LOCK_TIMEOUT` 포함) · **2** = off(§3.8 ①③) · `require-human`. `--dry-run`은 평가한 행의 코드를 그대로 낸다(쓰기 0) |
| 실행 위치 | 저장소 루트(`writeHardStop`·`HARD_STOP_PATH`가 `process.cwd()` 기준) |
| MCP | 미노출 |

### 등록 4지점 체크리스트

- [ ] `src/index.ts` — `.command('auto')` + `.alias('자율')` + 옵션 3개 + `printNextStep()` · `policy show`에 `--fix-ignore` 옵션
- [ ] `src/lib/command-registry.ts` — TOP_LEVEL 목록 + 한글 별칭 맵 (`자율: 'auto'`)
- [ ] `src/lib/cli-args.ts` — `--goal <n>` 옵션이 자연어 가로채기에 삼켜지지 않는지 명시 검토
- [ ] `src/i18n/ko.ts` — `auto.*` 메시지 · `policy.fixIgnore` 메시지
- [ ] `src/lib/nlp-router.ts` — "자율 실행", "한 바퀴", "auto run" 키워드
- [ ] `COMMANDS.md` · `README.md`

## 7. 테스트 전략

| 축 | 케이스 | 단위 |
|---|---|---|
| 정적 — 머지·Ready 부재 | §3.5 — argv 리터럴 배열에 `'pr','merge'`·`'pr','ready'`·`--merge`·`--squash`·`--rebase`·`--admin` 0건 · `mergePullRequest`·`enableAutoMerge` 호출 0. 문자열 데이터(`auto-merge` 라벨 탐지)는 허용 — 126·127 결합 회귀 | 126 |
| 정적 — draft 강제·가변 인자 부재·라벨 상수·라벨 생성 부재 | PR argv 빌더 옵션 타입에 `label`·`head`·`title`·`body`·`draft(해제)` 없음 + 생성 argv가 `gh pr create --base <base> --fill --draft` 정확히 6토큰 · 라벨 argv의 리터럴이 `AUTONOMOUS_LABEL`과 같다 · argv 리터럴에 `'label','create'` 0건 | 126 |
| 정적 — import 경계 | **import 문 기준**: `auto.ts`가 `exec.js`·`child_process`를 import하지 않고, `git-session.js`에서 `commit`·`stageAll`·`push`·`softReset`·`commitPaths`를, `goal-frontmatter.js`에서 `updateFrontmatterStatus`를 들이지 않는다 · `guarded-exec.ts` 외 자율 레인 모듈에서 `exec.js` 직접 import 0 · `auto.ts`가 `startRun(`·`withRunStateLock(`을 직접 호출하지 않고 `acquireGoalLease(`·`recordAutonomyStart(`·`recordAutonomyTerminal(`을 호출한다 | 125b · 126 |
| 정적 — 전달 표면 | `GuardedRunContext`의 필드가 `runId` 하나(타입 수준 검사 — 세미콜론·JSDoc에 무관) · `env` 키 `VHK_RUN_ID`·`VHK_GOAL_ID`만 | 125b |
| 정적 — 술어 입력 | `auto-postcheck.ts`의 입력 타입에 `out`·`stdout` 같은 원문 문자열 필드 없음 · §4.1 필드명(`receiptTs`·`labelNames`·`remoteHeads`) 존재 | 127 |
| 정적 — 핀 양측 | §3.6 표 | 125b |
| 정적 — 순수성 | `policy-pin.ts`·`auto-postcheck.ts` policy-purity 목록 | 125b · 127 |
| 정적 — exec 3함수 불변 · 종료 훅 동기 | 시그니처 스냅샷 + 기존 `exec.test.ts` green · `exit` 훅 본문에 `await`·`safeExecFileDetailed` 0 | 125b |
| 사전 점검 | `src/`의 `ensureVhkIgnored(` 호출 인자 전수 == `LANE_IGNORE_ENTRIES`(회귀 — 새 호출이 생기면 깨진다) · 항목이 하나라도 "쓰기 필요" 상태(부정 규칙 뒤에 있는 경우 포함)면 exit 1 + 목록 출력 · `.vhk`·`.vhk/.gitignore` 심볼릭/비정규 → exit 1 · 통과 상태면 런 전체 동안 `.vhk/.gitignore` mtime·내용 불변(추적 저장소 통합) · `--fix-ignore`는 베이스라인 파일을 건드리지 않는다 · `missingIgnoreEntries` 추출 뒤 `ensureVhkIgnored` 기존 테스트 green | 126 |
| 허용목록 정합 | §3.5 9항목이 정확 일치로 `allow`되는 실측 · 빠진 항목·부등식 위반을 `vhk policy show`가 출력 · 라벨 부재 → exit 1(`LABEL_MISSING`) | 126 |
| 이중 집행 9케이스 | RFC 0067 §9.3 표 그대로 — 주입한 가짜 실행기로 "프로세스 미생성"을 호출 횟수 0으로 단언 | 125b |
| 핀·베이스라인·판정 순서 | §3.6 표 · §3.8 ①~⑥ 각 행의 exit·스폰·action-ledger 엔트리(필드값 고정) · `HARD_STOP` 생성 0 · `--dry-run`은 어느 행에서도 쓰기 0 | 125b · 126 |
| 한도 종료 | 항목별 `maxDurationSec` 초과 → `timedOut:true` · `elapsed + cap > perRunSec` → `TIME_LIMIT_WOULD_EXCEED` 스폰 0 | 125b |
| run-state 단조성 | 스폰 사이 `commandCount` 감소 / `startedAtUtc`·핀 변경 → `hardstop` + `HARD_STOP` | 125b |
| 수명주기 | (a) 무시 저장소: `proofSha === workSha` 통과 (b) **추적 저장소 실제 git 통합**: 사전 점검 통과 상태에서 start 기록 뒤 Skill 규칙(self-tracked 제외)으로 clean · 에이전트 verify 증거 커밋이 `startSha..workSha` 안에 있어도 3·7단계 통과 · 레인 verify가 증거 커밋 생성 → `isEvidenceOnlyChange` 통과 → receipt 재검증 `stale:false` (c) 증거 커밋에 소스 경로 섞임 → `blocked` (d) verify `status:'WARN'` → `blocked` (e) receipt `gateStatus:'WARN'`(decision caution) → `blocked` (f) 같은 SHA의 과거 receipt만 있고 새 append 실패 → `receiptTs` 조건으로 `blocked` (g) receipt 뒤 커밋 발생 → 조인 실패를 테스트가 잡는다 (h) 종결이 기존 `recordAutonomyTerminal`을 지나 정책 무효화 강등·`terminalKindChanged`가 동작 | 126 |
| 위험도 | self-tracked만 바뀐 범위 → 유형 유지 · `source` 선언/미선언 → 시작 실패 · 선언 `docs`인데 소스 변경 → push 스폰 0 · `blocked` · `chore` 선언 + README 수정 → 통과(정보 출력) · `deriveRunScope` 회귀(126-T5) · 도입 전 미종결 런 재시도 → `terminalKindChanged` 경로 회귀 | 126 |
| Goal lease | §3.9 표 — 동시 시작 2 프로세스 · 중첩 잠금 회귀 · 유예 창 · TTL 인수 · 잠금 잔재 포함 | 126 |
| Windows·안전 종료·결과 계약·종료 훅 | §3.11 표 | 125b |
| 술어 파싱 | `ls-remote` 출력에 여러 브랜치 · 현재 브랜치 없음 · `gh pr view` JSON의 `labels[].name` 추출 · 외부 라벨 섞임(정보만) · `auto-merge` 존재 → `hardstop` · `autonomous` 없음 → `blocked` · `gh label list` JSON에 `autonomous` 없음 → 시작 실패 | 127 |
| 4층 off·시작 실패 | 임시 디렉터리 스냅샷(RFC 0066 §7.5) — §3.8 각 행의 파일·스폰·exit | 126 |
| 별칭 | `vhk auto --goal 3`·`vhk 자율 --goal 3` 둘 다 `goal=3` 보존 | 126 |
| 비용 조인 | `runId` 있는/없는 항목 혼합 → 합계 정확 · 표본 0 문구 | 127 |
| 공통 | `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build && pnpm boundary:check && pnpm security:audit` | 전부 |

**실사용.** 로드맵 §9 2.16.0 행이 요구하는 두 가지(허용목록 위반 시 실제 실행 정지 · 한도 초과 시 실제 프로세스·요청 정지)에 이 RFC가 하나를 **더한다** — 추적 저장소 임시 프로젝트(사람이 `autonomous` 라벨을 만든 뒤)의 `docs` 선언 Goal로 정상 런 1회 → `autonomous` 라벨이 붙은 draft PR이 열리고 머지·Ready되지 않으며 `vhk stats` 병목 섹션이 그 PR을 autonomous 코호트로 센다. 이 1회로 §3.10 예산 여유의 초기값을 재조정한다. 로드맵 행 개정은 사람 결정이다(§10 Q8).

**사람 승인 커밋 경계.** `guarded-exec.ts`·`exec.ts`(security)는 **별도 PR**로 올리고 사람 리뷰 승인을 머지 조건으로 둔다. 기계 검사가 아니라 절차다.

## 8. 기존 기능과의 호환성

| 대상 | 영향 | 근거 |
|---|---|---|
| `safeExecFile` 3종 · 사람이 부른 CLI 전체 | 없음 | 자율 레인의 집행은 `runGuardedCommand`→`safeExecFileDetailed`만 |
| `vhk verify` · `vhk receipt` · `vhk review` | **없음** | 신선도 로직 무변경. 레인이 호출 순서와 시점으로 맞춘다(§3.2) |
| `vhk autonomy-log` | **없음**(리팩터) — 액션 본문을 함수로 추출만. 기존 테스트로 동작 고정 | §5 |
| 허용목록 매칭 규칙 · `preflight` · 시간 예산 | 없음 | 정적 argv · 현행 사전 거부 유지 |
| **124 종결 원장(`deriveRunScope`)** | **동작 변경** — self-tracked 필터 도입 전후로 같은 범위가 다른 `taskKind`·`riskClass`로 기록된다. **마이그레이션:** 도입 시점에 미종결 런(start만 있고 terminal 없음)이 있으면 재시도 시 `terminalKindChanged`로 exit 1이 난다 — 도입 커밋 전에 미종결 런을 먼저 종결한다(CHANGELOG 명시 + 회귀 테스트) | `vhk stats`·권한 단계 전이가 유형별 집계를 비교할 때 도입 커밋을 경계로 삼는다 |
| **`POLICY_LOCAL_FILES` 확장 → 기존 프로젝트** | **1회 마이그레이션 필요.** 업그레이드 뒤 첫 run-state 접촉(`vhk autonomy-log --event start` 포함 — `startRun` → 잠금 → `ensurePolicyFilesIgnored`)이 추적 파일 `.vhk/.gitignore`를 자동 수정한다. 레인 밖의 현행 Skill 런에서도 INV-11 clean 검사가 그 런에서 깨진다 | CHANGELOG: "업그레이드 직후 `vhk policy show --fix-ignore` 실행 + `.vhk/.gitignore` 커밋". §9 순서 2의 선행 조건 |
| `ensureVhkIgnored` | 없음 — 판정을 순수 함수로 추출만 | 기존 테스트로 동작 동일 고정 |
| `VHK_GITIGNORE_TEMPLATE` | `reports/`·`.goal-lease.json.tmp-*` 추가 — 새 프로젝트만 | additive |
| `vhk-auto` Skill | INV-9·10·11 `VHK_RUN_ID` 조건부 | 없으면 종전과 같다 |
| `overnight-vhk-auto` Skill · `auto_pr_goal.ps1` | 없음 | 병존. 폐기는 §10 Q3 |
| autonomy-run.jsonl · receipt-log · policy-decision · run-state · ai-actions 스키마 | 필드·형식 추가 0 | 같은 스키마로 소비만 |
| `.vhk/.gitignore` | `goal-lease.json`·`.goal-lease.json.tmp-*` 항목 추가 — 보강 경로가 넣는다. **사람이 커밋** | 레인은 읽기만 |
| Goal 카드 frontmatter | optional `task_kind` — **레인이 읽기만** | 기존 파서 호환 |
| `.vhk/goal-lease.json` | 신규 무시 파일 | 부재를 정상으로 취급 |
| `cost.jsonl` | optional `runId` | 구형 라인 계속 읽힘 |
| `policy.json` | optional `auto` 섹션 | 없으면 off. 베이스라인·핀에 포함 |
| 저장소 라벨 | `autonomous` 라벨이 있어야 레인이 시작한다 — 사람이 1회 생성 | §3.5 |
| 관찰 게이트 표본 · 111 코호트 | 레인 런도 같은 원장·같은 코드 경로 · `autonomous` 라벨로 코호트 성립 | `isVerifiedComplete`·`classifyCohort` 무변경 |
| `execSync` 금지 · `fs.rmSync` 금지 | 준수 | 신규 0 |

## 9. 구현 순서 (게이트 통과 후)

| 순서 | 내용 | 커밋 경계 |
|---|---|---|
| 1 | 125b-T1 `guarded-exec.ts` · `policy-pin.ts` · `exec.ts` `safeExecFileDetailed`(안전 종료 포함) + 정적 가드 | **별도 PR · 사람 리뷰 승인**(security) |
| 2 | 126-T5 `deriveRunScope` 필터(동작 변경 — CHANGELOG·마이그레이션) · `agent.ts` 시작·종결 함수 추출 · `self-tracked.ts` 헬퍼 · `run-state.ts` lease 함수 · `policy-files.ts` 상수 · `backup.ts` 추출 · 템플릿 — 레인 없이 검증 가능한 선행 조각. **선행 조건:** 기존 프로젝트 `--fix-ignore` + 커밋(§8) | |
| 3 | 126-T1·T3·T4·T7 `auto.ts` 골격 · 사전 점검 · 판정 순서 · 등록 4지점 · Goal 선언·lease · `policy show` 대조·`--fix-ignore` | 스폰 없는 상태에서 먼저 |
| 4 | 125b-T2·T3 호출 측 집행 · 핀 양측 · 한도 종료 · 단조성 · 9케이스 | |
| 5 | 126-T2·T8 라벨 점검 · push + draft PR + 라벨(정적 argv) · 구조화 출력 어댑터 · 머지·Ready 부재 · 위험도 대조 · 종료 훅 · Skill INV-9·10·11 | |
| 6 | 실사용 확인(추적 저장소·`docs` 선언 Goal·라벨 선생성) → 예산 여유 재조정 → `vhk receipt` → 126 완료 | |
| 7 | 127-T1 술어 → T2 비용 `runId` → T3 stats 섹션 | |

## 10. 미해결 질문 — 사람이 결정할 것

| # | 질문 | 선택지 | 상태·추천 |
|---|---|---|---|
| Q1 | 에이전트 명령의 출처 | (A) `policy.json auto.agent` — 베이스라인 해시와 런 핀으로 **보호됨** (B) `.vhk/config.json` — 보호 없음 | **(A)** 추천 |
| Q2 | PR draft 여부 | — | **확정: draft만**(오너 결정 2026-08-30). Ready 전환은 사람 |
| Q3 | `auto_pr_goal.ps1` 래퍼 처리 | (A) 레인 안정 뒤 폐기 (B) 병존 유지 | (A) — 2.16 안에서는 병존 |
| Q4 | 한글 별칭 | (A) `자율` (B) `자동` | **(A)** 추천 |
| Q5 | `perRunSec` 초과 시 실행 중 명령 (= RFC 0067 Q6) | (A) 즉시 종료 (B) 끝까지 (C) 잔여시간 캡 (D) **현행 사전 거부 유지** | **(D)** 추천. (C)는 철회(§4.3) |
| Q6 | 관찰 게이트 통과 판정 + `enforce` 활성화 | 사람 결정 — 이 RFC 밖 | 자동 승인 없음. 최소치는 헤더 참조 |
| Q7 | `vhk-auto` Skill 개정 범위 | (A) INV-9·10·11에 `VHK_RUN_ID` 조건부 한 줄씩(이 RFC) (B) 레인 밖 INV-11도 self-tracked 제외 규칙으로(별도 티켓) | (A) 이번 · (B) 별도 티켓 추천 |
| Q8 | 로드맵 §9 2.16.0 검증 행에 "추적 저장소·`docs` 선언 Goal로 정상 런 1회 → `autonomous` draft PR 열림·머지·Ready 없음·코호트 집계" 추가 | (A) 개정 (B) RFC 추가 검증으로만 | **(A)** 추천 |
| Q9 | 선행 RFC 0066·0067이 아직 `Draft`인데 이 RFC가 의존한다 | (A) 구현 전 0066·0067 reconcile → Accepted (B) 오너 예외로 0068만 먼저 Accepted | **사람 게이트.** 이 개정은 어느 RFC의 상태도 바꾸지 않는다 |
| Q10 | ~~`vhk receipt`·`vhk review` 신선도에 evidence-only 커밋 관용~~ | — | **철회**(3차 검증 #4) |
| Q11 | Goal 카드 `task_kind` 선언을 `vhk auto`의 **필수** 조건으로 둘 것인가(§3.7) | (A) 필수 (B) 선택 | **(A)** 추천. (B)는 `human` 작업의 로컬 커밋을 허용한다 |
| Q12 | receipt-log에 optional `runId` 추가 + append 실패를 receipt 종료 코드로 승격 | (A) 이번 계열 (B) 127 뒤 별도 | (B) 추천 — `receiptTs`·`gateStatus` 조건으로 이번 위험은 닫힌다 |
| Q13 | 죽은 런 lease의 사람 해제 경로 | (A) 파일 항목 수동 삭제 + `policy show` 표시(이 RFC) (B) `vhk auto --release-lease <goal> --confirm` 전용 플래그 | (A) 이번 · (B)는 실사용에서 필요가 확인되면 |
| Q14 | 111 코호트 조인 방식 | (A) 레인이 `autonomous` 라벨을 붙인다(이 RFC — 존재는 사람이 보장, `classifyCohort` 무변경) (B) `classifyCohort`에 "레인 런은 SHA 조인 단독으로 autonomous" 예외 | **(A)** 추천. (B)는 111의 이중 신호 원칙을 깬다 |
| Q15 | `auto` 티어 안의 유형 드리프트(`docs` 선언 → `deps` 변경) | (A) 허용 — 정보만(이 RFC) (B) 선언보다 위험도 순위가 높은 유도값은 blocked | (A) 이번 · `RISK_MAP`의 `deps` 재검토(0066 Q2)와 같은 자리에서 다시 본다 |
| Q16 | lease 유예 `LEASE_GRACE_SEC`의 값 | (A) 60초(이 RFC — 추정) (B) 실사용 뒤 조정 | (A)로 시작 · 실사용 1회에서 1단계 소요를 재고 재조정 |

## 11. 관련

- [ADR-009](../adr/ADR-009-vhk-auto-extension-not-new-module.md) — 구조·상한·안전 계약·자동 허용 유형의 근거
- [ADR-021](../adr/ADR-021-save-high-risk-promotion.md) — 에이전트 커밋 계약(`--no-push`)
- [RFC 0056](0056-vhk-evidence-receipt.md) — 증거 원장 추적(self-tracked의 기원)
- [RFC 0063](0063-overnight-vhk-auto.md) — 현행 야간 지휘 래퍼(레인이 흡수하는 꼬리)
- [RFC 0066](0066-permission-levels-design.md) — 플래그 · 4층 부작용 · 위험도 · 베이스라인 (Draft)
- [RFC 0067](0067-command-allowlist-budget-design.md) — **선행.** 판정기 · 허용목록 정확 일치 · run-state · 두 지점 · 진입점 (Draft)
- 로드맵 `docs/roadmap/2.x-roadmap.md` §관찰 게이트 개정 · §2.16.0 · §9 검증 · 작업 단위 111(코호트)
