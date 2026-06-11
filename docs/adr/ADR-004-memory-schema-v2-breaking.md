---
id: ADR-004
date: 2026-06-03
status: accepted
tags: [memory, breaking-change, migration, backfill]
---

# ADR-004: memory.json v1→v2 breaking 과 무손상 마이그레이션 정책 (v2.0.x)

> ⚠️ **백필**(governance T5, 2026-06-11 작성): CHANGELOG 2.0.1·커밋(e8f2265·b469b4e)·
> `src/commands/memory.ts` 기반 재구성. 발행은 v2.0.1(v2.0.0 은 릴리즈 분리로 미발행).
> 이 ADR 은 향후 **breaking 변경 템플릿** 겸용.

## 맥락 (Context)

memory.json v1 은 평면 배열 — 결정/실패/성공/패턴이 한 줄로 섞여 검색·진화 루프
(pattern/evolve)가 타입을 구분할 수 없었다. 교훈은 `docs/state/learnings.md` 와
memory 두 곳에 이원 기록되어 단일 출처가 깨져 있었다.

## 결정 (Decision)

- **스키마 v2**: `{ schemaVersion: 2, decisions[], failures[], successes[], patterns[] }`
  4버킷 + 항목 생명주기 `status: active|resolved|archived`.
- **learn 통합**: 교훈 = `failures[].lesson` 단일 SoT. learnings.md 신규 기록 중단
  (기존 내용은 마이그레이션으로 흡수·동결).
- **무손상 자동 마이그레이션**: 어떤 명령이든(read 경로 포함) v1 감지 시 1회 v2 변환,
  멱등. 백업 2중 — `.v1.bak`(write-once 영구 원본) + `.bak`(롤링).
- **breaking 운영 정책(템플릿 가치)**: ①메이저 범프 ②자동·멱등 마이그레이션 ③원본
  write-once 백업 ④CHANGELOG 에 BREAKING + Migration 섹션 ⑤구버전 파일은 어느 진입점
  에서도 동작(read 경로 변환).

## 대안 (Alternatives)

1. **v1 유지 + 태그 필드 추가** — 기각: 타입별 생명주기(resolved/archived)와 버킷별
   소비자(pattern 은 failures.active 만)를 평면 배열 위에 흉내내면 복잡도가 더 큼.
2. **수동 마이그레이션 명령만 제공** — 기각: 비개발자 사용자가 마이그레이션을 잊으면
   데이터가 갈라짐. read 경로 자동 변환으로 "잊을 수 없게".
3. **learnings.md 유지(이원 기록)** — 기각: 단일 SoT 원칙. 동결이 정직한 정리.

## 결과 (Consequences)

- (+) pattern(goal 19)·evolve(goal 20)가 버킷·생명주기를 전제로 구축됨 — v2 없이는
  진화 루프 불가.
- (+) `.v1.bak` 영구 백업으로 손실 0 보고 — 이후 신뢰 사례로 인용.
- (−) v2.0.0 발행 사고(릴리즈 분리·2.0.1 재발행) — "publish 는 main 에서만 + 브랜치
  확인" 규칙(#119 가드)의 배경 사건 중 하나.
- evolve schema v2(goal 58)·stats(goal 61)가 같은 4버킷 위에 누적 — 스키마 결정이
  후속 3개 기능의 토대가 됨.
