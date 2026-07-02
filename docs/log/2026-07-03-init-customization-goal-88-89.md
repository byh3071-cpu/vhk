# 2026-07-03 — goal 88/89 설계: VHK init 커스터마이징 자동화

> append-only. 추가만, 수정·삭제 금지.

## 한 일

사용자가 사주운세 디스코드봇·축구 레포를 VHK로 독푸딩하다 발견한 문제 — `vhk init`/`start`로 새 프로젝트를 만들면 CLAUDE.md/.cursorrules/헌법(core-rules)이 도메인에 맞게 자동 반영되지 않고, 노션 바이브코딩 스타터킷의 docs 구조(rfc/patterns/state/goals)도 새 프로젝트엔 안 만들어짐 — 를 조사·설계했다.

plan mode로 원인 분석(Explore 에이전트 3개 병렬 + Plan 에이전트 1개 + 코드 직접 검증) → "코드로 강제 vs 지침 강화" 이분법이 틀렸다는 결론(폴더/템플릿 생성=코드로 100% 강제, 도메인 내용=코드가 못 채우지만 트리거는 코드로 강제 가능, 세션 내내 재량 사용=완전 강제 불가) → 계획 승인 → goal 88/89로 분리.

### 변경
- `goals/88-init-docs-scaffold.md`(신규) — docs/rfc·docs/patterns README 스캐폴딩 + `vhk goal init` 발견성 노출. 기계적 부분만, P2.
- `goals/89-customization-hook.md`(신규) — 새 프로젝트 첫 세션에서 도메인 커스터마이징 인터뷰를 SessionStart 훅으로 강제 트리거(B-1) + core-rules 폴백 가시화(B-2, 아래 발견 참조). P1.
- `scripts/check-goal-88.mjs`·`scripts/check-goal-89.mjs`(신규) — `vhk goal sync` 실커맨드로 백필(손으로 안 베끼고, 65번 기존 스텁과 템플릿 동일한지 먼저 대조 확인 후 실행).
- `scripts/check-goal-73.mjs`·`scripts/check-goal-79.mjs`(신규) — 위 커맨드의 부수효과로 이번 작업과 무관한 기존 누락분도 같이 채워짐(idempotent 백필이라 안전).
- `goals/README.md` — 인덱스 재생성(8건→10건, 자동생성 스크립트로 갱신).

## 발견 (계획 승인 뒤 사용자 재검증 요청으로 추가 감사 중 확보)

- **core-rules 조용한 폴백**: `src/lib/core-rules.ts:77-94` `loadCoreRuleset()` — `YOHAN_BRAIN_ROOT` 환경변수 미설정/읽기실패 시 조용히 번들 스냅샷(`core-ruleset-snapshot.ts`, npm 배포 시점 박제)으로 폴백. `init.ts`/`start.ts` 어디에도 이 source(`live`/`bundled`)를 콘솔에 경고하는 코드 0건(마커 주석 안에만 흔적, 생성된 `.agents/CORE-RULES.md`를 직접 열어야만 보임). 사용자의 "헌법도 자동 반영 안 되고 그러더라" 불만과 정확히 부합하는 유력 원인 — 최초 승인된 계획엔 없었고 이번 감사에서 새로 찾아 goal 89(B-2)에 통합.
- **번들 스냅샷이 이미 라이브보다 뒤처짐(실측)**: `core-ruleset-snapshot.ts`엔 `pattern_refs`가 PAT-007까지만 있는데, `.agents/CORE-RULES.md`(라이브 상속분, `YOHAN_BRAIN_ROOT` 있을 때 core-ruleset.yaml에서 옴)엔 PAT-009까지 참조됨. 번들 스냅샷이 실제로 라이브보다 낡아있다는 직접 증거 — B-2가 풀려는 문제가 이미 실측으로 재현됨.

## 교훈

- **AI 세션 간 인수인계 상태값은 스냅샷이지 실시간이 아니다.** 이번 전달 프롬프트는 "미커밋 4건"이라 했지만 실제 `git status`는 8건(게이트 스크립트 백필 4개가 프롬프트 작성 이후 추가된 것으로 추정). 실행 전 항상 직접 재확인해야 함 — 이번엔 커밋 범위(어떤 파일을 stage할지)를 잘못 잡을 뻔한 지점이었다.
- **위 교훈이 패턴사전(PAT) 후보로 보였지만 번호를 임의로 못 매김.** `docs/patterns/`엔 PAT-001 파일 하나뿐이라 "다음은 002"로 보이지만, 코드 전역(`core-ruleset-snapshot.ts`·`scan-llm-guardrails.ts`·`secure.ts`·`ADR-005` 등)을 직접 grep해 확인한 결과 PAT-002~007은 이미 실사용 중인 확정 개념("LLM JSON 3단 게이트" 등)이고 PAT-008/009도 라이브 core-ruleset(yohan-brain, 이 세션에서 접근 불가)엔 이미 존재함이 간접 확인됨. 여기서 002를 붙였으면 실제 PAT-002와 충돌할 뻔했다 — **파일 생성 보류, 다음 가용 번호는 사용자 확인 필요(최소 010 이상으로 추정, 확정 아님)**.
- **plan mode 승인 뒤에도 재검증 요청은 실제로 새 갭을 잡아낸다** — core-rules 폴백 건이 그 증거. "승인됐으니 끝"이 아니라 재확인 자체가 오늘 값어치 있었다(dogfood 관찰 1호 데이터포인트).

## 다음

goal 88 코드 구현 착수 — explorer(haiku) 정찰 → planner(opus) 계획 → **사람 승인** → 구현 → critic(opus) 적대검증 순서로 진행(계획 승인 전 코드 변경 없음). PAT 번호 건은 사용자에게 별도 확인 요청 예정.
