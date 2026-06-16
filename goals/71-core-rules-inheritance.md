---
vhk_format: 1
type: goal
id: 71
title: vhk init — core-ruleset.yaml 마커블록 상속 (goal71)
status: DONE
priority: P1
branch: main
completed: 2026-06-16
---

# Goal 71: core-ruleset 마커블록 상속

## 작업

- [x] `src/lib/core-rules.ts` 신규: loadCoreRuleset / renderCoreRuleset / applyMarkerBlock / generateCoreRulesContent
- [x] `src/templates/core-ruleset-snapshot.ts` 신규: v0.1.0 번들 폴백 스냅샷
- [x] `src/lib/core-rules.test.ts` 신규: vitest 10개 (렌더·마커·멱등·폴백)
- [x] `src/commands/init.ts` 수정: generateFiles에 `.agents/CORE-RULES.md` 추가
- [x] `package.json`: yaml@2.9.0 의존성 추가

## 완료 기준

- [x] `pnpm build` 성공
- [x] vitest 신규 10개 통과
- [x] `vhk init`이 `.agents/CORE-RULES.md` 생성 (마커블록 + 특화 stub)

## 아키텍처

소스 우선순위:
1. `YOHAN_BRAIN_ROOT` 환경변수 → 라이브 yaml (항상 최신)
2. 없으면 번들 스냅샷 → npm 배포 환경 대응

마커 패턴:
```
<!-- CORE-RULES:START v0.1.0 (...직접 편집 금지) -->
... 8섹션 렌더 ...
<!-- CORE-RULES:END -->

## 이 프로젝트 특화 (사람이 작성 — sync 미관여)
```

## 참고

- 원본 SoT: `yohan-brain/memory/core/core-ruleset.yaml`
- 이후 시퀀스: YS1(yohan-studio) → MCP1(inject_core_rules)
