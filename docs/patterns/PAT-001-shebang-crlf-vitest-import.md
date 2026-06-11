---
id: PAT-001
패턴명: 셔뱅 스크립트 CRLF 체크아웃 시 vitest import 전멸
카테고리: test
증상: 테스트가 셔뱅(#!) 있는 .mjs 를 import 하면 Windows CI(autocrlf=true 체크아웃)에서만 "SyntaxError - Invalid or unexpected token" 으로 테스트 파일 수집 자체가 실패. 로컬(LF 체크아웃)에선 전부 green 이라 push 전엔 재현 불가.
원인: git autocrlf 가 셔뱅 줄을 "#!/usr/bin/env node\r\n" 으로 변환 — node 직실행은 허용하지만 vitest 의 모듈 변환 파이프라인이 셔뱅+CRLF 조합을 파싱 실패. 셔뱅 없는 .mjs(CRLF)는 통과하므로 순수 CRLF 문제가 아니라 조합 문제.
해결: 레포 루트 .gitattributes 에 `*.mjs text eol=lf` (`*.sh` 도 권장) — 어떤 autocrlf 설정에서도 LF 체크아웃 강제. 셔뱅은 유지 가능.
적용조건: 셔뱅 있는 스크립트를 테스트에서 import 하는 모든 레포 + Windows CI 매트릭스. .gitattributes 부재가 신호.
출처프로젝트: vhk-cli (feat/governance-v2)
태그: [vitest, crlf, gitattributes, windows-ci, shebang]
발견일: 2026-06-11
출처DevLog: docs/log/2026-06-10-governance.md §통합 — Workflow 적대검증 (D4-1)
---

# PAT-001 — 셔뱅 스크립트 CRLF 체크아웃 시 vitest import 전멸

로컬에서 절대 안 깨지는 부류(체크아웃 설정 의존)라 적대검증의 "다른 환경 clone 실측"이
아니면 머지 후에야 발견된다. 셔뱅 .mjs 를 테스트가 import 하기 시작하는 순간이 도입 적기.
