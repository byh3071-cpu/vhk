# 2026-07-01 — N5 vhk evolve digest (ⓓ)

## 무엇·왜
- ⓓ: evolve apply 수동 → **자동 apply 배제(철칙)**. 대신 pending 룰 후보를 **신뢰도별 묶음 초안**으로 출력해 사람 PR 검토 비용↓. RULES.md 미변경.

## 구현
- `evolve.ts`: `buildDigest(pending, patterns)` 순수 — patternId→pattern.count 조인으로 **신뢰도(5+=high·3~4=med·<3=low)** 부여, 빈도 내림차순(동률 id 오름차순). `evolveDigest` 핸들러 = readQueue + loadForMutation(비영속·읽기전용, loop 계약 동일) → 신뢰도 그룹 렌더.
- **철칙**: 자동 apply 0, RULES 미변경 — digest 는 PR 초안 복사용. 반영은 `evolve apply` 사람 승인.
- 등록: index evolve **서브명령** `digest` + command-registry **CONTAINER allowlist**(digest) + ko evolve.digest* + COMMANDS.

## 검증
- TDD: evolve-digest.test.ts 5(신뢰도 매핑·경계 5/4/2·패턴미상 0·정렬·빈입력).
- **스모크가 CONTAINER 드리프트 포획**: `vhk evolve digest` 실행 시 "서브커맨드 아님"(command-registry allowlist 누락) → 추가 후 실동작. (N1 KNOWN 교훈과 동형 — 통합 스모크 필수.)
- 전체 2138 green · typecheck 무에러.

## 다음
- **복리 척추 5개(N2·N7·N6·N1·N4) 완성 + N5(ⓓ) 마감.** 후속 후보: N11 evolve-nudge hook·measure-first(Recall@5)·v2.8.0 발행.
