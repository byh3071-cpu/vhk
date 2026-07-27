# RFC 0062 — 문서-실측 드리프트 자동감지: 수동 정리는 이번이 마지막

> 용어: ADR-011 대응표 참조.

> 상태: Accepted(2026-07-13 사용자 승인) — warn 모드 구현 착수 · 작성: 2026-07-13 · 출처: RFC 0058 T5 승계 + 2026-07-13 로드맵 재정렬(3관점 플랜+적대검증)
> 구현 노트(2026-07-13): C 계열의 신선도 검사는 기존 preflight `checkDocsFreshness`(goal 96)가 이미 담당 — sync --check 에 중복 구현하지 않음(모순 검사만). B 계열은 첫 라이브에서 근접(40자) 패턴이 오탐 2건("0056·0057**이** archived로 지칭"의 주체·대상 오독)을 내 §6 원칙대로 괄호형 지칭(`RFC 0055(…archived)`)으로 즉시 조임 — 오탐 이력은 drift-log 원장에 계측 사례 #1 로 남음.
> 채번: ⚠️ 0059 아님 — 0059 는 next-task(2026-07-06)가 §4 UX단순화·command manifest 용으로 선점(채번 충돌은 07-13 정정 완료).
> 연동: `vhk sync --check`(sync.ts, 무쓰기 검사 선례) · docs freshness 게이트(goal 96/PR #450) · `tests/version-sync.test.ts`(CI, vhk 레포 전용) · docs/state/roadmap.md(문서 계층·중복 쌍 등록 규칙)

## §0. 한 줄 결론

드리프트를 진단한 문서(RFC 0058)의 헤더 자신이 드리프트됐다 — **수동 정리는 재발한다는 게 자기표본으로 실증**됐다. 2026-07-13 수동 정합화(RFC 헤더 3건·next-task·CLAUDE LIVE·research-backlog)를 마지막 수동 정리로 만들기 위해, "선언 ↔ 실측" 쌍을 기계가 주기 검사하는 기능을 `vhk sync --check` 에 얹는다. **warn 선행 → 실측(오탐률) 후 fail 승격**(measure-first).

## §1. 문제 (실측)

- 2026-07-13 전수 정찰에서 발견된 드리프트: RFC 헤더 상태 3건(0055 archived인데 Draft·0057 완료인데 진행중·0058 T1~T4 완료인데 미착수) · next-task "블로커 없음" vs blockers.md 활성 2건 · CLAUDE LIVE 9일 stale · roadmap.md 1년 유물 · 노션 로드맵 4버전 격차.
- 전부 **사람이 손으로** 고쳤다(#482). 그러나 같은 클래스가 세션마다 재생산된다 — 상태를 쓰는 주체(AI 세션)가 여럿이고 append 지점이 흩어져 있어서.
- 기존 방어의 구멍: `version-sync.test.ts` 는 CI 테스트라 **vhk 레포 전용**(사용자 프로젝트엔 없음) + 버전 1쌍만 봄. docs freshness 게이트(goal 96)는 신선도(날짜)만 보고 **내용 모순**은 못 봄.

## §2. 설계 — 검사 3계열

구현 지점: `vhk sync --check` 확장(기존 무쓰기·exitCode 패턴 재사용). 신규 명령 없음(등록 4지점 불필요).

| 계열 | 검사 | 실측 소스 | 예 |
|---|---|---|---|
| **A. 수치** | 문서에 박힌 사실값 ↔ 실측 | package.json(version)·MCP tool count(레지스트리) | README `**vX.Y.Z**` ↔ package.json / CLAUDE LIVE `**버전:**` 줄 / README "MCP N tools" |
| **B. 상호참조 모순** | 문서 X 가 문서 Y 의 상태를 서술 ↔ Y 헤더 | docs/rfc/*.md 헤더 `> 상태:` 파싱 | "0055 는 archived" 라고 지칭하는데 0055 헤더가 Draft |
| **C. 상태문서 정합** | 상태 SoT 간 모순·신선도 | docs/state/*.md · git log | next-task "블로커 없음" 문구 vs blockers.md 비취소선 항목 존재 / next-task 갱신일 > 7일 && 그 후 merge 존재(goal 96 재사용) |

### 검사 쌍 등록부 (단일 소스)
`src/lib/drift-pairs.ts` — "선언 위치(파일·패턴) ↔ 실측 소스(함수)" 쌍의 배열. roadmap.md 의 "중복 서술이 불가피한 쌍은 드리프트 검사 대상으로 등록" 규칙의 이행 지점. vhk 자기 레포 전용 쌍(RFC 헤더 등)과 사용자 프로젝트 공통 쌍(version↔README)을 `scope: 'self' | 'any'` 로 구분 — 사용자 레포에서 vhk 내부 문서 검사를 강요하지 않는다.

## §3. 모드 — measure-first 준수

1. **v1 = warn**: 발견을 표로 출력 + `.vhk/events/drift-log.jsonl` 에 append(계측) · exit 0. 차단 없음.
2. **주간 판독**: 계측 DB 루틴(2026-07-13 재가동)에 "드리프트 신규 발생률" 편입.
3. **fail 승격 판정(사람)**: 수 주 실측 후 오탐률 낮으면 `--check` 실패(exit 1)로 승격 + preflight 항목 합류. **오탐 다수면 승격 포기**(로드맵 트립와이어) — 주간 수동 체크리스트로 다운그레이드.

## §4. IN / OUT

- IN: §2 3계열 · drift-pairs 등록부 · warn 출력 + 이벤트 원장 · `sync --check` 통합.
- OUT: **자동 수정 없음**(감지만 — 고치는 건 세션/사람) · 노션 대조 없음(외부 시스템 — 주간 사람 루틴) · 테스트 수·커밋 수 같은 고변동 수치(포인터 원칙: "사실값은 package.json" 서술이면 검사 대상 아님) · preflight fail 합류(승격 판정 후).

## §5. 성공 기준

- 2026-07-13 수동 정리분을 fixture 로 재현: 정리 **전** 상태(RFC 0055 Draft 헤더 + 0057 의 "archived" 지칭)를 주면 B 계열이 검출.
- vhk 자기 레포 실검사 green(정리 후 상태) — 오탐 0 으로 시작.
- 신규 드리프트 발생 시 다음 `sync --check` 실행에서 warn 표에 등장(주간 판독 지표 생산).

## §6. 위험

- **오탐 = 신뢰 사망**: 자연어 서술 파싱(B·C)은 보수적 패턴만(명시 마커/헤더 형식 한정). 애매하면 검사하지 않는 게 원칙 — false alarm 이 쌓이면 warn 이 무시된다.
- **검사 쌍의 드리프트**(메타): drift-pairs 자체가 낡을 수 있음 — 쌍마다 `addedAt`·출처 주석, 검사 실패(대상 파일 부재)는 오류가 아니라 "쌍 폐기 후보" 로 보고.
- 다중 세션이 같은 주 warn 을 반복 보고 → 원장 dedup 은 안 함(발생 빈도 자체가 지표).
