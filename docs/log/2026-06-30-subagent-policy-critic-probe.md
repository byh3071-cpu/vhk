# 2026-06-30 — 서브에이전트 활용 정책(ADR-007) + critic 쓰기권한 결함 발견·probe

## 발단
사용자 질문: "Claude Code 공식 문서 기준으로 vhk에 서브에이전트 도입하면 어떻게 생각?"

## 검토 결론
서브에이전트는 **이미 도입돼 있음** — `yohan-core` plugin에 explorer/planner/critic/shipper 4개(단일 책임·도구 최소권한 선언·model 차등 = 공식 best practice 준수). 따라서 "새 도입"이 아니라 "활용 정책" 문제 → **ADR-007**로 확정:
- plugin을 SoT로 유지(레포 복제 금지 = 드리프트 회피), 읽기전용 위임(explorer/critic) 활용.
- **합불 판정·자동 push/머지·vhk-auto 루프 분해는 금지**(INV-1/INV-7 + 공식 anti-pattern).

## 발견 — critic 쓰기권한 결함
정책 검토 중 probe로 발견: `yohan-core:critic`이 정의(`tools: Read,Grep,Glob,Bash` = 읽기전용)와 달리 런타임에 **Write를 보유·실행**(scratchpad에 파일 실제 생성 — 실측은 Write 실행 1건, Edit는 미probe). CLAUDE.md가 경고한 "적대리뷰 에이전트 read-only(과거 `vhk save` 정크커밋 사고)" 원칙이 critic에 한해 구조적으로 깨진 상태.

## probe 결과 (가설⑶ 검증)
- explorer·planner probe → 둘 다 Write 미보유(정의대로 읽기전용) = **tools 선언 자체는 작동**(⑶ "선언이 런타임 무력화" 전면 형태 반증). 단 선언은 하한만 보장.
- critic만 선언 외 Write 보유 → critic 고유 `memory: project`가 원인으로 **추정(n=1, 미확정)**. cross-check 스킬은 read-only라 배제.

## 산출물 (PR 2개 — 각 4중 게이트 통과 머지)
- **#425** (main `bef31f9`): ADR-007 정책 + CLAUDE.md LIVE critic 쓰기·커밋 금지 가드(단기 B). G4 적대리뷰 **3라운드**(ADR 과장 정정).
- **#427** (main `3bd723b`): ADR-007 후속 검증 노트(append-only — ⑶ 반증·원인 n=1·차단 보류) + `memtest` 격리검증 셋업. G4 **2라운드**.

## G4 적대리뷰 성과 (이번 세션 핵심 수확)
critic G4가 PR마다 ADR의 "미검증 내용을 measured/확정처럼 기록" 패턴을 반복 적발(#425 3R·#427 2R) → 정정 후 통과. vhk 거짓완료 탐지 정체성(ADR-006)이 **자기 문서에 실작동**한 사례. 역설: 쓰기 결함을 가진 critic이 그 결함을 기록한 ADR을 적대검증.

## 다음 세션 (ⓒ — 사용자 A 선택: 확정 후 차단)
`.claude/agents/memtest.md`(`tools: Read` + `memory: project`만) probe:
- Write 생기면 → `memory: project`가 원인 **확정** → `yohan-cc-skills` 레포 `plugins/yohan-core/agents/critic.md`에서 `memory: project` 제거(구조 차단, 전역 plugin PR).
- 못 쓰면 → 원인 재조사.
- 확인 후 `memtest.md` 삭제.
- 즉시 위험은 CLAUDE.md LIVE B 가드로 덮인 상태(서두를 필요 없음).

## 잔여 / 주의
- `yohan-cc-skills` 레포에 **미커밋 `critic-gate.ps1` 변경**(출처불명·push 매처 블록 추가 — 이번 작업과 무관, 사용자 확인 필요).
- scratchpad probe 파일들(critic/explorer/planner-write-probe.txt) = 세션 임시·git 밖·무해.
- G4 잔존 경미(append-only라 미수정): #427 경미-1(결과⑴ vs 노트 표현 충돌)·경미-2(explorer 가드 조건 만료 표현)·경미-4(shipper probe 미언급).
