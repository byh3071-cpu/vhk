# 2026-06-23 — VHK 정체성 "의도 장갑" 확정 + 의도루프 감사 → Goal 87 기획

> 성격: append-only dev log. **핸드오프 진입점.** RFC 0055/0056 이후 VHK 방향성을 대화로 깊이 파, 정체성을 "거짓완료 탐지기"에서 **"의도 장갑"**으로 진화시키고, 코드 전수감사·의도루프 감사로 진짜 구멍(mission↔verify 단절)을 찾아 **Goal 87**로 기획한 세션. **코드 변경 0(기획/설계만).**

## 한 줄 결론

VHK 정체성 = **"의도 장갑"** — 인간 의도를 AI에 전달(들어갈 때: mission·sync·recall)하고, 의도대로 됐나 검증(나올 때: verify·review·receipt)하는 장갑. 코드 감사 결과 **검증 면이 자동 루프에서 빠져 있다**(receipt/verify가 기계적 done만 보고 mission 의도는 0회 참조). → **Goal 87(의도 대조)**가 P0. 이게 곧 해자(남들은 의도를 모름).

## 진행 경위 (이 세션 + 동시세션)

- **확정 머지(동시세션)**: RFC 0055 검증(§13)·RFC 0056(Evidence Receipt)·ADR-006(#350) / Goal 85(#315 자기참조 봉인, #370 DONE) / **Goal 86 receipt MVP 머지(#377)** — `receipt.ts`+`lib/receipt.ts`, 불변식·정직성 1줄(HONESTY_LINE)·diff-cover advisory 분리까지 RFC 0056 §6 그대로 구현됨.
- **이 세션(기획)**: 정체성을 시장 제품 관점이 아니라 **요한 생태계 속 "장갑"** 관점으로 재정의. 코드 전수감사(6슬라이스) + 의도루프 감사(mission→sync→recall→verify→handoff) 수행.

## 정체성 — 의도 장갑 (확정)

- **한 줄**: VHK = 인간 의도를 AI 손에 끼우는 장갑. 들어갈 땐 의도·맥락 쥐여주고(빠름), 나올 땐 의도대로 됐나 잡아준다(안정).
- **간판 동사** = `vhk verify`/`vhk receipt`(이미 작동). receipt = 신규 명령이 아니라 **verify+ledger의 출력 뷰/영수증**(이미 #377로 구현).
- **해자** = "남들(CodeRabbit·Claude review)은 코드가 좋나만 봄 — VHK만 네 의도(mission/RULES/생태계)를 알아 '시킨 대로 했나'를 본다." ← Goal 87이 이걸 코드로 실현.

## 의도루프 감사 결과 (코드 기준 채점)

| 단계 | 등급 | |
|---|---|---|
| sync (의도전파) | 강 | RULES.md 1곳 → 8 AI설정 자동+drift. 배포 레일 |
| handoff (의도연속) | 강 | 4계층 세션 넘김 |
| mission (의도고정) | 중 | 저장·검증은 되나 **아무도 안 읽음** |
| recall (맥락주입) | 중 | 배선 됐으나 Recall@5 측정 0% 정체 |
| verify+receipt (검증) | 중 | **tsc/test/dirty/stale만 봄 — mission 의도 0회** |
| 연결성 | 약 | 5단계가 서로 출력 자동으로 안 읽음 |

★핵심 구멍: `checkMission(changed, mission)`(mission.ts:203)은 이미 순수 함수로 forbidden·scope 위반을 판정하는데, `missionCheck`(194-223)가 **콘솔+exit로만 쓰고 버려** receipt/verify/review가 못 읽는다.★

## 할 것 (우선순위)

### 🔴 P0 — Goal 87 (신규 등록, 이 세션 기획)
[goals/87-mission-verify-intent-check.md](../../goals/87-mission-verify-intent-check.md) — receipt/review가 `checkMission` 호출해 의도(forbidden→block·scope→caution) 반영. **신규 로직 거의 0**(checkMission 이미 pure) — 글루가 본체. latest.json 격리(mission.ts:16) 존중 → receipt에 5번째 증거 `intent` 추가하는 설계(옵션 A).

### 🟠 P1 — receipt 후속 (RFC 0056 §6, T1 머지 후 잔여)
- **T2 위조방어** — 자기보고(`manual:true`) 거부(일부 verify.ts가 이미 강제) + receipt `.md` 붙여넣기 블록. `.vhk/ops-prompt.md`·`sell-prompt.md` gitignore 갭(next-task ④와 동일).
- **T3 거짓완료 적발 1건** — 90일 단일 성공기준(현 0/8). 사람 율속(측정). **30초 데모**(AI "완료"→verify 증거 SHA→한 줄 고치고 커밋 안 함→review/receipt "낡음/block" 빨강)로 캡처 → docs/log + 랜딩 자산.
- **recall eval 시동** — `vhk memory eval --init`로 Recall@5 0% 탈출(next-task measure-first와 동일).

### 🟡 P2 — 정리 (로드맵만, 지금 X)
- 딜리버리 6명령(save·ship·publish·preflight·deploy·cloud)·곁가지(seo·theme·sell)·stub(evolve·restore·content) → **전부 구현+등록돼 있어 지금 제거 = GA breaking.** deprecation 경로 필요 → **정체성이 코드로 증명된 뒤**(T3 적발 1건 후) 착수. 지금은 손대지 말 것.

### 💬 메시징
- 간판 = "AI가 시킨 대로 했는지 의도로 검증하는 게이트"(verify/receipt). 표준 레일 = sync→AGENTS.md(이미 있음)+MCP+ledger 공개 포맷. 못 잡는 것 정직 1줄(이미 HONESTY_LINE으로 코드에 있음).

## 문서 갱신 필요 (식별 — 미적용, 동시세션 충돌 주의)

| 파일 | 무엇 | 어떻게 |
|---|---|---|
| `docs/state/next-task.md` | ⓪이 "receipt MVP 코드 미착수"인데 **#377로 머지됨**(stale) | 0순위를 Goal 87로 갱신 (※ 동시세션이 이 파일 활발히 편집 중 — 충돌 주의, 재읽기 후) |
| `CLAUDE.md` LIVE | 다음 할 일 ⓪ 동일하게 stale | LIVE 구역만 갱신 |
| `docs/adr/ADR-006` | 제목이 "정체성=Evidence Receipt(명령)"로 오독 가능 | 하단 정정 노트(append): "Evidence Receipt=전략명·출력 뷰. 정체성=의도를 기계증거로 대조(의도 장갑). receipt는 신규 명령 아니라 verify+ledger 영수증" |
| `README.md`·`RULES.md` | 정체성 1줄 부재 | "의도 검증 게이트" 부제 추가(RULES→sync 자동 전파) — T3 후 |

## 미결 질문 (요한이 정할 것)

1. **Goal 87 통합 지점** — receipt 5번째 증거(옵션 A, 권장) vs verify가 latest.json 기록(옵션 B, latest.json 격리 깸). → 권장 A.
2. **정리(P2) 시점** — 지금 deprecation 시작 vs T3(적발 1건) 후. → 권장 후.
3. **ADR-006** — 정정 노트(권장) vs 신규 ADR-007. → 권장 노트.

## 첫 착수 (다음 세션, 가장 작게)
**Goal 87 PR1** — `commands/receipt.ts`가 mission.json 있으면 `checkMission` 호출 → `ReceiptEvidence.intent` 채우고 `decideReceipt`가 forbidden→block 반영. TDD, 추가만, mission 없으면 동작 0 변화. **선결 없음**(85 DONE·86 머지). **착수 시 worktree 분리 필수**(동시세션 git 레이스).

## 산출물 색인
- [goals/87-mission-verify-intent-check.md](../../goals/87-mission-verify-intent-check.md) — 신규 P0 goal(기획/설계/구현계획)
- 진입점: 이 파일
- 정체성 SoT: [RFC 0056](../rfc/0056-vhk-evidence-receipt.md) · [ADR-006](../adr/ADR-006-vhk-identity-evidence-receipt.md)(정정 노트 권장)
