# 2026-07-13 — RFC 0060 구현: init 기록 온보딩

RFC [0060](../rfc/0060-init-record-onboarding.md) 승인(사용자) → 4트랙 TDD 구현. 트랙별 작은 커밋.

## T1 — 채움 마커 `[여기에 작성: 질문]` (이 커밋)

### 배경
독푸딩에서 잡은 "채울 자리가 어딘지 사람이 모름"의 근본 원인 = PRD·ARCHITECTURE 템플릿의 빈 칸이 개발자 은어 `**FILL**`로 표시됨. 비개발자는 이게 뭘 채우라는 건지 모름(Wave 1에서 안내 문구는 고쳤으나 마커 자체는 그대로였음).

### 변경
- `src/templates/prd.ts` — `**FILL**` 폴백을 `[여기에 작성: 구체 질문]` 관행 마커로. 섹션마다 맞춤 질문(문제·해결·기능·화면·지표). 상단에 가드 한 줄(`⚠️ [여기에 작성: …] 칸은 사용자와 대화로 채웁니다 — AI가 추측으로 채우지 않기`).
- `src/templates/architecture.ts` — 동일 패턴. `**FILL**` 2곳 + "(프로젝트 구조를 여기에 작성)" 안내문 → 질문 마커.
- **부분 채움 유지**: `--from-notion` 등으로 content가 오면 그 값은 마커 없이 채우고, 안 온 항목만 마커. (기존 `fill()` 폴백 구조 계승 — 시그니처만 질문 인자로 교체.)

### 범위 밖(의도)
- `claude-md.ts`·`sync.ts`의 FILL은 다른 맥락(도메인 규칙·기록 상태)이라 T1 미포함. RFC 0060은 기획·설계 문서(PRD·ARCHITECTURE)로 마커를 한정 — 몰입 대상.
- `vhk check` 잔여 슬롯 카운트(RFC §4 성공기준·§7 열린결정3)는 별도 작은 트랙으로 분리(T1b 후속).

### 게이트
- TDD: RED(신규 5 실패) → 구현 → GREEN. 테스트 정규식 오타 1건(가드 콜론) 자가 수정.
- 전체 2359 pass(기존 2353 + 신규 6) · lint 0 · tsc 0.
- 실 init 재현: PRD·ARCHITECTURE 둘 다 가드 + 섹션별 질문 마커 출력, `**FILL**` 소멸 확인.

### 교훈
- **죽은 마커는 "안내 문구"만 고쳐선 안 낫는다** — Wave 1에서 "채우세요" 문구를 고쳤지만 채울 자리 표식(`**FILL**`)이 은어인 한 비개발자는 여전히 헤맴. 안내와 대상을 같이 고쳐야 완결.

## T2 — 첫 세션 인터뷰 2단계 (customization-hook 확장)

### 결정 (RFC §7 열린결정1)
훅 프롬프트 방식 채택(별도 스킬 X). 근거: 기존 훅이 이미 인터뷰를 "고정 체크리스트 말고 다듬어 물어라"는 지시 텍스트로 넘김 → 2단계도 같은 층에 추가가 일관적. 훅은 지시만, 실제 인터뷰는 AI 자율.

### 변경
- `src/templates/customization-hook.ts` — 1단계(도메인 규칙 4문항) 뒤에 **[2단계 — 기획·설계 슬롯 채우기]** 추가:
  - PRD·ARCHITECTURE의 `[여기에 작성: …]` 칸을 대화로 채우되 **사용자 답변만**(추측 창작 금지·상단 가드 근거)
  - PRD 핵심 5개 안팎 우선·한 번에 하나·컨펌(취조 방지)
  - "개발하며 채울게" 옵트아웃 시 마커 보존
  - **VISION.md 절대 미터치**(사용자 직접 작성 문서)
  - `customization-done` 마커는 1·2단계 통합 완료/건너뛰기 시 생성(재넛지 방지 로직 유지)
- ⚠️ Edit 한글 정규화(NFC/NFD) 미스매치로 부분 치환 실패 → 짧은 파일 전체 Write 재작성으로 우회.

### 게이트
- init.test.ts 45 pass(신규 T2 검증 1). 훅 생성 `.mjs`를 `node --check` → **문법 OK**(런타임 훅이라 필수). 2단계 지시(PRD·VISION·마커) 포함 실측.

## T3 — init 자동 sync + 설치 점검 영수증 (사용자 "가" 승인)

### 실측 기반 안전 설계
- 재사용점 `syncCore(rootDir, opts, confirmOverwrite)` — confirmOverwrite 콜백으로 비대화 안전, drift 파일만 확인·신규는 항상 씀, **덮기 전 자동 백업**(saveBackup).
- 게이트 `allowAutoSync`: 그린필드(`detectExistingRuleFiles===0`) 또는 adopt 승인(대화형/비대화 자동) 또는 fromNotion 시만 true. 브라운필드 adopt 거절 → false → sync 스킵.

### 변경
- `src/lib/install-receipt.ts`(신규) — `collectInstallReceipt`(순수 읽기검증: SYNC_TARGETS+CLAUDE+RULES 실재·기록폴더 5종·인터뷰 대기) + `formatInstallReceipt`(실무 톤).
- `src/commands/init.ts` — `allowAutoSync` 게이트 배선 + coreRules 후 `syncCore` 자동 실행(그린필드/adopt만) + done 뒤 영수증 출력. sync 실패해도 산출물 보존·경고만.
- 테스트: install-receipt 4 · init 통합.

### 3중 안전장치 (실 init 실측)
1. **그린필드/adopt 게이트** — 브라운필드(기존 RULES.md) `-y init` → sync 스킵, 기존 `.cursorrules`(USER-ORIGINAL) **보존 확인** ✅
2. syncCore 자동 백업(그린필드 케이스)
3. 영수증 읽기검증 — 그린필드 "9/9·5/5 ✅", 브라운필드 스킵 "3/9 ⚠️ + vhk sync 복구" (거짓완료 안 함, 있는 그대로)

### 성과
- **핵심 목적 달성**: 그린필드 init에서 **AGENTS.md 즉시 생성(54줄)** → Codex·Zed 등이 첫 세션부터 규칙 인식(RFC 동기의 "init 후 규칙 안 보임" 해소).

### 회귀 4건 발견·수정 (전체 스위트에서 표면화)
1. **install-receipt → sync mock 충돌** (start·init-other-type 3건): `install-receipt`가 `SYNC_TARGETS` 를 `commands/sync.js` 에서 import → sync 를 `vi.mock` 하는 테스트에서 export 소실로 `collectInstallReceipt` 터짐. → 규칙 파일 경로를 install-receipt 자체 상수로 하드코딩(GA 안정 경로, sync 의존 제거). 폴더 생성 부작용 아니었음(에러였음).
2. **sync 로그 'vhk sync' 오염** (init-core-rules-warn): goal 91 테스트가 "core-rules 경고는 vhk sync 아닌 inject-bootstrap 안내" 검증(`not.toContain('vhk sync')`). 내 자동sync 성공 로그의 `(vhk sync)` 문구가 전체 출력 오염. → 로그에서 `(vhk sync)` 제거.
3. **CLAUDE.md 스택 포맷 변화** (init-other-type): 자동sync 후 CLAUDE.md 가 RULES.md 파생이 되며 스택이 "A + B + C" 조합 → 리스트 형태로. **정보 손실 아님**(실측: 스택은 CLAUDE.md 리스트·RULES.md·ARCHITECTURE.md 전부 보존). 테스트가 init-템플릿 포맷("+")을 기대 → 자동sync 현실에 맞게 갱신(CLAUDE.md 토큰 존재 + 정확 조합은 sync 비대상 ARCHITECTURE.md 에서 확인). 테스트 약화 아님 — 스택 보존을 더 강하게 검증.

### 게이트
- tsc 0 · lint 0 · init 49 test · 실 init 2케이스(그린필드/브라운필드) behavior 검증 · 전체 스위트 회귀 0(4건 수정 후).

## 다음 (RFC 0060 잔여)
- T4 — 트리거 격차 계승(RFC 0057 §7): 마커 규칙 문구를 RULES.md에 넣어 sync 로 전 에이전트 전파.
- T1b(선택) — `vhk check` 잔여 슬롯 카운트.
- T4 — 트리거 격차 계승(RFC 0057 §7): 마커 규칙 문구 → sync 전 에이전트 전파.
- T1b(선택) — `vhk check` 잔여 슬롯 카운트.
