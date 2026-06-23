---
vhk_format: 1
type: goal
id: 67
title: vhk loop-brief — 토큰-부족 루프 1틱 최소 앵커 (의도+1goal+recall+STOP) -P1
status: DONE
priority: P1
created: 2026-06-13
depends_on: [66]
---

# Goal 67: vhk loop-brief — 토큰-부족 루프 1틱 앵커

> 출처: 루프 엔지니어링의 **토큰-부족(token-scarce) 루프**. 긴 자율 루프가 매 반복 전체
> 대화를 쌓으면(토큰-풍부) 컨텍스트 폭증·의도 망각이 온다. 매 틱 컨텍스트를 리셋하고
> *최소 앵커*(의도+목표1개+관련교훈+STOP)만 재주입하면 100번째 틱도 1번째와 같은 크기 —
> 비용 일정, 의도 안 흐려짐. Ralph 루프의 `PROMPT.md` 역할.
> ⚠️ **기안 단계(NOT_STARTED)** — 카드만. depends_on Goal 66(VISION 섹션을 읽음).

## The Goal

`vhk loop-brief` 가 `.vhk/loop-brief.md`(루프 1틱용 극소 앵커, ~15줄)를 생성한다.
기존 `context --compact`(부팅 지도)·`brief`(상태 스냅샷)와 **다른 축** — 의도 고정 전용.

## 출력 `.vhk/loop-brief.md` 4섹션 (극압축)

```
# Loop Brief — 1틱 앵커

## 의도 (VISION)
<VISION.md 의 What 한 줄 + Loop Anchor 불릿>   ← Goal 66 의존

## 지금 할 일 (활성 goal 1개)
- id / title / status / file

## 관련 교훈 (recall)
- <활성 goal title 로 memory recall top 2>

## STOP 조건
- HARD_STOP 활성 여부 · 활성 blocker · 위험 작업은 사람 확인
```

## `--compact` 와 차이 (중복 방지 — 카드에 명시해 리뷰 방어)

| | `vhk context --compact` | `vhk loop-brief` |
|---|---|---|
| 목적 | LLM 부팅 컨텍스트(스택+트리+메모리+goal+참조) | **1틱 의도 고정** 최소 앵커 |
| 분량 | 수십 줄 | ~15줄 극압축 |
| 비전 | 없음 | **VISION 의도가 핵심** |
| STOP | HARD_STOP 만 | HARD_STOP + blocker + Loop Anchor |
| 비유 | 온보딩 문서 | Ralph 루프 PROMPT.md |

→ 부분집합이 아니라 다른 축(의도 고정 vs 환경 파악).

## 동작 (착수 시) — 재사용 최우선, 새 코어 로직 ≈0

`src/commands/loop-brief.ts` 신규 — `brief.ts` 구조 복제. 재사용 헬퍼:

| 섹션 | 재사용 함수 (구현 시 grep 확인) |
|---|---|
| 활성 goal | `listGoals('goals')` + `selectActiveId` |
| 관련 교훈 | `readMemory(cwd)` + recall 함수(`recallMemories`/`recallForAction`) |
| STOP | `isHardStopActive()` + `getActiveBlockers()` |
| 의도 | VISION.md 파싱(소형 신규 — `brief.ts` `readProjectIdentity` 패턴) |
| 다음 단계 | `printNextStep(...)` |

배선:
- `src/index.ts` — `program.command('loop-brief').alias('루프브리핑')` + `KO_ALIASES`.
  `process.exit` 금지(`process.exitCode`만 — MCP 안전).
- `src/lib/command-registry.ts` — `TOP_LEVEL_COMMANDS` 추가 (누락 시 `command-registry.test.ts` FAIL).
- `src/lib/nlp-router.ts` — union `| 'loop-brief'` + RULES 규칙. **brief 규칙보다 먼저 배치**
  (선평가 — "루프브리핑"이 brief 로 새지 않게). `src/lib/nlp-run.ts` dispatch case.
- `src/mcp/server.ts` — `registerTool('loop-brief', ..., runVhkCli(['loop-brief'], 'loop-brief'))`
  (읽기 전용, MCP 29→30).
- `COMMANDS.md` — loop-brief 행 (누락 시 `commands-doc.test.ts` FAIL).

## Completion Check (착수 후)

- [ ] `_meta` 모든 게이트 통과
- [ ] `src/commands/loop-brief.ts` 존재 + `loopBrief` export, 헬퍼 재사용(중복 구현 0)
- [ ] CLI(index.ts) + `TOP_LEVEL_COMMANDS` + 자연어 라우터 + COMMANDS.md 4곳 등록
- [ ] `process.exit` 미사용(MCP 안전)
- [ ] 라이브 e2e — `node dist/index.js loop-brief` → `.vhk/loop-brief.md` 생성, 크래시 0
- [ ] 활성 goal·VISION 없을 때도 graceful(빈 섹션, 크래시 0)

## Forbidden Actions (OUT)

- context/brief 출력 포맷 변경 0 (독립 명령).
- goal frontmatter 스키마에 STOP 필드 추가 금지 (GA 안정성).
- recall 알고리즘·임베딩 변경 0 — 호출만 (RFC 0049 Kill-gate 준수).
- 기존 tool API 시그니처 변경 0.
