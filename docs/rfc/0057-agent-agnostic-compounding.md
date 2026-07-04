# RFC 0057 — Agent-Agnostic Compounding: 어떤 에이전트가 와도 안 무너지는 자가진화 VHK

> 상태: Draft (트랙③ 문서화 완료 · 트랙①②는 별도 작업으로 병행 진행 중) · 작성: 2026-07-04
> 출처: 사용자(백요한) VHK 정체성 재확인(2026-07-03~04 세션, 브레인스토밍 중 스코프 제안) + opus 에이전트 실측 감사(`af2c63b06d9237732`)
> 연동: RFC 0055(Proof Protocol, archived) · RFC 0056(Evidence Receipt) · RFC 0054(자율형 진화) · RFC 0052(풀사이클 뒷단) · ADR-006(정체성 확정) · ADR-007(서브에이전트 정책) · `src/templates/ecosystem-mdc.ts` · `src/lib/receipt.ts`/`receipt-log.ts` · `.claude/settings.json` · `docs/state/next-task.md`

---

## §0. 핵심 정리

사용자가 이번 세션에서 VHK의 정체성을 명시적으로 재확인했다: **VHK는 어떤 AI 에이전트가 와도(그리고 더 뛰어난 모델이 메인을 대체해도) 무너지지 않아야 하고, 에이전트가 내는 실수·문제를 데이터로 모아 자가진단·자가발전하여 점점 이 1인 개발자에게 최적화되는 자가진화 복리 루프여야 한다.**

이를 실측 감사(opus 에이전트가 코드를 직접 Read)로 검증한 결과, 좋은 소식 하나와 격차 셋을 확인했다:

| # | 발견 | 판정 |
|---|------|------|
| 1 | 실행 계층(win/reinforce/evolve/receipt/stats/loop)은 이미 에이전트 무관 | ✅ 이미 충족 |
| 2 | 트리거 계층(SessionStart/Stop 훅)은 Claude Code 전용 | ❌ 구조적 격차(오늘 해소 안 함) |
| 3 | VHK 자기 코드(`ecosystem-mdc.ts`)가 "Claude Code=primary" 모순 문구를 매 프로젝트에 심음 | ❌ 트랙①에서 별도 수정 중 |
| 4 | receipt/ledger에 "누가(어떤 에이전트가) 했는지" 필드가 0건 | ❌ 트랙②에서 별도 수정 중 |

오늘은 근거가 확실한 3개 트랙(①ecosystem.mdc 모순 제거 ②receipt/ledger agent 필드 ③이 문서 — RFC 정식화 + 트리거 격차 정직 문서화)만 착수하고, 더 크고 철학적인 2개 결정(메모리 프라이버시 긴장·할루시네이션 감소 루프)은 후속 RFC로 명시적으로 유보한다.

## §1. 배경 — 사용자의 정체성 선언

이번 세션에서 사용자가 직접 말한 원문 취지(한국어 세션, 요지 인용):

> "VHK는 어떤 AI 에이전트(Claude Code, Codex, Cursor, OpenCode, 중국 모델, Antigravity, N8N, GitHub Copilot, Notion 등)가 일해도, 혹은 더 뛰어난 모델이 메인으로 대체돼도 시스템이 무너지지 않아야 한다. 게다가 에이전트가 실수·문제를 내면 그걸 데이터로 모아서 자가진단·자가발전 → 점점 진화 → 이 1인 개발자에게 최적화되는 자가진화 복리 루프여야 한다. 구체적으로: AI 할루시네이션을 계속 감소시키고, 도메인·지식·정보·맥락·의도를 점점 더 잘 이해하고(모호한 입력에도), 정확성이 점점 높아지고, 사용자 취향이 쌓여서 AI가 사용자를 더 잘 이해하고, 어떤 작업을 해도 문제가 덜 생기며, 이 모든 게 어떤 에이전트가 실행하든 복리로 작용해야 한다."

이 선언을 분해하면 VHK가 충족해야 할 두 축이 나온다:

1. **에이전트 불가지론(agent-agnostic)** — 어떤 실행 주체(Claude Code/Codex/Cursor/OpenCode/기타 모델/자동화 플랫폼/사람)가 오든 VHK의 규율·게이트·기억이 똑같이 작동해야 한다. 특정 벤더·모델에 종속되면 그 벤더가 사라지거나 더 나은 대안이 나왔을 때 시스템 전체가 흔들린다.
2. **자가진화 복리(self-improving compounding)** — 에이전트가 내는 실수·문제 자체가 데이터가 되어야 하고, 그 데이터가 자가진단·자가발전 루프를 돌려 시간이 지날수록(할루시네이션↓·의도 이해↑·정확성↑·취향 반영↑) 이 1인 개발자에게 맞춤 최적화되어야 하며, 이 복리 효과는 "어떤 에이전트가 실행하든" 동일하게 누적돼야 한다.

이 두 축이 만나는 지점이 이 RFC의 이름이다 — **"Agent-Agnostic Compounding"**: 실행 주체가 바뀌어도 축적된 복리(규칙·기억·패턴·게이트)가 끊기지 않아야 한다.

## §2. 실측 감사 결과 (2026-07-03, opus 에이전트 코드 직독)

opus 에이전트가 코드를 직접 열어 4가지를 확정했다. 아래는 그 근거를 이 문서 작성 시점에 다시 직접 Read로 재확인한 file:line이다.

### §2.1 실행 계층 — 이미 에이전트 무관 (좋은 소식)

`win`/`reinforce`/`evolve`/`receipt`/`stats`/`loop` 등 자가진화 복리 척추를 이루는 명령들은 전부 CLI 인자 + 파일시스템(`.vhk/**`) + git만 사용한다. 예를 들어:

- `src/commands/evolve.ts` — "claude"/"Claude"/"Codex"/"Cursor" 문자열이 **0건**(직접 grep 재확인).
- `src/lib/receipt.ts`(§2.4에서 상세) — `decideReceipt()`는 종료코드·dirty·SHA·diff-cover·intent 5종 기계증거만 입력받는 순수 함수(라인 106-123). 어떤 도구가 커밋했는지는 함수 시그니처에 아예 존재하지 않는다.

즉 **"규율 자체는 이미 어떤 에이전트가 실행하든 동일하게 적용된다."** 이 부분은 추가 작업이 필요 없다.

### §2.2 트리거 계층 — Claude Code 전용 (구조적 격차, 오늘 해소 안 함)

VHK가 스스로 발동하는 트리거(SessionStart/Stop 훅)는 Claude Code의 고유 스키마에 못박혀 있다.

- `src/commands/init.ts:515` — `const CUSTOMIZATION_HOOK_CMD = 'node "${CLAUDE_PROJECT_DIR}/.vhk/hooks/customization-check.mjs"'` — `CLAUDE_PROJECT_DIR`는 Claude Code가 훅 실행 시점에 주입하는 전용 환경변수다. Cursor·Codex 등 다른 에이전트에는 이 변수 자체가 존재하지 않는다.
- `src/commands/init.ts:529-541` — `ensureSessionStartHook(projectDir)` 함수가 신규 프로젝트의 `.claude/settings.json`에 `{ hooks: { SessionStart: [...] } }` 형태로 훅을 기본 배선한다(goal 89). 이 이벤트 스키마(`SessionStart`/`matcher`/`hooks[].type: 'command'`)는 Claude Code 고유 포맷이며, `vhk init`이 새 프로젝트마다 이걸 심는다.
- 이 레포 자신의 `.claude/settings.json`도 `PreToolUse`(`matcher: "Bash|PowerShell"`)·`Stop` 이벤트로 governance 훅(`check-records.mjs`·`record-reminder.mjs`)을 배선한다 — 동일한 Claude Code 전용 이벤트 스키마의 실사용 사례.
- 계획 중인 후속 기능도 같은 전제에 못박혀 있다 — `docs/log/2026-07-01-followup-handoff.md:41` "N11 — evolve-nudge Stop hook": *"**Claude 세션 Stop 시** 패턴 임계 도달하면 자문 넛지"*. N1 `loop --tick`(#436) 재사용을 전제하지만, 발동 지점 자체가 Claude Code의 `Stop` 이벤트다.

**Cursor/Codex/OpenCode 등 다른 에이전트용 대응물은 설계 자체가 없다.** Cursor는 `.cursor/rules/*.mdc`로 규칙은 상속하지만(파일 기반, 에이전트가 매 세션 읽음) "세션 시작/종료 시 자동 실행"에 해당하는 훅 메커니즘을 VHK가 배선해주는 코드는 0건이다. 이건 "버그"가 아니라 **VHK가 아직 풀지 않은 설계 공백**이다 — Cursor/Codex 각각이 훅에 준하는 기능을 제공하는지, 제공한다면 스키마가 무엇인지부터 조사가 필요하고, 오늘 이 문서는 그 격차를 정직하게 명시하는 것까지만 한다(§7 상세).

### §2.3 ecosystem.mdc 자기모순 — 가장 놀라운 발견

VHK 자기 자신의 코드가 "어떤 에이전트가 와도 안 무너진다"는 정체성과 정면 충돌하는 문구를 매 신규 프로젝트에 심고 있었다.

`src/templates/ecosystem-mdc.ts:17-18`:

```ts
'1. **Claude Code = primary** — handoff, release-gate, epic architecture, vhk-auto는 Claude-only (yohan-cc-skills).',
'2. **Cursor = secondary** — Composer batch/repeat 보조; 코딩·반복 작업용.',
```

이 템플릿이 만드는 실제 산출물(`ecosystem.mdc`)이 이 레포 자신에도 이미 생성돼 있고, 내용이 템플릿과 한 글자도 다르지 않다 — `.cursor/rules/ecosystem.mdc:10-11`:

```
1. **Claude Code = primary** — handoff, release-gate, epic architecture, vhk-auto는 Claude-only (yohan-cc-skills).
2. **Cursor = secondary** — Composer batch/repeat 보조; 코딩·반복 작업용.
```

`vhk inject-bootstrap`이 이 파일을 신규 프로젝트마다 생성한다. "Claude Code가 primary고 Cursor는 secondary"라는 위계, 그리고 "vhk-auto는 Claude-only"라는 명시적 선언은 이번 세션에 확인된 정체성(에이전트 불가지론)과 정확히 반대 방향이다. **이 발견은 트랙①에서 별도 작업으로 수정 진행 중이며, 이 문서에는 발견 사실만 기록한다.**

### §2.4 receipt/ledger — "누가 했는지" 필드 0건

VHK의 기록 계층(영수증·원장)에는 어떤 에이전트가 작업했는지 남기는 필드가 전혀 없다.

- `src/lib/receipt.ts:75-88` `ReceiptEvidence` — `gates`/`dirty`/`stale`/`staleKnown`/`diffCover`/`intent` 6개 필드, agent/actor 없음.
- `src/lib/receipt.ts:176-193` `Receipt` — `schemaVersion`/`generatedAt`/`date`/`slug`/`decision`/`reasons`/`evidence`/`head`/`base`/`honesty` 10개 필드, agent/actor 없음.
- `src/lib/receipt-log.ts:22-47` `ReceiptLogEntry`(추세 측정용 영속 로그) — `ts`/`decision`/`sha`/`shortSha`/`red`/`gateStatus`/`dirty`/`stale`/`diffCoverRatio`/`diffCoverUncovered`/`forbiddenHits`/`scopeWarnings` 12개 필드, 역시 agent/actor 없음.

결과적으로 **"VHK가 여러 에이전트에서도 안 무너진다"를 자기 데이터로 증명할 방법이 원래 없었다** — 어느 영수증이 Claude Code가 만든 것이고 어느 것이 Codex가 만든 것인지조차 사후에 구분할 수 없다. **이 발견은 트랙②에서 별도 작업으로 수정 진행 중이며, 이 문서에는 발견 사실만 기록한다.**

## §3. RFC 0055 → RFC 0056 계승 과정에서 "Run 객체" 비전이 유실된 경위

§2.4의 격차는 처음부터 없었던 게 아니다 — 한 번 설계됐다가 사라졌다. `docs/rfc/0055-vhk-proof-protocol.md`(archived)를 직접 읽어 확인한 원래 설계는 다음과 같다.

**§3(객체 모델, 0055 라인 60-72)** — Proof Protocol v1은 6개 객체를 표준화했고, 그중 하나가 명시적으로 에이전트 구분용이었다:

> | **Run** | 누가/무엇이 작업했는가. Claude, Codex, Cursor, human, mixed | `work`, MCP, future agent metadata |

**§4(스키마 초안, 0055 라인 105-108)** — 실제 JSON 스키마에도 `run` 필드가 있었다:

```json
"run": {
  "actors": ["Claude Code"],
  "mode": "human-approved-agent"
},
```

**§9 Epic E, E3(구현 티켓, 0055 라인 456-463)** — "Agent self-report 필드"라는 이름의 독립 티켓까지 있었다:

> - 범위: proof.run.actors에 agent 이름/버전/표면 입력.
> - 수용 기준:
>   - 수동 입력 가능.
>   - 알 수 없으면 `unknown`.
>   - **출고 판단은 agent 이름에 의존하지 않음.**

이 마지막 조건이 핵심이다 — 0055는 애초에 "에이전트를 **기록**하되 **판단에는 안 쓴다**"는, 정확히 지금 VHK가 필요로 하는 설계를 이미 갖고 있었다.

RFC 0056(Evidence Receipt)이 0055를 대체하면서 이 비전이 어떻게 됐는지가 문제다. RFC 0056의 머리말(0056 라인 4)은 이렇게 말한다:

> 대체: **RFC 0055 §8(표준화 전략)·§7(역할군) 프레임을 폐기하고 이 RFC로 교체.** RFC 0055의 객체모델·티켓(§3·§4·§9)은 **결함 정정 후 재사용**.

즉 0056은 §3/§4/§9(Run 객체 포함)를 "폐기"가 아니라 "결함 정정 후 재사용"이라고 명시했다. 그러나 §2.4에서 확인했듯 실제 구현(`receipt.ts`/`receipt-log.ts`)에는 Run/agent 개념이 **전혀** 재사용되지 않았다 — 정정된 형태로도, 원래 형태로도 존재하지 않는다. 0056 §6(라인 96)의 "어느 에이전트가 '완료'라 말하든"이라는 문구가 유일한 흔적인데, 이건 "판단은 에이전트에 무관하게 내린다"는 0056의 핵심 설계(옳은 결정)를 표현한 것이지 "에이전트를 기록한다"는 뜻이 아니다.

**정리하면**: 0055는 "기록은 하되 판단엔 안 쓴다"(record-but-don't-decide) 2단 설계였는데, 0056으로 넘어오며 "판단엔 안 쓴다"만 계승되고 "기록은 한다"가 통째로 빠졌다. 이 RFC(0057)의 트랙②는 바로 이 빠진 절반을 복원하는 작업이다 — 단, **decision 로직(`decideReceipt`)에는 agent 필드를 절대 입력으로 안 쓴다**는 0056의 단조성·결정론 불변식은 그대로 지킨다(순수 기록용 메타데이터로만 추가).

## §4. 스코프 결정 — 오늘 착수 3트랙 + 후속 유보 2건

RFC 0057이 다루는 전체 범위(기억·복리·에이전트불가지론)는 넓다. 오늘은 근거가 확실하고 되돌리기 쉬운 3개 트랙만 착수하기로 스코프를 좁혔다.

| 트랙 | 내용 | 상태(이 문서 작성 시점) |
|------|------|------------------------|
| ① | `ecosystem-mdc.ts` 템플릿의 "Claude Code=primary, vhk-auto=Claude-only" 모순 문구 제거 | 같은 날 별도 작업으로 병행 진행 중(구체 커밋 해시는 병합 후 채움) |
| ② | receipt/ledger 스키마에 `agent`(또는 동등한) 필드 추가 — decision 로직에는 미반영(기록 전용) | 같은 날 별도 작업으로 병행 진행 중(구체 커밋 해시는 병합 후 채움) |
| ③ | RFC 0057 정식 문서화(이 문서) + 트리거 계층 격차를 정직하게 문서로 명시 | 이 문서로 완료(코드 변경 0건) |

트랙①·②는 이 문서와 다른 작업 단위(다른 worktree/세션)에서 동시에 진행됐다 — 이 RFC를 쓰는 시점엔 아직 병합 전이라 구체적인 커밋 해시·PR 번호는 알 수 없다. 메인 세션이 병합 후 이 섹션에 실제 커밋 해시를 채워 넣을 수 있다.

## §5. 트랙③ 상세 — 이 문서가 하는 일

트랙③의 역할은 "고친다"가 아니라 "정직하게 적는다"이다. 구체적으로:

1. RFC 0057을 정식 문서로 남겨 §0~§4의 감사 결과와 스코프 결정이 근거 없는 구두 합의로 휘발되지 않게 한다.
2. §2.2(트리거 계층 격차)를 **오늘 해소하지 않는다는 것까지 포함해서** 정직하게 문서화한다 — "Cursor/Codex용 SessionStart/Stop 훅 대응물은 설계 자체가 없다"는 사실을 숨기거나 축소하지 않는다.
3. §3(0055→0056 유실 경위)을 기록해, 트랙②가 무엇을 "복원"하는 것인지 다음 세션이 근거 문서 없이 재추측하지 않게 한다.

## §6. 후속으로 유보한 것 — 후속 RFC로 미룸

다음 두 결정은 오늘 스코프에 의도적으로 넣지 않았다. 근거가 부족해서가 아니라, 각각 그 자체로 별도 RFC급 브레인스토밍이 필요한 더 크고 철학적인 문제이기 때문이다.

### §6.1 메모리 프라이버시 긴장

`.vhk/memory.json`(4버킷 기억)은 git 추적과 VHK 자체의 cloud push 백업 양쪽에서 **의도적으로** 제외돼 있다 — "개인 의사결정 메모"라 로컬 전용으로 설계됐다. 그런데 이 세션에서 재확인한 정체성("기기·에이전트를 넘나드는 복리")은 정면으로 이 설계와 충돌한다 — 사용자 취향이 컴퓨터 A에서 쌓인 게 컴퓨터 B의 다른 에이전트에는 전혀 반영되지 않는다면 "복리"가 기기 경계에서 끊긴다.

이 긴장을 어떻게 풀지 — (a) 계속 로컬 전용으로 두고 "복리"의 정의를 기기 단위로 좁히는지, (b) 민감하지 않은 부분만 선별 동기화하는 방법을 만드는지, (c) 전면 공유로 가는지 — 는 프라이버시·보안·사용자 통제권이 얽힌 더 크고 철학적인 결정이라 오늘 범위 밖이다. 후속 RFC에서 별도로 다룬다.

### §6.2 할루시네이션 감소 루프

"AI가 점점 덜 헛소리하고, 점점 의도를 잘 이해하게 되는" 것 자체를 측정하고 개선하는 루프는 오늘 설계하기엔 너무 이르다 — 애초에 **무엇을 측정할 것인가**(할루시네이션을 어떤 신호로 정량화할지, false-completion과는 어떻게 다른 지표인지)부터 별도 브레인스토밍이 필요하다. RFC 0056의 Evidence Receipt가 "거짓완료"라는 좁은 조각은 이미 측정하고 있지만, "할루시네이션"은 더 넓은 개념(사실무근 주장, 존재하지 않는 API 호출, 맥락 오해 등)이라 같은 잣대로 잴 수 없다. 측정 지표 설계부터 시작해야 하므로 후속 RFC로 유보한다.

## §7. 트리거 계층 격차 — 정직한 현황 (트랙③ 본체)

이 절은 §2.2의 발견을 "해결책 제안" 없이 있는 그대로 기록하는 것이 목적이다.

**무엇이 Claude Code 전용인가:**
- `.claude/settings.json`의 훅 이벤트 스키마 자체(`SessionStart`/`PreToolUse`/`Stop`, `matcher` 필드, `${CLAUDE_PROJECT_DIR}` 환경변수 치환) — 이건 Claude Code라는 특정 제품의 설정 파일 포맷이다.
- `vhk init`(goal 89 `ensureSessionStartHook`)이 신규 프로젝트마다 이 훅을 기본으로 심는다 — 즉 VHK의 "첫 세션 자동 온보딩"·"커스터마이징 인터뷰 자동 시작" 같은 기능이 Claude Code에서 작업할 때만 자동 발동한다.
- 계획 중인 N11(evolve-nudge Stop hook)도 같은 전제(Claude Code의 Stop 이벤트) 위에 설계돼 있다.

**왜 오늘 해소하지 않는가:**
- Cursor/Codex/OpenCode 등 다른 에이전트가 "세션 시작/종료 시 자동 커맨드 실행"에 해당하는 기능을 제공하는지, 제공한다면 스키마가 무엇인지 자체가 조사되지 않았다. 근거 없이 설계하면 §2.3(ecosystem.mdc)과 같은 클래스의 실수 — 검증 안 된 가정을 코드에 박아 넣는 일 — 를 반복하게 된다.
- 이번 세션의 스코프 결정(§4)이 "근거가 확실한 3개 트랙만" 착수하기로 좁혔고, 트리거 계층 대응은 아직 근거(다른 에이전트의 훅 메커니즘 조사) 자체가 없는 상태다.

**정직한 결론:** VHK의 실행 계층(§2.1)은 이미 에이전트 불가지론적이지만, **VHK가 스스로를 깨우는 방식(트리거 계층)은 여전히 Claude Code 하나에 의존한다.** 다른 에이전트로 VHK를 쓰는 사용자는 `vhk work`/`vhk review`/`vhk receipt` 등을 수동으로 실행해야 하며, Claude Code에서만 누리는 자동 온보딩·자문 넛지 같은 편의는 아직 없다. 이 격차는 "숨겨진 결함"이 아니라 "알려진, 아직 안 푼 설계 공백"으로 취급한다.

## §8. 비목표

- Cursor/Codex/OpenCode 등을 위한 대체 트리거 메커니즘을 이 문서에서 설계하지 않는다(§7은 현황 기록일 뿐, 해결책 제안이 아니다).
- 메모리 프라이버시 긴장(§6.1)·할루시네이션 감소 루프(§6.2)의 구체적 해법을 여기서 결정하지 않는다.
- 트랙①·②의 구현 세부사항을 이 문서가 대신 설계하지 않는다 — 각 트랙이 자기 작업 단위에서 별도로 문서화한다.
- 기존 receipt decision 로직(`decideReceipt`)의 단조성·결정론 불변식을 바꾸지 않는다 — agent 필드는 순수 기록용이며 판단에 관여하지 않는다(§3 마지막 문단).

## §9. 성공 기준 / 다음 판단 지점

1. 트랙①·② 병합 후, 이 문서 §4 표에 실제 커밋 해시를 채워 넣는다.
2. 트랙②(agent 필드) 병합 후, 최소 2종 이상의 에이전트(예: Claude Code + 사람 수동 실행)로 만들어진 receipt가 실제로 필드값이 다르게 기록되는지 실측으로 확인한다 — 이게 안 되면 "기록"이 아니라 장식용 필드에 그친 것이므로 재작업.
3. §7(트리거 격차)은 다음 중 하나가 성립하기 전까지 "알려진 공백"으로 유지한다: (a) 다른 에이전트의 훅/자동화 메커니즘이 조사·문서화된다, 또는 (b) 사용자가 "이 격차는 감수한다"고 명시적으로 결정한다.
4. §6.1·§6.2는 각각 독립된 후속 RFC로 착수될 때 이 문서를 출처로 인용한다.

---

**한 줄 요약:** VHK의 실행 계층은 이미 에이전트 불가지론적이지만, 트리거 계층은 Claude Code에 못박혀 있고, VHK 자신의 코드(`ecosystem.mdc`)가 그 반대 정체성을 선언하며, 기록 계층엔 "누가 했는지"가 아예 없다. 오늘은 정직하게 안전한 3개 트랙(모순 문구 제거·agent 필드 복원·이 문서화)만 착수하고, 더 철학적인 두 결정(메모리 프라이버시·할루시네이션 루프)은 후속 RFC로 명시적으로 미룬다.
