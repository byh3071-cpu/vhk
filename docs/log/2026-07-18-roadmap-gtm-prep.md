# 2026-07-18 — 로드맵 실측 정합 + GTM 준비물(적발 데모·이슈템플릿)

## 결론

로드맵·next-task·LIVE의 stale 5건을 실측으로 청산(Phase 0 ✅ 전환)하고,
Phase 2 잔여 GTM의 AI 몫 중 미개발 2종(거짓완료 적발 데모 · 이슈템플릿)을 개발.
quickstart는 이미 README 90행에 존재 — 로드맵 스펙(07-13)이 낡았던 것으로 판정.

## 실측 드리프트 청산 (Phase 1 exit "불일치 0" 소급)

| stale | 실측 | 반영 |
|---|---|---|
| #455 "사람 판단 대기" (3문서) | 이슈 CLOSED | roadmap·next-task·LIVE 정리 |
| "T6 부채정리 잔여" | #502 머지·scripts/archive 84개 실재 | Phase 2 잔여에서 제거 |
| PR #464 "사람 머지 대기"·#461 "판정 대기" | 둘 다 MERGED | Phase 0 exit 충족 → ✅ |
| goal 65 "판정 잔여" | 종결 PR #505 OPEN(사람 검토 대기) | 상태 명시로 교체 |
| AI 큐 "GTM → T6 → ..." | T6 완료 | 큐에서 제거 |

## GTM 준비물 개발

1. **거짓완료 적발 데모** — README 핵심 루프 §3에 실캡처 삽입.
   scratchpad 미니 프로젝트(실패 테스트 + 미커밋 변경)에서 `vhk receipt` 실행 →
   🔴 BLOCK 판정 실출력 그대로 사용(연출 캡처 아님, 30초 재현 커맨드 병기, 한계 문구 유지).
2. **이슈템플릿** — `.github/ISSUE_TEMPLATE/` bug_report.yml(증상·재현·기대 필수 +
   `vhk doctor`/`vhk stats` 자발제출 선택 필드) · feature_request.yml(문제 중심 서술 유도 +
   stats 선택) · config.yml(README 링크).
3. quickstart — 기존 90행 실재 확인, 신규 작성 불필요(로드맵 ✅ 처리).

## 남은 것

- GTM 게시(Show HN·블로그 정정) = 사람 · SEO 키 실투입 = 게시 주간.
- PR #505·#504 검토·머지 = 사람.

## 게이트 판정 (정직 기록)

- build ✅ · lint ✅(exit 0) · test = **로컬 환경 결함으로 실행 불가** — TS-004 악화 재발
  (vitest 워커 0xC0000409, main에서도 동일 재현 = 본 변경과 무관 선재). 변경은 docs/.github뿐이라
  코드 표면 0. **최종 게이트 = PR CI** (TS-004 교리: CI 매트릭스가 진실원).

## 세션 마감 (append)

- PR #509 머지(4f3e714) — CI 4매트릭스+dogfood 2종+CodeQL+CodeRabbit 전부 green(windows pass = 로컬 크래시 환경 결함 재확증). 브랜치 정리 완료.
- 상태문서 마감 갱신: next-task(AI 큐 빈 상태)·LIVE·roadmap(Phase 2 = 게시만 잔여).
- 다음 세션: 사람 큐(PR #505·#504 검토 → G3 육안 → GTM 게시 판단) 소화가 임계경로. AI는 게시 후 Phase 4 판정 재료 누적.
