# VHK 자율성 진화 로드맵

> ⚠️ **Superseded (2026-08-12)** — 이 문서의 완주 정의(`complete/start, interventions=0` 자기
> 보고 기반)와 측정 기준은 [2.x 로드맵](2.x-roadmap.md)의 작업 단위 110(SHA 조인 3중 기계 판정)·
> 111(병목 계측)·관찰 게이트(4주 AND 관측 완료 표본 10회)로 대체됐다. Wave 구획은 역사 참고용으로만
> 남긴다. 현 사이클의 원본은 2.x 로드맵 하나다 (ADR-010).

> Wave A/B/C SoT(구). RFC 0054(실행력 진화) + RFC 0063(overnight conductor).
> Cursor 플랜 `VHK Autonomy Roadmap`과 어긋나면 오너 확정 결정을 우선.

## 세 축

| 축 | 의미 | 가까운 측정 |
|----|------|-------------|
| **자율성** | 사람 개입 없이 vhk-auto goal 루프 완주 | autonomy-run complete / start, interventions=0 |
| **진화** | 규칙·패턴 피드백(evolve) | evolve-log 채택률, check-log 추세 |
| **실행력** | 발송·결제 등 외부 부작용 | RFC 0054 D2 트리거 전까지 **OUT** |

## 파동

### Wave A — overnight 인프라 (이번 PR 트랙)

1. 글로벌 vhk-auto를 레포 SoT와 동기화(INV-9).
2. overnight-vhk-auto conductor: goal 1장 → vhk-auto 계약 → `auto_pr_goal.ps1`(push+PR만).
3. 아침 리포트 템플릿 + 헬퍼.
4. `vhk stats` 자율 완주율 섹션(표본 0이면 정직 표기).

Goals: **101–104**.

### Wave B — Goal 62 분해 (docs-diff)

62를 NOT_STARTED 독점 상태로 두지 않고 후속으로 쪼갠다.

| ID | 범위 |
|----|------|
| **105** | docs-diff ADR만 |
| **106** | docs-diff 구현 + 테스트(자문형, 차단 0) |
| **107** | 도그푸딩 1회 + 런북 1줄 |

Goal **62**는 Wave A 동안 **DEFERRED** (`deferred_reason` + `leads_to` 105–107).

### Wave C — 표본 누적 / #373

- conductor로 소형 카드를 반복해 autonomy-run **complete ≥ 5**(임시 임계).
- 이슈 **#373**은 표본 전 OPEN 유지 — 일찍 닫지 않음.
- 여전히 **OUT**: 2단계 CLI `vhk auto`, Aroo, 외부 실행력 D2.

## IN / OUT

| IN | OUT |
|----|-----|
| 문서, goal 카드, 게이트, overnight conductor 스킬 | overnight-autoloop(mcp/관제탑 결함 루프) |
| `auto_pr_goal.ps1`로 push+PR | 자동 머지 |
| INV-7: vhk-auto는 commit만 | force-push / git config 변경 |
| HARD_STOP이면 그날 밤 중단 | 런 중 사람에게 A/B/C 질문 |

## 성공 정의

1. interventions=0인 autonomy-run **complete ≥ 5**(Wave C; 임계는 문서에 선기재).
2. **아침 PR 루틴**: open PR + `MORNING_AUTONOMY_MERGE` 3문답 → 사람만 머지.

## 스킬 SoT

- **레포 SoT**: `.claude/skills/vhk-auto/SKILL.md`(INV-9 포함).
- **글로벌 복제본**: `~/.claude/skills/vhk-auto/SKILL.md` — 복사본만. 레포에서 동기화(Goal 101).

## 관련

- RFC 0054 §Overnight → RFC 0063
- 런북: `docs/runbooks/overnight-vhk-auto.md`
- 아침: `docs/runbooks/MORNING_AUTONOMY_MERGE.md`
- 프롬프트: `docs/prompts/autonomy/`
