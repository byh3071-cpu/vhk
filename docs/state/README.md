# docs/state/ — 상태 SoT

"지금 어디까지 했고 다음이 뭔가"의 단일 진실 소스. 세션이 바뀌어도 이 폴더만 읽으면 이어진다.

- **파일**: `next-task.md`(다음 할 일 — 세션 종료마다 갱신) · `blockers.md`(막힌 것 — append-only)
- **유지 정책**: next-task.md는 덮어쓰기 갱신이 정상. blockers.md는 과거 항목 수정·삭제 금지.
- **⚠️ 주의**: `vhk goal next`/`vhk work`가 next-task.md를 스텁으로 덮어쓸 수 있다 —
  수동 편집 직후 실행 주의(복구는 `git restore`).
