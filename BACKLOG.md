# BACKLOG

> v1 OUT 기능은 여기에 기록. 범위 수비 필수.

## STEP 4 후속 / L2 (보류 — 실사용 신호 후)

> v1.6.x 드리프트 감지(L2 첫 삽: doctor 가 규칙·맥락 어긋남 passive 경고) 이후 후속.
> **실사용 신호 전까지 구현 금지** — 추측 기반으로 미리 만들면 과안정화(over-stabilization).
> 각 항목의 "트리거"가 관측돼야 착수.

- **#2 드리프트 자동수정 제안** — doctor 가 stale 감지 시 "지금 `vhk sync` / `vhk context` 다시 돌릴까요?"
  안내(여전히 사람 confirm, 자동 실행 X). 읽기전용 원칙 유지하되 한 발 안내.
  - 트리거: 사용자가 경고를 보고도 "그래서 뭘 하라는 거냐" 식 혼란 신호.
- **#3 save/recap 에도 드리프트 노출** — 현재 doctor-only. doctor 를 잘 안 돌려서 경고가
  너무 늦게 보이는지 확인 후, save/recap 진입점에도 passive 경고 추가.
  - 트리거: doctor 미실행으로 stale 을 늦게 발견한 사례.
- **#4 CLAUDE.md 부분 드리프트** — 전체 파일이 아니라 **자동생성 규칙 섹션만** 비교
  (사람 손글 섹션은 무시). 섹션 경계 마커 필요.
  - 트리거: 손으로 쓴 섹션 때문에 거짓 드리프트가 뜬 사례.
- **#5 RFC §7 — cloud 충돌 해소** — 두 기기서 동시 push 시 충돌 해소 전략 +
  평면 구조 → 폴더 구조(spec 2.0). RFC 0001(이슈 #38) 의견수렴 후.
  - 트리거: 실제 두 기기 push 충돌 보고 / RFC 합의.

## v1.4 후보 (Goal 2 후 검토)

- **`vhk timeline` viewer** — `docs/state/learnings.md` (교훈) + `.vhk/memory.json` (결정사항) 을 시간순으로 merge 출력. 읽기 전용 (SoT 무변경). 사용자 혼란(`learn` vs `memory add` 어디 가서 봐야 하나) 해소용. 검증 후 도입 — 옵션으로 cross-write 추가 금지 (SoT 흐림).

## v1.1 후보

- 

