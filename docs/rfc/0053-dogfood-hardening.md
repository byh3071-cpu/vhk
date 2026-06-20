# RFC 0053 — 도그푸딩 하드닝 (Dogfood Hardening)

> 상태: Draft · 작성: 2026-06-20 · 출처: 실 사용자 전수 도그푸딩 감사(`docs/log/2026-06-20-dogfood-audit.md`)
> 목적: 도구를 **실제로 써보며** 드러난 *일상 사용 신뢰성·안전성* 결함을 작은 단위 goal로 분해해 봉인한다.
> 위치: RFC 0048(천장 ~4.7을 향한 품질 로드맵)이 "무엇을 더 잘 만들까"라면, 0053은 **"이미 만든 것이 매일 쓰기에 믿을 만한가"**를 다룬다. 0048의 보완.
> 연동: 실행 단위 = `goals/78~84`(각 `check-goal-N.mjs` 가드). 상태 SoT = `docs/state/next-task.md`. 사실값 SoT = `package.json`·`CHANGELOG`.

---

## §1. 배경 — 도그푸딩이 드러낸 것

13-에이전트 감사(RFC 0048)는 코드를 **읽어서** 구조 품질을 봤다. 이번 감사는 코드를 **써서** 동선의 신뢰성을 봤고, 읽기로는 안 보이던 결함이 나왔다:

- 조회처럼 보이는 명령(`goal next`)이 상태파일을 파괴한다.
- 로컬에서 게이트(`verify`)가 환경 탓에 상시 빨강 → 신호로서 무력.
- 증거(SHA)는 기록되는데 판정(`review`)이 소비를 안 한다.
- 검증 도구의 철학은 최상이나 집행력(자동 규칙 수·scope 기본값)이 약하다.

**핵심 통찰:** VHK의 약점은 "설계"가 아니라 **"설계와 집행 사이의 갭"**이다. 좋은 의도가 코드 강제력으로 닫히지 않은 지점들. RFC 0048 §2의 명제("4와 5를 가르는 것은 자동화")의 일상판이다.

## §2. 원칙

1. **조회와 변경을 분리한다.** 사용자가 "보려고" 누른 명령이 상태를 바꾸면 안 된다(읽기 안전성).
2. **게이트는 로컬에서 초록을 되찾아야 신뢰된다.** 환경 의존 실패는 게이트 신호에서 격리한다.
3. **기록된 증거는 소비되어야 한다.** 데이터만 쌓고 판정에 안 쓰면 죽은 코드.
4. **작은 단위 1 goal = 1 PR.** AI 독주 방지(RFC 0048 운영 원칙 상속).

## §3. 발견 → 실행 매핑

| ID | 발견(요약) | 심각도 | 처리 | 기존 연계 |
|----|-----------|:---:|------|----------|
| D1 | `goal next`가 next-task.md 파괴적 덮어쓰기 | P0 | **Goal 78** | — (신규) |
| D2 | 로컬 verify 환경의존 7개로 상시 빨강 | P0 | **Goal 79** | Goal 47(CI 매트릭스) |
| D3 | 증거 SHA가 review 신선도에 미연결 | P1 | **Goal 80** | Goal 44(SHA 기록) 확장 |
| D8 | 제품 *설명* SoT 분산(brief↔package) | P1 | **Goal 81** | Goal 54(버전만) 사각지대 |
| D6 | `.vhk` 런타임 산출물 gitignore 누락 | P2 | **Goal 82** | Goal 45(원장) |
| D7 | 보안 scan 테스트 픽스처 false positive | P2 | **Goal 83** | Goal 59(secure 신호) |
| D9 | doctor/status next-step 맥락 무지 | P2 | **Goal 84** | — (신규) |
| D4 | recall 키워드 오매칭 | P1 | RFC 0049 추진 | **새 goal 없음** |
| D5 | 검증 집행력 약함(check 2규칙·mission scope) | P1 | Goal 53 연계 | **새 goal 없음** |
| D10 | 백그라운드 자동화 브랜치 전환 | P2 | 워크플로 회피 | **코드 변경 없음** |

## §4. Goal 요약 (구현 방향)

- **Goal 78 — `goal next` 비파괴화 + `vhk goal peek`**: `goal next`가 next-task.md를 덮어쓰기 전 자동 백업(`.vhk/backups/`) + 수동 미커밋 변경 감지 시 확인. 순수 조회용 `vhk goal peek`(쓰기 0) 신설. 조회/변경 분리.
- **Goal 79 — verify 로컬 환경분리**: 환경 의존 테스트에 `@env` 태그(vitest), `vhk verify`가 로컬에서 이를 분리해 "환경 N개 보류"로 표기하고 게이트 판정에서 제외(or `--profile local|ci`). 먼저 7개 실패가 환경/회귀 중 무엇인지 조사 후 태깅.
- **Goal 80 — 증거 신선도 review 연결**: Goal 44가 기록한 HEAD SHA를 `review`가 읽어 `SHA≠HEAD`/dirty면 "증거 낡음" 신선도 강등. 메시지 정정(생성시각 추정 → SHA 기반).
- **Goal 81 — 제품 설명 단일 SoT**: brief 등의 제품 설명을 `package.json.description`에서 주입(하드코딩 제거). version-sync 패턴 확장 or 런타임 주입.
- **Goal 82 — `.vhk` 산출물 gitignore 정합**: 런타임 생성물(`ledger.jsonl` 등) gitignore 추가, 추적 대상/비대상 경계 명문화.
- **Goal 83 — 보안 scan 픽스처 allowlist**: 테스트 픽스처·예시 토큰 패턴 allowlist or `tests/**` 픽스처 제외 규칙. CRITICAL/HIGH는 유지.
- **Goal 84 — next-step 맥락 인지**: doctor/status가 활성 레포(커밋 수·변경 유무)를 보고 신규/기존 사용자 멘트를 분기.

## §5. 우선순위·순서

1. **P0 먼저**: Goal 78(읽기 안전) → Goal 79(게이트 신뢰). 둘 다 "매일 밟는 지뢰" — 체감 변화 최대.
2. **P1**: Goal 80(증거) · Goal 81(메타) · (D4 recall은 RFC 0049, D5는 Goal 53).
3. **P2**: Goal 82~84(노이즈·UX).

각 goal은 `vhk goal next`가 아니라 **수동으로 꺼내** 개별 PR. (D1 때문에 `goal next` 사용은 next-task 백업 후.)

## §6. 비목표 (Out of Scope)

- recall 의미검색 구현(→ RFC 0049), 검증 집행력 전면 확대(→ Goal 53) — 이 RFC는 인덱스로만 참조.
- 명령 수 축소·모드(초보/전문)는 별도 제품 결정(감사 §기능제안에 기록, goal 미발행).
- 영어화·글로벌 채택(→ RFC 0048 §1, 본질상 비목표).
