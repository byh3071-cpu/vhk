# 2026-06-22 — RFC 0055 검증 → VHK 정체성 재정의 (Evidence Receipt)

> 성격: append-only dev log. **핸드오프 진입점.** Codex가 낸 RFC 0055(Proof Protocol)를 다차원 적대검증 → 결함 다수 발견 → VHK 방향성·정체성을 `vhk-winning-strategy` workflow로 재탐색 → **RFC 0056 'Evidence Receipt' + ADR-006**으로 확정한 세션.
> 다음 세션은 이 파일 1개 + RFC 0056 §6만 읽으면 바로 T1 착수 가능.

## 한 줄 결론

RFC 0055는 "AI 작업 신뢰 원장 → Public 표준" 제안이었으나 검증서 토대 붕괴(과대약속·표준화 순서 역전·1인 현실 모순). **정체성을 "에이전트의 '됐어요'를 기계증거 영수증으로 바꾸는 멀티툴 솔로용 무설정 거짓완료 탐지기"로 재정의(RFC 0056·ADR-006).** 90일 단일 성공기준 = **거짓완료 적발 1건 공개입증.**

## 무엇을 했나

1. **RFC 0055 검증** (workflow 2회, 38건 확정/9 기각) → 결과를 [RFC 0055 §13](../rfc/0055-vhk-proof-protocol.md#L549)에 기록.
   - high 4: `vhk ship` 이름 충돌 / proof 이벤트를 잘못된 원장(`ledger.jsonl`=verify 요약, 진짜 이벤트원장은 `.vhk/events/ai-actions.jsonl`)에 / 신규 `vhk proof` 등록 4지점 누락→첫 게이트 빌드 깸 / 같은 동작 두 이름(mission↔task, ship↔export) + SHA 경로 모순.
   - §8 표준화·§7 6인팀 = 1인+에이전트 현실과 모순.
2. **전략 재탐색** (`vhk-winning-strategy` workflow — 현황 4영역 + 6후보 × 4렌즈 적대평가).
   - 승자 "증거 영수증"(5.3/10, kill 1). ⚠️ 5.3 = "이김 보장" 아닌 "6중 최선 + 결함 정직 흡수". 본질 니치.
3. **확정 문서화**: [RFC 0056](../rfc/0056-vhk-evidence-receipt.md)(전략) + [ADR-006](../adr/ADR-006-vhk-identity-evidence-receipt.md)(정체성 Accepted) + 0055 §13→0056 포인터.

## 확정된 방향 (요약 — 상세는 RFC 0056)

- **정체성**: VHK = "AI가 '됐어요'라 한 순간 종료코드·dirty·SHA 같은 **기계증거만으로(LLM 판단 0)** 진짜인지 1초에 따지는 멀티툴 솔로용 무설정 거짓완료 탐지기."
- **명명**: Proof(증명)→**Evidence(증거)**. "표준"·"증명서" 보증 톤 금지(review 비보증성과 톤 일치).
- **1차 타겟**: 세그먼트 B(멀티툴 CLI 에이전트 헤비유저). C(납품)=2순위 확장, A·D=회피.
- **해자**: (강) 벤더 이해상충=중립은 무소속만 팖 / (중) 결정론 vs 확률(LLM 리뷰봇은 자기 할루시네이션) / (약) 자기보고 위조방어. 복제 1~2주라 진짜 해자는 선점속도+도그푸딩 신뢰자산.
- **90일 쐐기**: 명령 하나 `vhk receipt`. 기존 자산 글루코드.

## 다음 할 일 (바로 실행)

> **선결 블로커 (T1 전에 반드시):** vhk가 **추적 파일을 스스로 갱신**해 작업트리가 늘 dirty다. 이 세션 시작 `git status`에 `M .vhk/events/ai-actions.jsonl` 관찰됨(goal 82가 ledger.jsonl을 추적으로 정합한 것과 동류). receipt가 dirty면 block을 내므로 **이대로면 영수증이 늘 빨강 → 자기모순.** 먼저: vhk 런타임이 dirty 판정 시 `.vhk/events/*.jsonl`·`.vhk/ledger.jsonl` 등 **자기 산출 추적파일을 제외**하도록 봉인(전략 workflow가 #315로 추정 — 이슈 번호는 다음 세션이 확인). 이게 안 되면 T3 데모 첫 장면이 깨진다.

**T1 — `vhk receipt` MVP** (RFC 0056 §6):
- 완료 시점 4대 기계증거 수집: ①tsc/test/build 실종료코드 ②git dirty(자기파일 제외) ③stale(작업시작 SHA≠HEAD) ④변경라인 diff-cover → `.vhk/receipts/<날짜-슬러그>.{json,md}` 1장.
- `decision=block|caution|pass`는 기계증거로만(LLM 0). dirty/stale/red면 무조건 block. **`caution→pass` 격상 금지 단조성 불변식 = 테스트로 고정.**
- 재사용(신규 발명 금지): `verifyEvidence`(verify.ts, 실종료코드)·`checkEvidenceFreshness`(verify.ts, stale)·`review`(거짓완료 교차검증)·`reports/latest.json` 병합.
- ★수용기준 필수★: 등록 4지점(index.ts·command-registry TOP_LEVEL/CONTAINER·cli-args·ko.ts) + nlp-router 키워드 + 한글별칭(`증거영수증`) + 드리프트 테스트 green. (← 0055 §13-high#3 정면 예방. 누락 시 첫 게이트서 빌드 깸.)
- 게이트: `pnpm build; pnpm test` (PowerShell `;` 연결).

**T2 — 위조방어 + 붙여넣기 .md**: typecheck/test/build 필드는 self-report(`manual:true`) 거부, 외부프로세스 실종료코드만. .md는 PR/대화에 그대로 붙는 1블록(decision 배지+게이트표+사유+정직성 경계 1줄). `.vhk/receipts/` git 추적+민감정보 마스킹 결론 + gitignore·init 씨앗.

**T3 — 거짓완료 적발 1건 공개입증** (사람 율속): 에이전트 "완료" 주장 → 기계증거 block → 실제 미완 확인 장면을 며칠 실사용으로 1건+ 캡처(현재 차단율 0/8). 합성·소급 금지. docs/log 증거기반 기록 = 랜딩/트윗 데모 자산.

## 착수 명령 (복붙)

```powershell
# 1) 방향 재확인
vhk recall "vhk receipt 거짓완료 영수증"   # 관련 ADR·RFC 주입(있으면)
# 2) 범위 계약
vhk mission set --objective "vhk receipt MVP — 기계증거 영수증" --scope "src/commands/**,src/lib/**,src/i18n/ko.ts,tests/**" --forbidden ".env,dist/**"
# 3) 선결 블로커부터: 자기-dirty 봉인 → 그다음 T1 (TDD)
```

## 주의

- **동시 세션**: 다른 Claude 세션이 같은 폴더 measure-first/proof 작업 중 → git 충돌 주의, worktree 분리 권장.
- 커밋 안 함(이번 세션). 산출 = docs만(src 무변경 → check-records 안 막힘). 커밋 시 `docs(rfc-0056): VHK 정체성 Evidence Receipt 재정의 + ADR-006`.
- RFC 0055 §3·§4·§9(객체모델·티켓)는 폐기 아님 — high/med 결함 정정 후 receipt 구현에 재사용.
- 기존 우선순위(measure-first·품질천장 G50)는 살아있음. RFC 0056은 **상위 전략 프레임 교체**지 진행 중 작업 폐기 아님 — receipt가 measure-first(거짓완료 적발 측정)와 같은 방향.

## 산출물 색인

- [docs/rfc/0056-vhk-evidence-receipt.md](../rfc/0056-vhk-evidence-receipt.md) — 전략 SoT
- [docs/adr/ADR-006-vhk-identity-evidence-receipt.md](../adr/ADR-006-vhk-identity-evidence-receipt.md) — 정체성 결정
- [docs/rfc/0055-vhk-proof-protocol.md §13](../rfc/0055-vhk-proof-protocol.md#L549) — 검증 결과 + 0056 포인터
