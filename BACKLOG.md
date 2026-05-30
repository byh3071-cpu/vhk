# BACKLOG

> v1 OUT 기능은 여기에 기록. 범위 수비 필수.

## 배치 1 (확정 — 배치0 적대적 검증서 도출) — CLAUDE.md 사용자 섹션 보존

> **확정 결함**(추측 아님). 배치0 R3 자체검증서 medium 으로 확인 — `toClaudeMd` 가 CLAUDE.md
> 재생성 시 `## 현재 상태` + RULES record 섹션만 보존하고 **비-키 사용자 섹션(예 `## 프로젝트
> 정보`)을 조용히 드롭**. pre-batch0 부터 존재. 배치0 백업이 복구가능하게 완충하나 비대화형 무경고.
> 실 vhk CLAUDE.md 에 `## 프로젝트 정보` 있음 → dogfooding 시 영향(백업으로 복구는 됨).

**왜 단순 보존 안 되나:** "사용자 섹션"과 "RULES서 삭제된 낡은 vhk 섹션"을 코드가 구분 못 함.
다 보존하면 스테일 규칙이 CLAUDE.md 에 유령으로 남아 단일출처 깨짐.

**설계 — 블록 sentinel marker:** vhk 관리 영역(배너+record 섹션)을 `<!-- vhk:rules:start -->` …
`<!-- vhk:rules:end -->` (안 보이는 HTML 주석)로 감쌈. 마커 **안** = 매 sync 재생성(스테일
자동제거·신규 추가), 마커 **밖**(현재상태·커스텀) = 그대로 보존.

**알고리즘:** 마커 쌍 존재 → 마커 영역만 교체(밖 불변, 멱등). 없음(마이그레이션) → 기존서
옛 자동생성(배너+CLAUDE_MD_KEYS 매칭)만 제거 후 사용자 콘텐츠 + 마커블록 재조립 + "보존 N/제거 M" 경고.

**구현:** Audit(마커형식 확정) → `splitVhkBlock`/`stripLegacyAutogen` 순수함수 분리 → toClaudeMd
재작성 → 마이그레이션 경고. TDD/worktree/적대적 1라운드. 게이트: tsc0·test green·실 CLAUDE.md
dry-run e2e(`## 프로젝트 정보` 보존).

**테스트:** 마커 멱등·마이그레이션 보존·RULES 삭제→스테일 제거·마커훼손 폴백·사용자 `> ⚡`/코드펜스
보존(R3 발견 회귀 포함).

**범위 IN:** CLAUDE.md 한정 toClaudeMd 마커 보존+마이그레이션+경고.
**OUT:** SYNC_TARGETS(순수 미러라 불필요), 코드펜스 파서(별도 latent), 시그니처 변경.

> 연관: 아래 L2 **#4(CLAUDE.md 부분 드리프트)** 와 **같은 섹션 마커 메커니즘 공유** — 이 배치서
> 마커를 도입하면 #4(드리프트 점검을 vhk 영역만 비교)도 같은 토대로 처리 가능. 함께 설계 권장.

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

