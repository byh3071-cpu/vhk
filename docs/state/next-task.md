# 다음 작업 (next-task)

> "지금 무엇부터"의 상태 SoT. 버전·테스트 등 사실값은 package.json·CHANGELOG가 SoT.

**갱신:** 2026-06-06
**Phase:** v2.4.0 발행 완료 + version-check SoT 추출 — 앞단 발행 라인 종료.

## 다음 할 일
- 앞단(코어 CLI) 추가 액션 없음.
- v2.4.0 발행됨 (npm latest): `vhk work`/`work handoff` + RULES.md 단일소스 + version-check SoT 포함.
- 뒷단 로드맵 = Goal 21~24 (launch·content·sell·ops) → docs/state/roadmap.md 참조
- (cosmetic·선택) tag v2.4.0 가 핫픽스 전 커밋 76db882 가리킴 — npm 정상이라 둠. green 커밋 원하면 `git tag -f v2.4.0 dced724; git push -f`.

## 블로커
- 없음

## 주의
- publish는 항상 main에서만 (가드 #119)
- active goal 은 goals/ 기준 동적 계산 (vhk work / vhk goal next)
