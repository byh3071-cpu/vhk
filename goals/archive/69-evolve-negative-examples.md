---
vhk_format: 1
type: goal
id: 69
title: vhk evolve — 부정 예시 자동 수집 (실패 패턴 → RULES.md ❌ 후보)
status: DONE
priority: P2
created: 2026-06-16
---

# Goal 69: evolve 부정 예시 자동 수집

> 출처: Fable 5 "부정 예시 설계" 패턴 — 실패 사례가 자산이다. ✅/❌ 예시 쌍은
> 긍정 예시만큼 부정 예시가 중요하다(충돌 회피, 잘못된 행동 억제).
> 현재 `vhk evolve`는 학습·패턴만 수집. 실패 패턴 → RULES.md ❌ 예시 자동 제안이 빠짐.
> ⚠️ **기안 단계(NOT_STARTED)** — 카드만.

## The Goal

`vhk evolve --collect-negatives`(or `vhk evolve failures`) 가 memory/learnings에서
실패·오류 패턴을 추출 → RULES.md에 ❌ 예시 후보로 제안(사람 확인 후 추가).

## 핵심 설계

1. **수집원**: `vhk memory` 4버킷 중 `failures` + docs/troubleshooting/ `TS-NNN` 파일
2. **추출**: 실패 패턴 → "❌ 하지 마라: <행동> — 이유: <원인>" 형식으로 압축
3. **출력**: `.vhk/negative-candidates.md` (사람이 검토 후 RULES.md에 추가)
4. **강제 추가 금지**: RULES.md 자동 편집 금지, 후보 제안만

## Completion Check (착수 후)

- [x] `_meta` 모든 게이트 통과
- [x] `vhk evolve` 기존 동작 무손상 (신규 `negatives` 서브커맨드만 추가, 기존 API 불변)
- [x] failures 버킷 + troubleshooting/ 추출 → `.vhk/negative-candidates.md` 생성
- [x] RULES.md 자동 편집 0 (후보만, 사람 확인 — `vhk evolve negatives` 는 write 안 함)
- [x] 빈 failures 버킷 시 graceful (renderNegativeCandidates 빈 입력 안내)

## Forbidden Actions (OUT)

- RULES.md 자동 수정 금지
- memory 4버킷 스키마 변경 금지 (RFC 0049 Kill-gate)
- 기존 evolve 동작·API 변경 0
