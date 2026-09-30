---
rfc: 0068
title: Limited execution lane design (vhk auto, dual enforcement wiring, post-execution verification)
status: Draft
created: 2026-08-30
updated: 2026-08-30
relates: ADR-009, ADR-021, RFC 0056, RFC 0063, RFC 0066, RFC 0067
covers: 작업 단위 125b · 126(T1~T8) · 127 (릴리스 2.16.0)
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
> → 4차(Claude Opus) FAIL(C2·I8·M2) → 5차(Claude Opus) FAIL(C2·I7·M6) → 6차(Claude Opus) FAIL(C2·I7·M6)
> → v7을 **예외 Draft PR #617**로 공개(오너 결정 A, 2026-08-30) → 7차 = PR 위 Codex 리뷰 2건: ① `codex review --base main` P1 3·P2 6 ·
> ② 프롬프트 모드 C8·I6·M1(1건 반증). 이 v8이 accepted 22건을 반영하고 로드맵에 126-T5~T8을 정식 추가했다(오너 결정 C).
> **잔존 0은 독립 검증자만 말할 수 있다** — v8 뒤 Codex 리뷰 1회를 PR에 첨부하고 그 다음은 사람 결정이다.

## 0. 요약

| 항목 | 내용 |
|---|---|
| 무엇 | 자율 런 1회를 명령 하나(`vhk auto`)로 시작·게이트·종결하고, **상한 push + draft PR + 계측 라벨**까지 집행한다. 머지 경로는 코드에 없고 PR Ready 전환은 사람이다 |
| 구조 | **호출 측** = `src/commands/auto.ts`(오케스트레이션) · **실행 측** = `src/lib/guarded-exec.ts`(자율 레인 전용 스폰 진입점). 둘은 RFC 0067 §4의 같은 순수 판정기 `preflight`를 **각자 독립 입력**으로 부르고, 런 시작에 고정한 **정책 해시 핀**을 각자 대조한다(§3.6). 전달값은 `runId` 하나 |
| 수명주기 | 레인이 **start → 라벨 점검 → 에이전트 → verify → receipt → terminal** 을 소유하되, 시작·종결 기록은 **오늘 `vhk autonomy-log`가 쓰는 같은 코드 경로**(`agent.ts`에서 추출한 함수)를 부른다. 집행 스폰은 전부 런 시작 **뒤**다(§3.1). 작업 SHA(`workSha`)와 증거 SHA(`proofSha`)를 분리하고, dirty·변경 경로 판정은 `getCommitInfo`·`isSelfTrackedPath`의 self-tracked 필터 의미를 쓴다(Goal 85). `vhk receipt`는 게이트를 **다시 실행**해 현재 HEAD에 묶으므로 receipt·review의 신선도 로직은 바꾸지 않는다(§3.2) |
| 판정 원칙 | 합·불은 **종료 코드·디스크 증거·구조화 출력의 결정론 파싱**으로만 정한다. 자연어·LLM 해석은 어떤 단계에도 없다(§3.1) |
| 자동 허용 범위 | ADR-009 ③ · `RISK_MAP` 그대로 — **`chore`·`docs`·`deps`만 push**한다. Goal 카드가 `task_kind`를 그 셋 중 하나로 선언해야 레인이 시작하고, 종결 전 유도 위험도가 `auto`여야 push한다(§3.7) |
| 단일 writer | **worktree당 lease 하나**(Goal별 맵이 아니다). 살아 있는 lease가 있으면 어떤 Goal의 레인도 시작하지 않는다. lease에는 세대 번호가 있고, 인수된 뒤 깨어난 옛 프로세스는 스폰 직전 fencing에서 막힌다(§3.9) |
| 실행 위치·상태 경계 | 0단계에서 **Git 루트를 해석해 `chdir`** 한다. 그 뒤 `.vhk`·`.vhk/.gitignore`의 lstat 검사를 **어떤 설정 읽기·원장 쓰기보다 먼저** 한다(§3.8 ⓪) |
| 레인이 쓰는 파일 | autonomy-run.jsonl · policy-decision.jsonl · ai-actions.jsonl(셋 다 self-tracked) · run-state.json · goal-lease.json(둘 다 무시 파일 — Git과 cloud 둘 다). `.vhk/.gitignore`는 런 전에 `src/`의 모든 `ensureVhkIgnored` 인자를 이미 갖고 커밋돼 있어야 한다. Goal 카드는 바꾸지 않는다 |
| 허용목록과의 정합 | 레인이 집행하는 명령 **9개**는 전부 정적 argv다(§3.5). 호출 횟수는 최대 11(재사용 조회·라벨 재시도 포함) |
| 기본 off | 베이스라인 대조가 off 분류보다 **먼저**다 — 고정된 정책을 지우거나 끄는 것은 off가 아니라 시작 실패다(§3.8). `--dry-run`은 정적 판정만 하고 lease·start·집행 전에 끝난다(쓰기 0·스폰 0) |
| 127 | 단계마다 **기대 결과 술어**(기계 대조)를 두고 불일치면 종결한다. 폐기 런의 비용은 `cost.jsonl`에 `runId`로 조인한다 |
| 코드 변경의 정직한 목록 | **additive:** `exec.ts` 비동기 결과 계약 함수 1개 · `run-state.ts` `acquireWorktreeLease`·`assertLeaseOwned`·`releaseWorktreeLease` · `policy-pin.ts` · `self-tracked.ts` 헬퍼 1개 · `policy-files.ts` `LANE_IGNORE_ENTRIES` + lease 파일·tmp · `vhk-cloud.ts` `DEFAULT_CLOUD_EXCLUDES`에 lease 파일 · `policy-config`의 `auto` 섹션(+`autoUsable`) · `policy show --fix-ignore` · Goal 카드 `task_kind` 키 · Skill INV-9·10·11 · 템플릿 항목. **리팩터(동작 동일):** `backup.ts` `missingIgnoreEntries` 추출 · `agent.ts` `recordAutonomyStart`·`recordAutonomyTerminal` 추출·export. **기존 함수 동작 변경 1건 — `agent.ts` `deriveRunScope`에 self-tracked 필터(126-T5 · §8)** |
| 위협 모델 | 막는 것은 **폭주·오작동·실수**와 **런 중·시작 전 정책 변조**다. 손자 프로세스·레인 자신의 강제 종료·같은 OS 사용자의 증거 위조는 막지 않거나 부분만 막는다(§3.12) |

## 1. 목표와 비목표

### 목표

- **126** — 자율 런의 시작 → 구현 위임 → 결정론 게이트 → 위험도 확인 → push → draft PR → 종결을 한 명령으로 묶는다. 사람이 오늘 `scripts/auto_pr_goal.ps1` 래퍼(RFC 0063)로 하던 꼬리를 CLI 안으로 들이되, 실행 전 검사는 새로 만들지 않는다.
- **125b** — RFC 0067 §5가 설계한 두 집행 지점을 실제 코드로 만든다. 허용목록 밖 명령은 **프로세스가 생성되지 않고**, 한도 초과는 **프로세스가 종료되며**, 한 지점을 무력화해도 다른 지점이 막는다. 런 시작에 고정한 정책 해시를 두 지점이 각자 대조해 **런 중 정책 변조를 hardstop**한다.
- **127** — 실행 후 결과가 의도와 맞는지 기계로 대조하고, 폐기된 런의 비용을 기록해 `vhk stats`에 낸다.

### 비목표

| 항목 | 이유 |
|---|---|
| 머지 — 자동·반자동 전부. **머지 트리거 라벨(`auto-merge`) 부여·Ready 전환 포함** | ADR-009 ②. `.agents/skills/auto-merge`는 `auto-merge` 라벨이 붙은 PR을 사람이 명시 호출한 세션에서 머지한다. Ready 전환은 사람 하드게이트(오너 결정 2026-08-30). 계측 라벨 `autonomous`는 예외(§3.5) |
| 라벨 **생성** · PR **닫기** | 레인은 `gh label create`·`gh pr close`를 부르지 않는다. 저장소 메타데이터 생성·철회는 사람이 한다(§3.5) |
| `source`·`schema`·`security` 작업의 자동 push | `RISK_MAP`이 `human`이다(ADR-009 ③) |
| LLM·자연어 판정 | vhk-auto Skill INV-1·INV-4. 구조화 출력의 결정론 파싱과는 다르다(§3.1) |
| 간접 실행 차단(npm script 본문·설정 파일·shim 교체) | RFC 0067 §3.4 · §12 Q4 |
| 악의적 에이전트의 증거 위조 차단 | §3.12 |
| 허용목록 매칭 규칙 변경(와일드카드·슬롯) | RFC 0067 §3.2가 거부한 설계 |
| Windows shim 목록 확장 | 인젝션 표면 확대(§3.11) |
| `vhk receipt`·`vhk review`·`vhk verify` 신선도 로직 변경 | receipt가 게이트를 다시 실행한다(§3.2) — Q10 철회 |
| `.vhk/.gitignore`·`.vhk/.cloud`를 레인이 고치거나 커밋하는 것 | 사람이 `vhk policy show --fix-ignore` 뒤 커밋한다(§3.1) |
| OS-temp 잠금 잔재의 자동 정리 | RFC 0067 §5.3-3 정책 상속(§3.9) |
| 128 · 129 | 2.17.0 |
| MCP 노출 | 실행 부작용(RFC 0066 §8.4) |
| 기존 Skill 폐기 | 병존. INV-9·10·11 조건부 개정만(§3.10) |
| 이 RFC의 `Accepted` 승격 · 관찰 게이트 조건 변경 | 무변경 |

## 2. 상속하는 것

| 출처 | 상속 항목 |
|---|---|
| ADR-009 | 신규 서브커맨드 · 별도 모듈 없음 · 상한 push+PR · 리스크 티어 레인(③ — 자동 허용 = `chore`·`docs`·`deps`) · 안전 계약 4조각(④) |
| vhk-auto Skill INV-1~11 | 진행 허가 = verify green만 · HARD_STOP 선확인 · `runId` 시작/종결 쌍 · 커밋 직후 receipt · **단일 writer — 다른 writer가 있을 수 있는 worktree에서는 시작하지 않는다**(INV-11) · 범위 밖 변경 차단 |
| `vhk autonomy-log`(`agent.ts`) | 시작 = `startRun(cwd, runId, nowIso, snapshot.contentHash)` + start 라인 · 종결 = `withRunStateLock(synchronizeTermination, {ensureIgnored:false})` + `ensure*SnapshotLocked` + `runPolicyInvalidation` + `terminalKindChanged` 게이트 + terminal 라인. **레인은 이 경로를 그대로 재사용한다** |
| RFC 0056 · Goal 85 | 증거 원장은 기본 git 추적. dirty 판정은 self-tracked 제외. `.vhk/.gitignore`는 self-tracked가 **아니다**. `vhk verify`의 증거 커밋 대상은 **정확히** `.vhk/ledger.jsonl`·`.vhk/events/ai-actions.jsonl` 둘이며 `commitPaths` 실패는 verify가 삼킨다 |
| Goal 137 | 작업 기준선 SHA와 검증 신선도 분리 → `workSha`/`proofSha` |
| 111 · `pr-metrics.ts` | autonomous 코호트 = 종결 SHA 조인 **AND** `autonomous` 라벨. 둘 다 없으면 `interactive`, 하나만이면 `unknown` |
| RFC 0063 · `auto_pr_goal.ps1` | 상한 push+PR · 머지 0 · **현재 브랜치 == base 거부** · 열린 PR 조회·재사용 · `gh label create` 뒤 라벨 부착 |
| RFC 0066 | 플래그 · 베이스라인(§7.3 — 삭제·변조 둘 다 무흔적 방지) · 4층 부작용 · 권한 단계 · 위험도 · 혼합 커밋 `human`(§5.3) · 적용 지점 = 커밋·push(§5.2) · "깨지면 멈춘다, off 폴백 아님" |
| RFC 0067 | 허용목록 정확 일치 · `maxDurationSec` · `preflight` 5단계 · `TIME_LIMIT_WOULD_EXCEED` · run-state(카운터·시계·잠금·핀·TTL·잠금 잔재는 사람 정리) · 두 지점 독립성 · 진입점 · Q1·Q2·Q3·Q5 확정 |
| ADR-021 | 에이전트는 `vhk save --no-push -m`으로 로컬 커밋만. 레인은 작업 커밋을 만들지 않는다 |
| `vhk cloud push` | `.vhk/.gitignore`가 아니라 `DEFAULT_CLOUD_EXCLUDES`(`vhk-cloud.ts`)를 쓴다 — Git 무시와 cloud 제외는 **별개 표면**이다 |

## 3. 레인 구조 (126-T1 · 125b)

### 3.1 판정 원칙·스폰 3분류·사전 점검·한 런의 수명주기

**판정 원칙.** 합·불은 세 가지로만 정한다 — ① 종료 코드 ② 디스크 증거 ③ **구조화 출력의 결정론 파싱**(`gh --json` 필드값 · `git ls-remote --heads` 행 · porcelain). ③의 파싱은 호출 측 어댑터가 하고, 술어(`auto-postcheck`)는 **파싱된 값만** 받는다. `GuardedResult`는 `out`을 가지며(§3.4) 그것을 판정에 쓰는 곳은 라벨 점검·PR 재사용 조회·§4.1의 8·9단계 술어뿐이다.

| 분류 | 무엇 | 통로 | 허용목록·카운터·핀 |
|---|---|---|---|
| **수집** | 읽기 전용 git 조회 — 루트·HEAD·dirty·브랜치·변경 경로·특정 경로의 porcelain | 기존 함수: `git-repo.ts`의 `getGitRoot`·`getCommitInfo`, `git-session.ts`의 `currentBranch`·`statusPorcelain`, `task-kind.ts`의 `changedPathsBetweenDetailed` | **밖.** RFC 0066 §7.1의 "읽기 전용 git". §7.5 방식으로 횟수·argv를 단언 |
| **집행** | 부작용이 있거나 외부로 나가는 스폰 — 라벨 점검·에이전트·verify·receipt·push·원격 조회·PR 조회·PR 생성·라벨 | **`runGuardedCommand`만** — 전부 **런 시작 뒤** | **안.** 허용목록 정확 일치 + 카운터·시계 + 정책 핀 |
| **안전 종료** | 타임아웃·레인 종료 시 프로세스 트리 종료 | `safeExecFileDetailed` 내부(비동기) + 종료 훅(동기 — §3.11) | **밖.** argv는 상수 템플릿 + pid |

**0단계 사전 점검 — 순서가 곧 안전이다.** `.vhk`가 심볼릭 링크면 `readPolicyConfigSnapshot`은 그것을 탐지하지 못하고 `appendActionEntry`의 `mkdirSync`/`appendFileSync`는 링크 대상에 쓴다. 그래서 **루트 해석과 lstat가 어떤 설정 읽기·원장 쓰기보다 먼저**다. 판정 순서 전체는 §3.8.

| 항목 | 내용 |
|---|---|
| 루트 | `getGitRoot(process.cwd())`로 Git 루트를 얻어 **`process.chdir(root)`**. 이후 모든 경로(`HARD_STOP_PATH`·`writeHardStop`·policy·run-state)는 루트 기준이다. 실패(비-git) → exit 1, 쓰기 0 |
| lstat | `.vhk`가 정규 디렉터리·`.vhk/.gitignore`가 정규 파일·둘 다 비-심볼릭(`ensureVhkIgnored`의 throw 조건과 동일). 실패 → exit 1, **쓰기 0**(원장에도 쓰지 않는다 — 링크 대상 오염 방지) |
| 점검 대상 | `LANE_IGNORE_ENTRIES`(`policy-files.ts`) = **`src/` 전체의 `ensureVhkIgnored(` 호출 인자 전수 합집합**. 2026-08-30 실측 9곳: `POLICY_LOCAL_FILES`(`policy.json`·`policy-baseline.json`·`run-state.json`·`run-state.lock`·`run-state-recovery.lock`·**`goal-lease.json`**) · `POLICY_LOCAL_TEMP_PATTERNS`(`.policy-baseline.json.tmp-*`·`.run-state.json.tmp-*`·**`.goal-lease.json.tmp-*`**) · `reports/`(verify) · `receipts/`(receipt) · `backups/`(backup·agent-skill-templates) · `.synced`(sync) · `recall-log.jsonl`(recall-log) · `eval/recall-eval.json`(memory-eval) · `cloud.json`·`.cloud.json.tmp-*`(vhk-cloud). 회귀 테스트가 호출 인자를 모아 이 상수와 **정확히 같은지** 대조한다 |
| 판정 | `backup.ts`에서 순수 함수 `missingIgnoreEntries(content, entries)`를 추출해 같은 판정("`ensureVhkIgnored`가 쓰기를 하지 않을 상태")을 쓴다 |
| clean | `getCommitInfo(cwd)?.dirty === false` — `null`(조회 실패)은 시작 실패 |
| 실패 시 | 빠진 항목·사유 출력 + exit 1 + action-ledger 1줄(lstat 통과 뒤에만). 처방 = **`vhk policy show --fix-ignore`**(`LANE_IGNORE_ENTRIES`만 보강, 베이스라인 무변경) 뒤 사람이 커밋. `vhk policy baseline --confirm`은 처방으로 쓰지 않는다(핀 재고정 부작용) |
| 선행·마이그레이션 | 템플릿(`VHK_GITIGNORE_TEMPLATE`)에 `reports/`·`goal-lease.json`·`.goal-lease.json.tmp-*` 추가. `DEFAULT_CLOUD_EXCLUDES`에 `goal-lease.json` 추가(tmp는 기존 `.*.tmp-*`가 덮는다). 기존 프로젝트는 업그레이드 직후 `--fix-ignore` + 커밋(§8) |

```text
vhk auto [--goal <n>] [--dry-run] [--json]

 0 진입 검사   §3.8 판정 순서 ⓪~⑧ — 루트·lstat → 베이스라인 대조 → 설정 상태 → 사전 점검 → clean·브랜치(main/master/detached/auto.base 거부)
               → Goal 선언(§3.7) → worktree lease 상태. --dry-run 은 여기서 계획을 출력하고 끝난다(쓰기 0·스폰 0)
 1 lease+시작  acquireWorktreeLease(cwd, {goalId, runId, nowUtc}) — 임계구역 ①, 세대 번호 발급 (§3.9)
               → assertLeaseOwned → recordAutonomyStart(cwd, {runId, goal, sha: startSha, policyConfigHash}) — 기존 시작 경로(임계구역 ②)
 2 라벨 점검   집행: runGuardedCommand(`gh label list --json name --limit 200`).out 을 JSON 파싱 → 'autonomous' 없음 → blocked(LABEL_MISSING)
 3 구현 위임   assertLeaseOwned → 집행: runGuardedCommand(auto.agent, runId) — 환경변수 VHK_RUN_ID · VHK_GOAL_ID (§3.10)
 4 작업 SHA    수집: workSha = HEAD · workSha ≠ startSha · getCommitInfo(cwd)?.dirty === false · 브랜치 불변 · startSha..workSha 에 self-tracked 밖 경로 ≥ 1
 5 verify      집행: runGuardedCommand(`vhk verify`) → 직후 latest.json: commit.sha === workSha AND commit.dirty === false AND status === 'PASS'
               AND generatedAt ≥ 단계 시작 UTC
 6 증거 SHA    수집: proofSha = HEAD · (§3.2) proofSha === workSha 이면 증거 두 경로가 "추적 & 미커밋" 이 아니어야 하고,
               다르면 workSha..proofSha 의 변경 경로가 정확히 {.vhk/ledger.jsonl, .vhk/events/ai-actions.jsonl} 의 부분집합이어야 한다
 7 receipt     집행: runGuardedCommand(`vhk receipt`) → receipt-log 마지막 라인: sha === proofSha AND receiptTs ≥ 단계 시작 AND gateStatus === 'PASS'
               AND decision !== 'block' AND dirty === false AND stale === false
 8 위험도      수집: changedPathsBetweenDetailed(cwd, startSha, proofSha).paths.filter(!isSelfTrackedPath) → deriveTaskKindDetailed → riskClassOf === 'auto'
 9 push        assertLeaseOwned → 집행: runGuardedCommand(`git push -u origin HEAD`) → 술어: runGuardedCommand(`git ls-remote --heads origin`).out 파싱 → 현재 브랜치 == proofSha
10 PR          assertLeaseOwned → 집행: runGuardedCommand(`gh pr view --json headRefOid,baseRefName,isDraft,labels,state`)
               → exit 0 AND state OPEN 이면 **재사용**(생성 생략) · exit ≠ 0 이면 runGuardedCommand(`gh pr create --base <auto.base> --fill --draft`)
               → 라벨: labels[].name ∌ 'autonomous' 이면 runGuardedCommand(`gh pr edit --add-label autonomous`) — 실패 시 1회 재시도
               → 술어: runGuardedCommand(`gh pr view --json …`) 재조회 → headRefOid == proofSha · baseRefName == auto.base · isDraft · names ∋ 'autonomous' · names ∌ 'auto-merge'
11 종결        recordAutonomyTerminal(cwd, {runId, event, …}) — 기존 종결 경로 → releaseWorktreeLease(같은 runId·세대만)
               receipt.sha === terminal.sha === proofSha 가 isVerifiedComplete 조인 조건이다 — 7단계 뒤에 SHA 를 바꾸는 단계가 없다
```

| 원칙 | 내용 |
|---|---|
| 집행은 런 시작 뒤 | `runGuardedCommand`는 유효한 run-state 레코드·핀을 요구하고(`bumpCommandCount`는 미시작 runId를 거부한다) 레코드는 1단계에서 생긴다. 그래서 **어떤 집행 스폰도 1단계 앞에 오지 않는다** — 라벨 점검은 2단계다 |
| 시작·종결은 기존 경로 | `recordAutonomyStart`·`recordAutonomyTerminal`(`agent.ts` 액션 본문에서 추출·export). 정책 무효화 강등·`terminalKindChanged` 게이트를 우회하지 않는다 |
| 레인은 작업 커밋을 만들지 않는다 | 작업 커밋은 에이전트, 증거 커밋은 `vhk verify`. receipt 뒤 커밋 0 |
| 추적 파일을 더럽히지 않는다 | 쓰는 파일은 self-tracked 3종 + 무시 2종(Git·cloud 둘 다). `.vhk/.gitignore`·Goal 카드 무변경 |
| 재시도 없음 · 예외는 둘 | 단계 실패는 그 자리에서 종결. 예외: 10단계 라벨 부착 1회 재시도, 같은 브랜치의 열린 PR 재사용(재시도 런이 `gh pr create`에서 영원히 막히지 않게 — 현행 래퍼와 동일) |
| 종결 분기 | `hardstop`(+`HARD_STOP` 생성): 안전 위반(§4.1) · 런 중 핀 불일치·누락·손상(§3.6) · `clockAnomaly` · 단조성 위반 · 기록 실패 · `treeKilled:false` · **preflight `HARD_STOP_ACTIVE`**(에이전트가 만든 `HARD_STOP` — 이미 있으므로 새로 만들지 않고 종결만 `hardstop`) · lease fencing 실패(`LEASE_LOST`). `blocked`: 그 밖의 단계 실패 · 다른 deny · `require-human` · 위험도 `human` · 바인딩 깨짐 · `getCommitInfo` null · `treeKilled:null` · `LABEL_MISSING` · 라벨 부착 2회 실패 |
| 표본 자격 | 같은 원장·같은 코드 경로. 111 코호트는 `autonomous` 라벨로 성립 — 라벨 부착에 실패한 PR은 Q17 |

### 3.2 작업 SHA와 증거 SHA (Critical A)

| 사실 | 근거 |
|---|---|
| `vhk verify`는 리포트를 게이트 시작 시점 HEAD에 묶고, 끝나면 `commitPaths('chore(vhk): evidence ledger [skip ci]', [ai-actions.jsonl, ledger.jsonl])`로 증거 커밋을 만든다. **`commitPaths`의 반환값은 검사하지 않는다** — 훅·identity 실패 시 HEAD는 그대로고 두 파일은 staged/미커밋으로 남는다 | `src/commands/verify.ts` · `src/lib/git-session.ts` |
| 사용자 프로젝트에서 그 두 파일은 기본 추적이다. vhk 저장소 자신만 루트 `.gitignore`로 제외한다 | `.vhk/.gitignore` · `src/lib/evidence-ledger.ts` |
| `isSelfTrackedPath`는 `.vhk/events/*.jsonl` **전체**를 참으로 본다 — autonomy-run·receipt-log·policy-decision만 담긴 커밋도 통과시킨다 | `src/lib/self-tracked.ts` |
| `vhk receipt`는 `verifyEvidence(cwd)`를 다시 실행해 그 시점 HEAD에 묶은 새 리포트로 신선도를 판정한다. `ReceiptLogEntry.stale`은 `boolean \| null`이며 `null` = 미상 | `src/commands/receipt.ts` · `src/lib/receipt-log.ts` |

| 이름 | 정의 | 검사 시점 |
|---|---|---|
| `startSha` | 0단계 HEAD | — |
| `workSha` | 에이전트가 끝난 뒤 HEAD. `getCommitInfo(cwd)?.dirty === false` · `startSha..workSha`에 self-tracked 밖 경로 ≥ 1 | 4단계 |
| verify 리포트 | `commit.sha === workSha AND commit.dirty === false AND status === 'PASS'`(`'WARN'` 거부) | 5단계 직후, receipt 전 |
| `proofSha` | 5단계 뒤 HEAD. **두 경우만 통과** — (a) `proofSha !== workSha`: `changedPathsBetweenDetailed(cwd, workSha, proofSha)`가 **성공**하고 그 경로 집합이 `{.vhk/ledger.jsonl, .vhk/events/ai-actions.jsonl}`의 **비어 있지 않은 부분집합**(verify의 `commitPaths` 대상과 정확히 같다 — 다른 self-tracked 파일이 섞이면 실패) (b) `proofSha === workSha`: 그 두 경로가 **"추적 & 변경됨(staged 포함)"이 아니다** — `statusPorcelain`을 그 두 경로에 한정해 확인. 추적 프로젝트에서 `commitPaths`가 실패한 상태(HEAD 불변 + 증거 staged)는 여기서 `EVIDENCE_COMMIT_FAILED`로 `blocked` | 6단계 |
| receipt | `sha === proofSha` · `receiptTs ≥ 7단계 시작` · `gateStatus === 'PASS'` · `decision !== 'block'` · `dirty === false` · **`stale === false`**(`null`은 미상이라 거부) | 7단계 |

`self-tracked.ts`에 추가하는 `isEvidenceOnlyChange(paths)`는 (a)의 부분집합 판정 전용이며 허용 집합은 위 두 경로로 고정한다.

### 3.3 호출 측 집행 (125b-T2)

`auto.ts`는 집행 스폰 요청을 만들기 전에 매번 독립 `ctx`(`PreflightContext`)를 짓고 `preflight`를 돌며, 그 전에 §3.6의 정책 핀을 대조한다.

| `PreflightContext` 필드 | 호출 측이 어떻게 얻나 |
|---|---|
| `hardStopActive` | `existsSync(join(root, HARD_STOP_PATH))` — `ensureNotHardStopped`는 부작용 함수라 쓰지 않는다 |
| `allowlist` · `limits` | `readPolicyConfigSnapshot(root)` → `config.allow`·`config.limits`. 매 단계 다시 읽고 `contentHash`를 핀과 대조 |
| `level` | `lastLevelLine(root)` |
| `runCommandCount` · `startedAtUtc` · `lastSeenUtc` · `clockAnomaly` | `inspectRunRecord(root, runId)` — `missing`·`corrupt`면 fail-closed |
| `nowUtc` | 호출 측이 직접 잰다 |

| 판정 | 호출 측 동작 | 종결 이벤트 | 종료 코드 |
|---|---|---|---|
| `allow` | 요청을 만들어 실행 측으로 — `{bin, args, cwd, env}` + `runId` | — | — |
| `deny` — `HARD_STOP_ACTIVE` | 요청을 만들지 않는다. 원장 `site:'call'` | **`hardstop`**(파일은 이미 있음 — 재생성 없음) | 1 |
| `deny` — 그 밖 | 요청을 만들지 않는다. 원장 `kind:'allowlist'|'budget'`, `site:'call'` | `blocked` | 1 |
| `require-human` | 요청을 만들지 않는다. 사람이 풀 수 있음을 출력 | `blocked` | **2** |
| 핀 불일치·누락·손상 | 요청을 만들지 않는다 | `hardstop` | 1 |

전달 표면 —

```ts
interface GuardedRequest { bin: string; args: readonly string[]; cwd: string; env?: Readonly<Record<string, string>> }
interface GuardedRunContext { runId: string }
```

`env`는 에이전트 단계에만 쓰며 키는 `VHK_RUN_ID`·`VHK_GOAL_ID` 둘뿐이다(정적 가드).

### 3.4 실행 측 집행 — `runGuardedCommand` (125b-T1 · T3)

```text
runGuardedCommand(req, run): Promise<GuardedResult>
  1 policy 스냅샷 + 베이스라인 — 자기가 다시 읽는다
  2 HARD_STOP — existsSync 로 자기가 다시 확인 (→ preflight ① 가 HARD_STOP_ACTIVE deny)
  3 inspectRunRecord(runId) — missing · corrupt → fail-closed (TTL 판정은 §3.9 의 레인 계산)
  4 정책 핀 대조 (§3.6) — 불일치 → hardstop 반환, 프로세스 미생성
  5 진입 거부 목록 — argv 리터럴 '--force' '--force-with-lease' '--delete' '--mirror' → deny
  6 preflight(req, ctx) — 순수, 스폰 0 → commandCapSec · nextLastSeenUtc
  7 deny | require-human → 원장 site:'exec' → 반환. 프로세스 미생성
  8 bumpCommandCount(runId, baseCount) — 실행 전 +1 (CAS)
  9 await safeExecFileDetailed(bin, args, { cwd, env, timeoutMs: commandCapSec × 1000 })   (§3.11)
 10 반환 GuardedResult { verdict, exitCode, timedOut, treeKilled, durationMs, spawnError?, out, stderr } — out 상한 1 MiB
```

| 한도 | 어떻게 집행되나 | 필요한 변경 |
|---|---|---|
| 명령 하나 | `commandCapSec`(= `resolveClock`)를 `timeoutMs`로 — 초과 시 프로세스 종료 | `safeExecFileDetailed`(additive) |
| 런 누적 | 현행 `evaluateTimeBudget` — `elapsed + cap > perRunSec`이면 스폰 전 `TIME_LIMIT_WOULD_EXCEED` | 없음 |
| 호출 수 | `preflight` ③ + 실행 전 증가 | 없음 |

**run-state 단조성 대조** — 레인이 기억한 `startedAtUtc`·핀·`commandCount`와 어긋나면 `RUN_STATE_TAMPERED` hardstop. `guarded-exec.ts`는 자율 레인에서 `exec.ts`를 직접 import하는 유일한 모듈이다(정적 가드).

### 3.5 상한 — push + draft PR + 계측 라벨, 머지 없음 (126-T2)

허용목록은 argv 정확 일치다. 레인의 집행 argv **9개**는 전부 정적이며 사람이 `policy.json`에 리터럴 그대로 등록한다. `vhk policy show`가 9항목 존재·예산 부등식(§3.10)을 대조한다.

| # | 단계 | argv (정적) | 비고 |
|---|---|---|---|
| 1 | 2 라벨 점검 | `gh label list --json name --limit 200` | 기본 `--limit`은 30이라 명시. 200 초과 저장소는 §10 Q18 |
| 2 | 3 에이전트 | `auto.agent.bin` + `auto.agent.args` | §3.11 스폰 가능성 |
| 3 | 5 verify | `vhk verify` | |
| 4 | 7 receipt | `vhk receipt` | |
| 5 | 9 push | `git push -u origin HEAD` | 0단계에서 `main`·`master`·detached·**`auto.base`** 위 실행을 거부했다. `--force*`·`--delete`·`--mirror`는 §3.4 5단계 |
| 6 | 9 술어 | `git ls-remote --heads origin` | 행 파싱 |
| 7 | 10 조회·술어 | `gh pr view --json headRefOid,baseRefName,isDraft,labels,state` | 재사용 판정 1회 + 술어 1회 = 최대 2회 |
| 8 | 10 PR | `gh pr create --base <auto.base> --fill --draft` | 등록 리터럴의 base 토큰이 `auto.base`와 다르면 fail-closed. `--label`·`--head`·`--title`·`--body*`·`--web` 불가, `--draft` 강제 |
| 9 | 10 라벨 | `gh pr edit --add-label autonomous` | 리터럴 == `AUTONOMOUS_LABEL`. 실패 시 1회 재시도(최대 2회) |

호출 수 최대 = 1+1+1+1+1+1+2+1+2 = **11** → `perRunCommandCount ≥ 11`.

**base 브랜치.** 0단계는 `currentBranch`가 `main`·`master`·detached이거나 **`auto.base`와 같으면** 거부한다(현행 래퍼 `$branch -eq $BaseBranch` 거부와 동일). 9단계 push는 그 뒤에만 온다.

**PR 재사용.** 같은 브랜치의 열린 PR이 있으면(`gh pr view` exit 0 AND `state === 'OPEN'`) 생성을 건너뛰고 그 PR에 라벨·술어를 적용한다 — 라벨·술어 실패로 `blocked`된 런을 사람이 다시 부를 수 있게. 닫힌 PR만 있으면 새로 만든다.

**왜 라벨을 붙이나.** `classifyCohort`는 SHA 조인 AND 라벨을 요구한다. 레인은 라벨을 **생성하지 않고** 2단계에서 존재만 점검한다(부재 → `blocked` + 처방 "사람이 `gh label create autonomous` 1회"). 부착이 2회 실패하면 `blocked`이고 PR은 라벨 없이 남는다 — 그 PR은 `classifyCohort`가 `interactive`로 볼 수 있다(§10 Q17).

**머지·Ready 경로 부재의 정적 검사.** argv 리터럴 배열에 `'pr','merge'`·`'pr','ready'`·`'pr','close'`·`'label','create'`·`--merge`·`--squash`·`--rebase`·`--admin` 0건, `mergePullRequest`·`enableAutoMerge` 호출 0. 문자열 데이터(`auto-merge` 탐지)는 허용.

### 3.6 정책 해시 핀 (Critical B)

| 시점 | 동작 | 종료 코드 |
|---|---|---|
| 런 시작 전(§3.8 ①) | **베이스라인 대조가 off 분류보다 먼저다.** `policy-baseline.json`이 존재하는데 `policy.json`이 없거나(`POLICY_CONFIG_DELETED`) 해시가 다르면(`POLICY_CONFIG_MUTATED`) 시작 실패 + action-ledger 1줄. 고정된 정책을 지우거나 `enforce:false`로 바꾸거나 `auto`를 빼는 것은 해시 불일치라 여기서 잡힌다. 현행 `checkPolicyBaseline`은 설정 부재를 `mutated`로 보고하지 않으므로 레인이 베이스라인 파일 존재를 직접 본다. `HARD_STOP`은 만들지 않는다 | 1 |
| 매 집행 스폰 직전 — 양측 각자 | `verifyPolicyPin(record, snapshot, baseline)`: `POLICY_PIN_MISSING`·`POLICY_CONFIG_UNREADABLE`·`POLICY_BASELINE_INVALID`·`POLICY_PIN_MISMATCH` → **hardstop** | 1 |
| run-state 손상 | `RUN_STATE_CORRUPT` → hardstop | 1 |

테스트 — 런 중 정책 확장+재고정(양측 각각 hardstop) · 핀 누락 · 손상 · **시작 전 삭제·변조(베이스라인 있음) → exit 1 + 원장 1줄, off 아님** · 정적: 양측 `verifyPolicyPin` 호출 · 핀 값 전달 없음.

### 3.7 위험도 레인 (ADR-009 ③ · 126-T5) — 선언 + 대조

| 겹 | 언제 | 무엇 |
|---|---|---|
| 선언 | 0단계 | Goal 카드 `task_kind: chore \| docs \| deps` 필수. 미선언·`human` 유형 → 시작 실패(로컬 커밋도 생기지 않는다) |
| 대조 | 8단계 | `changedPathsBetweenDetailed(startSha, proofSha)` → self-tracked 제외 → `deriveTaskKindDetailed` → `riskClassOf === 'auto'`일 때만 push. 선언과 유도 kind의 차이는 둘 다 `auto`인 한 정보만(§10 Q15) |

**124와의 정합(126-T5) — 기존 함수 동작 변경.** `deriveRunScope`에 self-tracked 필터. 원장 `taskKind`·`riskClass`의 의미가 전후로 달라지고 `terminalKindChanged`와 상호작용한다 — 마이그레이션은 §8.

### 3.8 시작 판정 순서 (126-T4)

앞 행이 맞으면 거기서 끝난다. **`--dry-run`은 ⓪~⑧을 그대로 평가하되 어떤 행에서도 쓰지 않고(action-ledger 포함) 스폰도 하지 않으며**, ⑧까지 통과하면 계획(단계·argv·예산)을 출력하고 **exit 2로 끝난다 — lease·start·집행에 진입하지 않는다.** 라벨 점검은 집행 경로라 dry-run에서는 "런 시작 뒤 확인됨"으로만 표시한다.

| 순서 | 상태 | 동작 | 쓰기 | 스폰 | exit |
|---|---|---|---|---|---|
| ⓪ | Git 루트 해석 실패 · `.vhk`/`.vhk/.gitignore` lstat 실패(심볼릭·비정규) | 시작 실패 — 사유 출력. **원장에도 쓰지 않는다**(링크 대상 오염 방지) | 0 | 0 | 1 |
| ① | `policy-baseline.json` 존재 AND (`policy.json` 부재 OR 해시 불일치) | 시작 실패 — `POLICY_CONFIG_DELETED`/`MUTATED`. `HARD_STOP` 없음 | action-ledger 1줄 | 0 | 1 |
| ② | `policy.json` 부재(베이스라인도 없음) | 계획만 출력 | 0 | 0 | **2** (off) |
| ③ | `failClosed` | 시작 실패 + `reasonCode` | action-ledger 1줄 | 0 | 1 |
| ④ | `enforce:false` · `auto` 섹션 **부재** | 계획만 출력 | 0 | 0 | 2 |
| ⑤ | `enforce:true`인데 `sectionsUsable:false`(allow/limits) 또는 **`autoUsable:false`**(`auto`가 있으나 `{}`·타입 오류 — `policy-config`에 `autoUsable`·`AUTO_SECTION_INVALID` 추가) | 시작 실패 — 전용 사유 | action-ledger 1줄 | 0 | 1 |
| ⑥ | `baselineMissing`(설정은 있으나 한 번도 고정 안 됨) | 시작 실패 — 고정 안내 | action-ledger 1줄 | 0 | 1 |
| ⑦ | 사전 점검 항목 누락 · `getCommitInfo` null · dirty · `main`/`master`/detached/**`auto.base`** 브랜치 · Goal 미선언·`human` | 시작 실패 — 빠진 것·처방 출력 | action-ledger 1줄 | 0 | 1 |
| ⑧ | worktree lease 점유(`LEASE_HELD`·`LEASE_PENDING`) · 잠금 잔재(`RUN_STATE_LOCK_TIMEOUT`) | 시작 실패 | action-ledger 1줄 | 0 | 1 |
| ⑨ | 통과 → lease + start → 2~11단계 | 전체 레인 | 런 원장·run-state·lease | 허용목록 안에서만 | 0 / 1 / 2 |

**action-ledger 엔트리(①③⑤⑥⑦⑧ 공통).** `{ ts, action: 'auto', channel: 'cli', guard: 'preview', ran: false, reason: 'auto-start-refused', result: <사유코드> }` — 기존 닫힌집합 값만 쓴다. `guard:'preview'`·`ran:false`는 "보여주기만 하고 실행하지 않았다"는 기존 뜻이며 `stats`·recap 집계는 `action`별로 세므로 `action:'auto'`가 기존 항목을 오염시키지 않는다(테스트로 고정).

### 3.9 worktree 단일 lease — 세대 번호와 fencing (126-T7)

잠금의 사실 — `withRunStateLock`은 비재진입이고 죽은 PID의 잠금도 자동 삭제하지 않으며, `startRun`은 자기 안에서 잠금을 잡고, read/write는 모듈 비공개다. Skill INV-11은 "다른 writer가 있을 수 있는 worktree에서는 시작하지 않는다"다 — Goal별 lease로는 `--goal 3`과 `--goal 4`가 같은 worktree에서 동시에 뜬다. 그래서 —

| 항목 | 내용 |
|---|---|
| 단위 | **worktree당 lease 하나.** `.vhk/goal-lease.json` = `{ goalId, runId, leasedAtUtc, generation }` 단일 객체 |
| `acquireWorktreeLease(root, { goalId, runId, nowUtc })` → `{ ok: true; generation } \| { ok: false; reason: 'LEASE_HELD' \| 'LEASE_PENDING'; heldBy }` | `run-state.ts`에 additive. `withRunStateLock` 임계구역 ①에서 점유 판정 후 `generation = (기존 ?? 0) + 1`로 쓴다. 레코드는 만들지 않는다 |
| 점유 판정 | lease 없음 → 획득. 있으면 그 `runId`의 레코드를 본다 — ⓐ `valid`이고 `now − lastSeenUtc ≤ RUN_STATE_TTL_SEC` → `LEASE_HELD`(Goal이 달라도) ⓑ `valid`이고 TTL 초과 → 인수 ⓒ `missing`이고 `now − leasedAtUtc ≤ LEASE_GRACE_SEC`(60초, Q16) → `LEASE_PENDING` ⓓ `missing`이고 유예 초과 → 인수 |
| `assertLeaseOwned(root, { runId, generation })` | 잠금 안에서 lease를 다시 읽어 `runId`·`generation`이 내 것과 같아야 통과. 다르면 `LEASE_LOST` → **`hardstop`**(다른 런이 이미 같은 worktree를 소유했다는 뜻이므로 즉시 멈춘다). 호출 지점: 1단계 `recordAutonomyStart` 직전 · 3단계 에이전트 스폰 직전 · 9단계 push 직전 · 10단계 PR 직전 · 11단계 종결 직전 |
| fencing이 막는 시나리오 | A가 lease를 쓰고 60초 넘게 정지 → B가 ⓓ로 인수(세대 +1) → A가 깨어나 `recordAutonomyStart` 직전 `assertLeaseOwned` → 세대 불일치 → A `hardstop`, 레코드도 에이전트도 만들지 않는다 |
| 잠금 잔재 | 임계구역 안에서 죽으면 OS-temp 잠금이 남아 다음 `withRunStateLock`이 `RUN_STATE_LOCK_TIMEOUT` → §3.8 ⑧ exit 1 + 경로 안내. 사람이 정리한 뒤에야 인수 규칙이 동작한다(RFC 0067 정책 상속) |
| 해제(11단계) | 잠금 안에서 `runId`·`generation`이 내 것일 때만 삭제 |
| 사람 해제 | `vhk policy show`가 lease(Goal·runId·세대·나이·레코드 상태)를 표시. 파일 항목 수동 삭제(Q13) |
| 에이전트에 | `VHK_GOAL_ID=n`. Skill은 그 카드만 다룬다 |

테스트 — 동시 시작 2 프로세스(같은 Goal·다른 Goal 둘 다 하나만 성공) · 유예 창 · TTL 인수 · **인수 뒤 옛 프로세스 재개 → 스폰 0·hardstop** · 잠금 잔재 · 세대 불일치 해제 거부 · `auto.ts`가 `startRun(`·`withRunStateLock(`을 직접 부르지 않음(정적).

### 3.10 에이전트 위임 — 한계·예산·Skill 개정 (126-T8)

| 사실 | 함의 |
|---|---|
| 에이전트 내부 명령은 허용목록 밖 | 진행 허가는 결정론 증거만(RFC 0067 §3.4) |
| 에이전트 세션은 길다 | 에이전트 항목에만 `AllowEntry.maxDurationSec` |
| 예산 부등식 | 호출 최대 11회(§3.5). `vhk policy show`: `perRunSec ≥ Σ(항목 cap × 최대 호출 수) + 여유`, `perRunCommandCount ≥ 11`. 여유 `max(60초, Σ의 10%)`는 추정 — 실사용 1회 뒤 재조정 |

**Skill 개정(`VHK_RUN_ID` 조건부, 없으면 종전과 같다).** INV-9: start·종결 이벤트 생략(레인 소유), Goal은 `VHK_GOAL_ID`만. INV-10: `vhk receipt` 생략. INV-11: clean 검사는 `getCommitInfo` 규칙(self-tracked 제외; `.vhk/.gitignore` 포함 그 밖은 거부). INV-1·4의 `vhk verify`는 그대로 허용(증거 커밋은 `startSha..workSha` 안, 4·8단계가 흡수).

### 3.11 Windows 스폰·안전 종료·실행 결과 계약 (Important F)

| 사실 | 근거 |
|---|---|
| `ExecResult`에 종료 코드·타임아웃·소요 시간 없음 · 타임아웃은 직접 자식에만 `SIGTERM` | `src/lib/exec.ts` |
| win32 `SHIM_BINARIES`(…`vhk`…)만 `cmd.exe` 래핑 → `vhk verify`·`vhk receipt`의 직접 자식은 `cmd.exe`, 실제 작업은 손자. `codex`·`claude` 없음 | 같은 파일 |
| npm 전역 CLI는 `.cmd` shim — bare `ENOENT`, `.cmd` 직접 `EINVAL` | Node CVE-2024-27980 |
| Node는 win32에서 `SIGTERM`을 전달하지 않는다. `exit` 훅은 동기만. commander는 `parseAsync` | Node 문서 · `src/index.ts` |

| 변경 | 내용 |
|---|---|
| `exec.ts` `safeExecFileDetailed(cmd, args, opts): Promise<DetailedExecResult>` | `spawn` + 자체 타이머. `{ ok, exitCode, signal, timedOut, treeKilled: boolean \| null, durationMs, out, stderr, spawnError? }`. 기존 3함수 무변경 |
| 안전 종료 스폰 | win32 `taskkill /PID <pid> /T /F` · posix `detached` 그룹 `kill(-pid,'SIGKILL')`. 정규화: 성공/이미 없음(`ESRCH`) → `true` · `taskkill` 부재·권한 거부 → `null` · 그 밖 → `false`. 레인: `false` → hardstop, `null` → blocked |
| 레인 자신의 종료 | `guarded-exec.ts`가 살아 있는 자식 pid를 보관하고 **동기** `killTrackedChildrenSync()`(win32 `safeExecFile('taskkill',…)`·posix `process.kill(-pid)`)를 export. `auto.ts`: posix `SIGINT`·`SIGTERM`·`exit` / win32 `SIGINT`·`exit`에서 호출 + `blocked` 종결 기록 시도. **못 잡는 것:** win32 `taskkill /F`·콘솔 닫힘·`SIGKILL`·전원 차단 → TTL 인수(§3.9)와 사람 |
| 에이전트 실행 파일 | shim 확장 없음. `auto.agent.bin`은 `node`+절대경로 또는 네이티브 `.exe`. `.cmd`·`.bat`·확장자 없는 npm CLI 이름은 `policy show` 경고 + `SPAWN_UNSUPPORTED` 거부 |

### 3.12 위협 모델

| 위협 | 막나 | 어디서 |
|---|---|---|
| 폭주(무한 루프·호출 폭주·장시간 점유) | 막는다 — 직접 자식 | 허용목록·카운터·시계·이중 집행·타임아웃 |
| 손자 프로세스 잔존 | 부분 — 트리 종료 시도, 실패 시 hardstop | §3.11 |
| 레인 자신이 죽은 뒤 고아 | 부분 — 잡히는 신호에서만 정리 | §3.11 · §3.9 |
| 같은 worktree 이중 실행(같은 Goal·다른 Goal·인수 뒤 재개) | 막는다 | 단일 lease + 세대 fencing(§3.9) |
| 레인이 허용되지 않은 명령을 띄우는 것 | 막는다 | 두 집행 지점 |
| 런 중 `policy.json` 변조(재고정 포함) | 막는다 | 핀(§3.6) |
| 런 시작 전 정책 삭제·변조 | 탐지 + 기록 — off로 위장 불가 | §3.8 ① |
| `.vhk` 심볼릭 링크로 원장 쓰기 유도 | 막는다 — lstat이 모든 쓰기보다 먼저 | §3.8 ⓪ |
| run-state 되돌리기 | 부분 — 단조성 대조 | §3.4 |
| `human` 작업의 로컬 커밋 | 부분 — 선언이 시작을 막고 유도 `human`은 push 없음 | §3.7 |
| 증거 파일 직접 위조 | 안 막는다 — 128·CI 필수 검사의 축 | — |
| PR 즉시 머지·Ready | 막는다 | 머지·Ready·close 경로 부재 · `--draft` · `auto-merge` 부재 |

## 4. 실행 후 출력 검증 + 폐기 비용 (127)

### 4.1 기대 결과 술어 (127-T1)

`src/lib/auto-postcheck.ts` — 순수 함수. 입력 필드명 고정: `startSha`·`workSha`·`proofSha`·`branch`·`dirty`·`report{commitSha, commitDirty, status, generatedAt}`·`evidence{rangeOk, paths[], trackedDirtyEvidence: boolean}`·`receipt{sha, receiptTs, gateStatus, decision, dirty, stale}`·`remoteHeads: Array<{sha, branch}>`·`pr{headRefOid, baseRefName, isDraft, state, labelNames: string[]}`·`stepStartedAtUtc`. 원문 문자열 필드는 없다.

| 단계 | 기대 결과 | 불일치 시 |
|---|---|---|
| 4 작업 SHA | `workSha ≠ startSha` AND `dirty === false` AND `branch` 불변 AND self-tracked 밖 변경 ≥ 1 | `blocked` |
| 5 verify | `report.commitSha === workSha` AND `report.commitDirty === false` AND `report.status === 'PASS'` AND `generatedAt ≥ stepStartedAtUtc` | `blocked` |
| 6 증거 SHA | (`proofSha !== workSha` AND `evidence.rangeOk` AND `paths ⊆ {ledger.jsonl, events/ai-actions.jsonl}` AND `paths ≠ ∅`) OR (`proofSha === workSha` AND `!evidence.trackedDirtyEvidence`) | `blocked`(`EVIDENCE_COMMIT_FAILED` 등) |
| 7 receipt | `sha === proofSha` AND `receiptTs ≥ stepStartedAtUtc` AND `gateStatus === 'PASS'` AND `decision !== 'block'` AND `dirty === false` AND **`stale === false`** | `blocked` |
| 9 push | `remoteHeads`에서 현재 `branch` 행의 `sha == proofSha` | `blocked` |
| 10 PR | `pr.headRefOid == proofSha` AND `pr.baseRefName == auto.base` AND `pr.isDraft === true` AND `pr.state === 'OPEN'` AND `labelNames ∋ AUTONOMOUS_LABEL` AND `labelNames ∌ 'auto-merge'`. 외부 라벨은 정보만 | `auto-merge` 존재 또는 `isDraft === false` → **`hardstop`** · 그 밖 → `blocked` |

### 4.2 폐기 실행 비용 (127-T2 · T3)

자기 보고 `vhk cost add --usd <n> --run-id <runId>` · `CostEntry.runId?` optional · `vhk stats`가 종결 이벤트와 조인해 `hardstop`·`blocked` 런 = 폐기로 집계 · 표본 0 정직 표기 · 판정에는 안 쓴다(RFC 0067 Q2).

### 4.3 `perRunSec` 초과 처리

현행 `TIME_LIMIT_WOULD_EXCEED` 사전 거부 유지(Q5=D). 잔여시간 캡은 철회.

## 5. 모듈 경계

### 신설

| 경로 | 책임 | 단위 |
|---|---|---|
| `src/lib/guarded-exec.ts` | `runGuardedCommand` · 진입 거부 · 자식 pid 보관 · `killTrackedChildrenSync`. `exec.ts` 직접 import 유일 | 125b |
| `src/lib/policy-pin.ts` | `verifyPolicyPin` — 순수 | 125b |
| `src/commands/auto.ts` | 루트 해석·판정 순서·사전 점검·수명주기·호출 측 preflight·핀·파싱 어댑터·술어 호출·기존 시작/종결 경로 호출·종료 훅 | 126 |
| `src/lib/auto-postcheck.ts` | §4.1 술어 — 순수 | 127 |

### 수정

| 경로 | 변경 | 성격 | 단위 |
|---|---|---|---|
| `src/lib/exec.ts` | `safeExecFileDetailed` | additive | 125b |
| `src/commands/agent.ts` | `recordAutonomyStart`·`recordAutonomyTerminal` 추출·export | 리팩터 | 126-T7 |
| `src/commands/agent.ts` `deriveRunScope` | self-tracked 필터 | **동작 변경** | 126-T5 |
| `src/lib/run-state.ts` | `acquireWorktreeLease`·`assertLeaseOwned`·`releaseWorktreeLease` | additive | 126-T7 |
| `src/lib/policy-files.ts` | `goal-lease.json`·`.goal-lease.json.tmp-*`·`LANE_IGNORE_ENTRIES` | additive | 126-T6 |
| `src/lib/vhk-cloud.ts` | `DEFAULT_CLOUD_EXCLUDES`에 `goal-lease.json` + 회귀 테스트(`POLICY_LOCAL_FILES ⊆ cloud 제외`) | additive | 126-T6 |
| `src/lib/backup.ts` | `missingIgnoreEntries` 추출 | 리팩터 | 126-T6 |
| `src/templates/vhk-dir.ts` | `reports/`·`goal-lease.json`·`.goal-lease.json.tmp-*` | additive | 126-T6 |
| `src/lib/self-tracked.ts` | `isEvidenceOnlyChange(paths)` — 허용 집합 = verify 증거 두 경로 | additive | 126-T6 |
| `src/lib/policy-config.ts` | `auto` 섹션 파싱 + `autoUsable` + `AUTO_SECTION_INVALID` | additive | 126 |
| `src/commands/policy.ts` + `src/index.ts` + `src/i18n/ko.ts` | `policy show`: 9항목·부등식·`--force*`·win32 경고·lease·사전 점검·**`--fix-ignore`** | additive | 126-T8 |
| Goal 카드 frontmatter | optional `task_kind` | additive | 126-T7 |
| `src/lib/cost-ledger.ts` · `src/commands/cost.ts` · `src/commands/stats.ts` | `runId` · 비용 섹션 | additive | 127 |
| 등록 4지점 + `nlp-router` | `auto` | additive | 126-T3 |
| `.agents/skills/vhk-auto/SKILL.md` INV-9·10·11 | 조건부 한 줄씩 | additive | 126-T8 |
| `tests/policy-purity.test.ts` | `policy-pin`·`auto-postcheck` | additive | — |
| `COMMANDS.md` · `README.md` · `CHANGELOG.md` | 사용법 · 마이그레이션 | — | 126 |

### 손대지 않는 것

`command-allowlist.ts` · `execution-preflight.ts`·`execution-limits.ts` · `hard-stop-guard.ts` · `action-ledger.ts` · `autonomy-log.ts` 스키마 · `receipt.ts`·`receipt-log.ts` · `commands/receipt.ts`·`review.ts`·`verify.ts` · `goal-frontmatter.ts` · `task-kind.ts` · `pr-metrics.ts`(Q17이 (B)면 예외) · `state-files.ts`(`writeHardStop` — 루트로 `chdir`하므로 그대로) · `src/mcp/**` · `overnight-vhk-auto` Skill. 루트 `.gitignore` 추가 0.

## 6. CLI 표면

| 항목 | 계약 |
|---|---|
| 명령 | `vhk auto [--goal <n>] [--dry-run] [--json]` — top-level, 서브커맨드 없음 |
| 한글 별칭 | `자율`(Q4) |
| TTY | 불요. 프롬프트 0 |
| 종료 코드 | **0** complete + PR · **1** `blocked`·`hardstop`·시작 실패(§3.8 ⓪①③⑤⑥⑦⑧) · **2** off(②④)·dry-run 통과·`require-human` |
| 실행 위치 | 어디서 불러도 0단계에서 Git 루트로 `chdir` |
| MCP | 미노출 |

등록 4지점 — `index.ts`(`auto` + `policy show --fix-ignore`) · `command-registry.ts` · `cli-args.ts` · `ko.ts` · `nlp-router.ts` · `COMMANDS.md`·`README.md`.

## 7. 테스트 전략

| 축 | 케이스 | 단위 |
|---|---|---|
| 정적 — 머지·Ready·close·라벨 생성 부재 | §3.5 토큰 0건 · `mergePullRequest`·`enableAutoMerge` 0 | 126 |
| 정적 — draft·가변 인자·라벨 상수·base 리터럴 | PR argv 빌더 타입에 `label`·`head`·`title`·`body`·`draft(해제)` 없음 · argv 6토큰 · `AUTONOMOUS_LABEL` · base 토큰 == `auto.base` | 126 |
| 정적 — import 경계 | `auto.ts`: `exec.js`·`child_process` import 0 · `git-session.js` 쓰기 함수·`updateFrontmatterStatus` import 0 · `startRun(`·`withRunStateLock(` 직접 호출 0 · `recordAutonomyStart(`·`recordAutonomyTerminal(`·`acquireWorktreeLease(`·`assertLeaseOwned(` 호출 | 126 |
| 정적 — 전달 표면·순수성·exec 3함수 불변·`exit` 훅 동기 | §3.3·§3.11 | 125b |
| 사전 점검 | `src/` `ensureVhkIgnored(` 인자 전수 == `LANE_IGNORE_ENTRIES` · 누락 항목 → exit 1 · lstat 실패 → exit 1 **쓰기 0** · 통과 상태에서 런 전체 `.vhk/.gitignore` 불변 · `--fix-ignore`는 베이스라인 무변경 · `POLICY_LOCAL_FILES ⊆ DEFAULT_CLOUD_EXCLUDES` | 126-T6 |
| 판정 순서 | §3.8 ⓪~⑧ 각 행의 exit·쓰기·스폰 · **베이스라인 있는 상태에서 policy.json 삭제/`enforce:false`/`auto` 제거 → exit 1(off 아님)** · `auto` 손상 → exit 1 · `--dry-run`은 모든 행에서 쓰기 0·스폰 0, 통과 시 exit 2 | 126-T4 |
| 이중 집행 9케이스 · 핀 · 한도 · 단조성 | RFC 0067 §9.3 · §3.6 | 125b |
| 집행은 시작 뒤 | 정적: 1단계 앞에 `runGuardedCommand(` 호출 0 · 동적: 라벨 점검이 유효 레코드 아래서 실행됨 | 126 |
| lease | §3.9 테스트 목록 전부 | 126-T7 |
| 수명주기 | 무시 저장소 · 추적 저장소 통합(사전 점검 통과 → start → Skill clean 규칙 → 증거 커밋 → receipt 재검증 `stale:false`) · **`commitPaths` 실패 주입 → `EVIDENCE_COMMIT_FAILED` blocked** · receipt-log만 담긴 커밋 → blocked · verify `WARN` → blocked · receipt `gateStatus` WARN → blocked · **receipt `stale:null` → blocked** · 과거 receipt 재사용 → blocked · `HARD_STOP` 생성 뒤 다음 스폰 → `hardstop` 종결 · 종결이 기존 경로를 지남 | 126 |
| 위험도 | §3.7 · `deriveRunScope` 회귀 · 미종결 런 재시도 `terminalKindChanged` 회귀 | 126-T5 |
| PR 경로 | 열린 PR 재사용 · 닫힌 PR만 → 생성 · 라벨 1회 실패 → 재시도 성공 · 2회 실패 → blocked(PR 라벨 없음 — Q17) · `auto-merge` → hardstop · `--limit 200` 정적 | 126-T2 · 127 |
| Windows·안전 종료·종료 훅 | §3.11 | 125b |
| 별칭 · 4층 off 스냅샷 · 비용 조인 · 공통 게이트 | — | 전부 |

**실사용.** 로드맵 §9 2.16.0 행 두 가지 + 추가 1: 추적 저장소 임시 프로젝트(라벨 선생성·`docs` 선언 Goal)에서 정상 런 1회 → `autonomous` draft PR · 머지·Ready 없음 · `vhk stats` autonomous 코호트 집계 · 같은 브랜치 재호출 시 PR 재사용. 로드맵 행 개정은 Q8.

## 8. 기존 기능과의 호환성

| 대상 | 영향 | 근거 |
|---|---|---|
| `safeExecFile` 3종 · 사람 CLI | 없음 | 집행은 `runGuardedCommand`→`safeExecFileDetailed`만 |
| `vhk verify`·`receipt`·`review` | 없음 | 신선도 로직 무변경 |
| `vhk autonomy-log` | 없음(리팩터 — 기존 테스트로 고정) | §5 |
| **124 종결 원장(`deriveRunScope`)** | **동작 변경** — 도입 전 미종결 런이 있으면 재시도 시 `terminalKindChanged` exit 1 → 도입 커밋 전에 종결(CHANGELOG + 회귀) | 126-T5 |
| **`POLICY_LOCAL_FILES` 확장** | 기존 프로젝트 1회 마이그레이션 — 첫 run-state 접촉(`autonomy-log start` 포함)이 `.vhk/.gitignore`를 자동 수정 → CHANGELOG "업그레이드 직후 `vhk policy show --fix-ignore` + 커밋" | 126-T6 |
| `vhk cloud push` | `goal-lease.json` 제외 추가 — 그 전에는 lease·runId가 업로드될 수 있다 | 126-T6 |
| `ensureVhkIgnored` · 템플릿 | 리팩터 / 항목 추가 | — |
| Skill · 래퍼 | INV 조건부 / 병존 | Q3·Q7 |
| 원장 스키마 5종 | 추가 0 | — |
| Goal 카드 · lease 파일 · `cost.jsonl` · `policy.json` | optional 키·신규 무시 파일 | — |
| 저장소 라벨 | `autonomous` 라벨은 사람이 1회 생성 | §3.5 |
| 111 코호트 | 라벨 부착 실패 PR은 `interactive`로 보일 수 있다 | Q17 |

## 9. 구현 순서 (게이트 통과 후)

| 순서 | 내용 | 커밋 경계 |
|---|---|---|
| 1 | 125b-T1 `guarded-exec.ts`·`policy-pin.ts`·`exec.ts` | **별도 PR · 사람 리뷰**(security) |
| 2 | 126-T5·T6·T7 선행 조각 — `deriveRunScope`(CHANGELOG·마이그레이션) · `agent.ts` 추출 · lease 함수 · `LANE_IGNORE_ENTRIES` · `missingIgnoreEntries` · 템플릿 · cloud 제외. 선행 조건: 기존 프로젝트 `--fix-ignore` + 커밋 | |
| 3 | 126-T1·T3·T4 `auto.ts` 골격 · 판정 순서 · 등록 4지점 · `policy show`·`--fix-ignore`(T8 일부) | 스폰 없는 상태에서 먼저 |
| 4 | 125b-T2·T3 호출 측 집행·핀·한도·단조성·9케이스 | |
| 5 | 126-T2·T8 라벨 점검 · push · PR 재사용/생성/라벨 · 어댑터 · 종료 훅 · Skill INV | |
| 6 | 실사용 → 예산 여유 재조정 → `vhk receipt` → 126 완료 | |
| 7 | 127-T1~T3 | |

## 10. 미해결 질문 — 사람이 결정할 것

| # | 질문 | 선택지 | 상태·추천 |
|---|---|---|---|
| Q1 | 에이전트 명령의 출처 | (A) `policy.json auto.agent`(보호됨) (B) `.vhk/config.json` | **(A)** |
| Q2 | PR draft | — | **확정: draft만** |
| Q3 | `auto_pr_goal.ps1` 처리 | (A) 안정 뒤 폐기 (B) 병존 | (A) |
| Q4 | 한글 별칭 | (A) `자율` (B) `자동` | **(A)** |
| Q5 | `perRunSec` 초과 | (D) 현행 사전 거부 유지 | **(D)** |
| Q6 | 관찰 게이트 계속 + `enforce` | 사람 결정 | — |
| Q7 | Skill 개정 범위 | (A) INV-9·10·11 조건부 (B) 레인 밖 INV-11도 | (A) 이번 |
| Q8 | 로드맵 §9 2.16.0 행 개정 | (A) 개정 (B) RFC만 | **(A)** |
| Q9 | 선행 RFC 0066·0067 Draft | (A) reconcile→Accepted (B) 오너 예외 | 사람 게이트 |
| Q10 | ~~신선도 관용~~ | — | 철회 |
| Q11 | `task_kind` 필수 | (A) 필수 (B) 선택 | **(A)** |
| Q12 | receipt-log `runId` | (A) 이번 (B) 127 뒤 | (B) |
| Q13 | lease 사람 해제 | (A) 수동 삭제 + `policy show` (B) 전용 플래그 | (A) |
| Q14 | 111 코호트 조인 | (A) 라벨 부착(이 RFC) (B) `classifyCohort` 예외 | **(A)** |
| Q15 | auto 티어 드리프트 | (A) 정보만 (B) 순위 초과 blocked | (A) |
| Q16 | `LEASE_GRACE_SEC` | (A) 60초 (B) 실사용 뒤 조정 | (A)로 시작 |
| Q17 | 라벨 부착에 2회 실패한 PR(라벨 없음·`blocked`)이 `classifyCohort`에서 `interactive`로 보이는 것 | (A) 사람이 라벨 수동 부착(안내 출력, 이 RFC) (B) `pr-metrics.ts`에 "레인이 만든 PR(head SHA가 blocked terminal과 일치)은 `unknown`" 예외 | (A) 이번 · (B)는 실사용에서 빈도 확인 뒤 |
| Q18 | 라벨이 200개를 넘는 저장소 | (A) `--limit 200` 고정(이 RFC) (B) `--search autonomous` 병행 | (A) — 넘으면 `LABEL_MISSING`으로 fail-closed, 사람이 확인 |

## 11. 관련

- [ADR-009](../adr/ADR-009-vhk-auto-extension-not-new-module.md) · [ADR-021](../adr/ADR-021-save-high-risk-promotion.md)
- [RFC 0056](0056-vhk-evidence-receipt.md) · [RFC 0063](0063-overnight-vhk-auto.md) · [RFC 0066](0066-permission-levels-design.md) · [RFC 0067](0067-command-allowlist-budget-design.md)
- 로드맵 `docs/roadmap/2.x-roadmap.md` §관찰 게이트 개정 · §2.16.0(126-T1~T8) · §9 검증 · 작업 단위 111
- PR #617 — 검증 이력·Codex 리뷰 코멘트
