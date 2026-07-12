# 2026-07-07 (야간 이어서) — RSI 안 쫓기로 결정 + Codex 리포트 검증 + 다음국면 3중 전수감사 + 플랜

> goal 100(cold-start 역채굴) 머지 직후 세션. 사용자가 "이게 RSI냐" 질문 → RSI 논의 →
> "RSI 말고 코덱스 리포트 + 전수검사로 종합해서 구현계획 짜자" 요청 → Explore 3개 병렬 감사 →
> 인터뷰 4문항(3답변) → 사용자 출근으로 중단, 플랜 파일에 전부 박제 후 승인받음.
> append-only. 상세 플랜은 `C:\Users\user\.claude\plans\nested-splashing-wave.md`(승인됨,
> 다음 세션 이어서 씀 — 새 플랜으로 덮어쓰일 수 있으니 이 로그가 내용 SoT).

## 1. RSI 질문과 결론

**질문**: goal 100(evolve seed)이 재귀적 자기개선(RSI)이냐?

**결론: 아니다. 그리고 VHK는 RSI를 쫓지 않는 게 낫다.**

근거:
- RSI 엄격정의(자기 코드수정 + fitness eval + 사람 없는 폐루프 + 복리 + 개선자 자신도 개선) 중
  VHK는 사람 승인 게이트(헌법)·개선주체=외부 Claude·5계층 중 1계층(rule)만 구현 — 3개 실패.
- 사람 승인 버튼을 없애야 진짜 RSI인데, 안 없애는 게 낫다:
  1. 헌법 PAT-003(고위험·비가역 자동화는 LLM을 결정경로 밖) — 규칙 자체가 이 시나리오를 막게 있음.
  2. 이 레포에서 이미 "AI가 자기 결과물 스스로 채점"(objective LLM judge, goal 73/#276)을
     검토했다가 **"착수 안 함"으로 결정**(git `9e0ded4`). 승인버튼 제거에 필요한 정확히 그
     메커니즘을 한 번 신중히 보류한 전례.
  3. VHK 차별점(agent-agnostic 감사/거버넌스층)이 승인버튼 위에 서 있음 — 없애면 자기잠식.
- 오늘 밤 한 일(evolve seed)은 RSI가 아니라 **"메타루프"**(사람감독형 복리, 5계층 self-improve
  스키마 중 rule 하나에서 재료 넣기)를 처음 점화한 것. 5계층은 순서(1→5단계)가 아니라 독립
  영역(memory/rule/workflow/code/product) — 다 지어도 RSI 아님(승인버튼 여전히 있으므로).
- 자기개선 전체 지도: 가중치형(진짜 RSI, VHK 불가·모델 안 가짐) / **기억축적형(VHK가 이거—
  MemGPT·Voyager·Hermes와 같은 계열, 모델 안 바뀌고 외부 기억창고만 커짐)** / **다자검증형
  (VHK critic·code-review가 이미 씀 — 오늘 M1 잡은 방식)** / 진화형·자기과제생성형(VHK 안 씀).

## 2. Codex 강화 리포트 — 실제로 자기개선 얘기 아님 (원본 직접 확인)

RFC 0058(`docs/rfc/0058-codex-audit-remediation.md`)이 이 리포트의 opus 교차검증 버전인데,
**2차 요약만 믿지 않고 원본 Notion 페이지(`3949740a-b072-80e8-91e1-d69295d3202e`)를 직접
fetch해서 확인함.** 결론: 이 리포트는 자기개선/RSI/할루시네이션 감소와 무관 — **문서 정합성·
Goal 상태모델·명령표면 비대·PR잔재·write-safety 5개 위생 문제** + "오케스트레이션은 VHK
안에 넣지 말고 oh-my-agent처럼 별도 층에 둬라"는 권고 1줄이 "에이전틱"과 닿는 유일한 지점.

RFC 0058 실행계획(T1~T6) 자체는 **작성일(07-06) 이후 오늘(07-07)까지 100% 미착수** —
그 사이 유일한 커밋은 goal-100(무관 작업)뿐. 실측 확인(§3-A).

## 3. 진짜 자기개선(RFC 0057) 미해결 떡밥 3개 — 여기가 진짜 재밌는 부분

RSI와 달리 **아직 결정 안 남**:
1. 할루시네이션 감소를 뭘로 잴지(측정지표 설계 자체가 안 됨, RFC0057 §6.2)
2. 기억이 로컬전용(프라이버시)인데 "복리"는 기기 넘나들길 원함 — 동기화하면 프라이버시 깨짐,
   안 하면 복리가 기기 경계서 끊김(§6.1)
3. "누가(Claude/Codex/사람) 했는지" 기록이 한 번 설계됐다 유실(RFC0055→0056) — 부분 복원됐지만
   (agent 필드) 실제 "Claude가 Codex보다 실수 적은지" 같은 비교분석은 아무도 안 함(§3)

## 3-A. 3중 전수감사 실측 (Explore 병렬 3개, 이 세션에서 직접 확인)

### RFC 0057/0058 진행상태

| 트랙/T | 실측 | 판정 |
|---|---|---|
| RFC0057 트랙① ecosystem.mdc | 템플릿(`src/templates/ecosystem-mdc.ts`)은 수정(cc4f31f), **이 레포 자신의 산출물 `.cursor/rules/ecosystem.mdc`는 재생성 안 돼 옛 모순문구(v1) 그대로** | 부분 — 자기적용 누락, RFC0058이 지적한 것과 동류의 자기모순 |
| RFC0057 트랙② receipt agent 필드 | `receipt.ts` `agent?: AgentId` 구현 완료, decision 로직 미반영(의도대로) | 완료 |
| RFC0058 T1(문서수치) | ARCHITECTURE.md MCP24/Node20/테스트356 그대로(실제 35/22·24/2328), RULES.md 경로오기·spec.md 배열모순·VISION DoD 체크박스 전부 그대로 | 미착수 |
| RFC0058 T2(PR #430·#445) | 둘 다 OPEN, 이제 CONFLICTING/DIRTY | 미착수 |
| RFC0058 T3(goal enum) | 4값 그대로(NOT_STARTED/IN_PROGRESS/DONE/BLOCKED) | 미착수 |
| RFC0058 T4(write-safety) | config.ts·context.ts 여전히 raw write | 미착수 |
| RFC0058 T5·T6 | RFC0059 미작성, 스크립트 정리 미착수 | 미착수 |

### 자기개선(evolve) 파이프라인 현재 실측

| 항목 | 값 |
|---|---|
| memory.json | decisions1·failures18·successes0·**patterns42**(goal100 성과) |
| evolve/queue.json | 42건 전부 pending(applied0·rejected0) |
| **evolve-log.jsonl** | **파일 없음 — apply/reject 결정 0건, 역대 한 번도 없었음** |
| receipt-log.jsonl | 1줄뿐, agent필드 도입 이전 라인이라 agent값 관측 0 |
| autonomy-run.jsonl | 파일 없음, **`readAutonomyLog` 소비처 0건**(write-only 죽은 텔레메트리) |
| 되먹임 팔(#2) | 0건, `generateCandidates`는 evolve-log 안 읽음 |

**핵심 통찰**: 점화(patterns→queue)는 성공했지만 그 다음 폐루프(사람 결정→기록→되먹임)는
전부 미실행. **되먹임 팔을 지금 만들어도 먹일 데이터가 0** — 선행조건 = 사람이 42건 중 일부
실제 apply/reject(TTY 필수, 내가 대신 못 함).

### 명령표면·잔재

| 항목 | 값 |
|---|---|
| 커맨드/MCP | 113(+1=오늘)/35/최상위68 |
| 오픈 PR | #430(CONFLICTING)·#445(DIRTY)·#461(정상) |
| `scripts/spike-g3-process-wrap.mjs` | **07-04부터 3세션 연속 미결**, 사용자 실행 흔적 0 |
| goal enum 오표기 | 73=BLOCKED(실제 "착수안함")·79=IN_PROGRESS(회귀0)·50=IN_PROGRESS(PR2보류) |
| check-goal 스크립트 부채 | 101개 중 80개 archive대응+**16개는 이미 DONE인데 활성 적체** |
| **next-task.md 자체 드리프트(신규발견)** | 07-04판 "다음후보 #459(vhk cost)"가 **틀린 추천** — goal 56(2026-06-09 DONE)에서 이미 구현됨. 상태 SoT 문서 자신이 Codex가 지적한 "진실 드리프트"의 실증 사례 |

## 4. 제안 단계 (Phase 0~4, 브레인스토밍 결과 — 최종승인은 재개 후)

- **Phase 0**(반나절·위험0) — T1 문서수치 정정 + RFC0057 트랙① 자기적용(ecosystem.mdc 재생성) + next-task.md #459 오기 정정 + RFC0057 §4 커밋해시 채움.
- **Phase 1**(구조·TDD) — T3(enum 확장, 이름 미확정) + T4(write-safety) + 완료 16개 goal archive 이동.
- **Phase 2**(사람액션) — PR #430·#445 처리 / spike-g3 처리.
- **Phase 3**(자기개선 실데이터) — 42건 중 일부 실제 apply/reject → evolve-log 생김 → 되먹임 팔 재논의.
- **Phase 4**(범위밖, 명시적 유보) — 할루시네이션 측정설계·메모리프라이버시·command manifest 리팩터·UX단순화. RFC들이 이미 "별도 브레인스토밍 필요"로 결론냄 — 새 유보 아니라 기존 결정 존중.

## 5. 인터뷰 결과 (4문항)

| # | 질문 | 답 | 상태 |
|---|---|---|---|
| 1 | goal enum 신규값 이름(CANCELED/REJECTED) | **"취소나 기각은 아닌데 뭐노"** — 둘 다 거부 | **미해결, 재개 시 최우선.** 사전제안: `WONT_DO`(github wontfix 컨벤션 — 버그도 취소도 아닌 "숙고 후 안 하기로 함"에 정확히 맞음), 대안 `DECLINED`·`OPTED_OUT` |
| 2 | spike-g3 처리 | "나중에 이어서" | 보류 |
| 3 | PR #430·#445 | **"지금 닫기 (추천)"** | **승인 — 이 로그 작성 직후 실행** |
| 4 | 42건 실제 apply/reject 이번 포함? | "나중에 이어서" | 보류 |

## 6. 재개 지점

1. **enum 이름 재인터뷰부터**(`WONT_DO`/`DECLINED`/`OPTED_OUT` 3자 제시, CANCELED/REJECTED 재사용 금지).
2. Phase 0(문서드리프트) 착수 — 가장 안전·즉시가능.
3. spike-g3·42건 라이브 리뷰는 사용자 시간 될 때(TTY 필요).
4. Phase 4(할루시네이션 측정·메모리프라이버시·command manifest·UX단순화)는 각자 독립 브레인스토밍으로, 이번 플랜에 안 넣음.

## 안 한 것 (의도적)

- PR #430·#445 **닫기는 실행함**(아래 참조) — 근거 §3-A·§5.
- spike-g3 실행·42건 apply/reject — 사람만·TTY 필수·"나중에" 명시.
- Phase 1~4 코드 착수 — 이번엔 감사·플랜까지만, 구현은 재개 후.
- npm publish·main 직접 push·merge — 무관(변함없음).
