# docs/troubleshooting/ — 에러·해결 기록

같은 에러를 두 번 디버깅하지 않기 위한 폴더. 증상 → 원인 → 해결을 남긴다.

- **네이밍**: `TS-NNN-슬러그.md` (3자리 zero-pad — RFC 0051이 recap 자동 생성도 이 형식으로 통일)
- **언제 쓰나**: 원인 규명에 시간이 든 에러. 오타 수준 픽스는 commit 메시지로 충분.
- **형식**: frontmatter(id·date·category) + 증상/원인/해결/관련 커밋.
- **자동 감지**: `vhk recap`이 fix/bug 키워드 커밋에서 후보를 감지해 대화형 생성,
  `vhk work handoff`가 미기록 후보를 보고(RFC 0051).
- **유지 정책**: append-only. 범용 패턴이 되면 docs/patterns/(PAT-NNN)로 추출.
