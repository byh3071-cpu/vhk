# VHK Autonomy Evolution Roadmap

> SoT for Wave A/B/C. RFC 0054 (execution evolution) + RFC 0063 (overnight conductor).
> Plan mirror: Cursor plan `VHK Autonomy Roadmap` (do not diverge without owner).

## Three axes

| Axis | Meaning | Near-term measure |
|------|---------|-------------------|
| **Autonomy** | Unattended goal loop (vhk-auto) completes without human intervene | autonomy-run complete / start, interventions=0 |
| **Evolution** | Feedback into rules/patterns (evolve) | evolve-log adoption, check-log trend |
| **Execution power** | External side effects (send/pay/publish) | **OUT** until RFC 0054 D2 triggers |

## Waves

### Wave A — overnight infrastructure (this PR track)

1. Sync global vhk-auto skill to repo SoT (INV-9).
2. overnight-vhk-auto conductor: pick 1 goal → vhk-auto contract → `auto_pr_goal.ps1` (push+PR only).
3. Morning report template + helper.
4. `vhk stats` autonomy completion section (honest zero-sample).

Goals: **101–104**.

### Wave B — Goal 62 split (docs-diff)

Do not keep 62 as the only NOT_STARTED blocker. Split into:

| ID | Scope |
|----|-------|
| **105** | docs-diff ADR only |
| **106** | docs-diff impl + tests (advisory, block=0) |
| **107** | dogfood once + runbook line |

Goal **62** stays **DEFERRED** during Wave A (`deferred_reason` + `leads_to` 105–107).

### Wave C — sample accumulation / #373

- Conductor repeats small cards until autonomy-run **complete ≥ 5** (provisional N).
- Issue **#373** stays OPEN until samples exist — do not close early.
- Still **OUT**: 2-stage CLI `vhk auto`, Aroo, external execution D2.

## IN / OUT

| IN | OUT |
|----|-----|
| Docs, goal cards, gates, overnight conductor skill | overnight-autoloop (mcp/control-tower defect loop) |
| Wrapper push + PR via `auto_pr_goal.ps1` | Auto-merge |
| INV-7: vhk-auto commits only | Force-push / git config change |
| HARD_STOP stops the night | Asking humans A/B/C mid-run |

## Success definition

1. **complete ≥ 5** autonomy-run events with interventions=0 (Wave C; document threshold now).
2. **Morning PR routine**: open PR(s) + `MORNING_AUTONOMY_MERGE` 3-question checklist → human merge only.

## Skill SoT

- **Repo SoT**: `.claude/skills/vhk-auto/SKILL.md` (includes INV-9).
- **Global copy**: `~/.claude/skills/vhk-auto/SKILL.md` — replica only; sync from repo (Goal 101).

## Related

- RFC 0054 §Overnight → RFC 0063
- Runbook: `docs/runbooks/overnight-vhk-auto.md`
- Morning: `docs/runbooks/MORNING_AUTONOMY_MERGE.md`
- Prompts: `docs/prompts/autonomy/`
