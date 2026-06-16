# 2026-06-16 — VHK Autopilot 1단계 MVP

## 한 일
- 오토파일럿(지휘자) 설계 → 적대 검증(5렌즈, blocker 9·high 16) → 교정 → 스펙·플랜·스킬 작성.
- 1단계 산출물 = `.claude/skills/vhk-auto/SKILL.md` (코드 0, 외부발송·집행 0).

## 결정 (교정안)
- "1단계=순수 지침 스킬"에 외부발송·집행·자동판정을 얹으면 헌법 5곳과 충돌(검증 결론) →
  위험·집행은 2단계 `vhk auto` 코드로 이연, 1단계는 "혼자 한 바퀴 돌고 멈춰 보고"만.
- 불변조건 INV-1..8 로 못박음(진행허가=verify green만 / 발송0 / 집행0 / 판정입력=latest.json+exit /
  commit 전 dev log stage / 멈춤=HARD_STOP 영속 / commit만 자동 / cavecrew·Workflow 제외).

## 교훈
- 자율 설계는 저자 자평 금지 — 독립 적대 검증이 코드까지 까서 "review/mission --json 부재",
  "check-records 훅이 무인 commit 차단", "MCP TTY 없어 승인 프롬프트 불가" 등 실측 결함 7건을 잡음.
- 바깥행동(gh issue)·집행(dedupe)은 LLM 결정경로에서 빼고 결정론 코드로(PAT-003 재확인).

## 다음
- 독푸딩: POS 프로젝트에서 `/vhk-auto` 1회 호출 → 수용기준(스펙 §10) 검증.
- 검증되면 2단계 스펙(`...-issue-pipeline-design.md`) 착수.
