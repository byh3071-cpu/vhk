---
vhk_format: 1
type: goal
id: 72
title: vhk secure — PAT-001/002/004 LLM 가드레일 검출 (goal72)
status: DONE
priority: P1
branch: main
completed: 2026-06-16
---

# Goal 72: LLM 가드레일 휴리스틱 스캔

## 작업

- [x] `src/lib/scan-llm-guardrails.ts` 신규: PAT-001/002/004 grep 기반 휴리스틱 검출
- [x] `src/commands/secure.ts` 수정: LLM 가드레일 섹션 추가, early return 제거 → 항상 양 섹션 출력

## 완료 기준

- [x] `pnpm build` 성공
- [x] `vhk secure` 실행 시 LLM 가드레일 섹션 출력
- [x] news-automation에서 PAT-001 1건 + PAT-002 3건 감지 확인

## 구현 설명

```
scan-llm-guardrails.ts 파일 단위 검사 흐름:
1. LLM 임포트/호출 지표 포함 파일만 대상
2. PAT-001: select/multi_select 쓰기 + ALLOWED_ 상수 없음 → warn
3. PAT-002: json.loads(content) / JSON.parse(content) + extract 없음 → warn
4. PAT-004: 노출 경로(api/routes/actions/webhook) + LLM 호출 + Math.min/CAP 없음 → warn
```

## 주의

- grep 기반 휴리스틱 — false-positive 가능 (예: briefing.py의 week_label select)
- AST 기반 정밀 분석은 후속 goal로 분리
- 패턴 원본: `yohan-brain/docs/patterns/PAT-001/002/004-*.md`
