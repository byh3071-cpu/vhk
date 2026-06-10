# docs/superpowers/ — 구현 전 설계 spec

superpowers 워크플로(brainstorm → spec → TDD 구현)의 산출물.
구현이 시작되기 전의 "계약" — 동작/순서/검증/체크포인트/경계를 먼저 고정한다.

- **네이밍**: `specs/YYYY-MM-DD-주제-design.md`
- **언제 쓰나**: 무인 배치·다테마 작업 등 스코프가 미끄러지기 쉬운 작업 전.
- **유지 정책**: spec은 구현 후에도 보존(RFC와 함께 설계 근거의 원본).
  구현 중 spec과 달라진 결정은 dev log + ADR에 남긴다.
