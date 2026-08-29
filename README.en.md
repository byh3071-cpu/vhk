<!-- English README (round-2 launch asset). Korean README.md is the source of truth; keep in sync on release. -->

<div align="center">

# VHK — Vibe Harness Kit

**v2.15.1**

**A full-cycle, agent-agnostic coding harness that survives swapping the model underneath.**

Wrap whatever agent you use — Claude Code, Cursor, Codex — in one loop of review · verify · memory.
Rules compound as you go, so the project doesn't collapse when a better model replaces your main one. **Korean-first.**

[![CI](https://github.com/byh3071-cpu/vhk/actions/workflows/ci.yml/badge.svg)](https://github.com/byh3071-cpu/vhk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@byh3071/vhk?logo=npm)](https://www.npmjs.com/package/@byh3071/vhk)
![node](https://img.shields.io/node/v/@byh3071/vhk)
![license](https://img.shields.io/badge/license-MIT-blue)
![MCP](https://img.shields.io/badge/MCP-35_tools-8A2BE2)

**[What's new in v2.15](#whats-new-in-v2151) · [Quick Start](#install) · [VHK vs. a bare agent](#vhk-vs-a-bare-agent) · [Core loops](#core-loops)**

</div>

> [!IMPORTANT]
> npm latest is **v2.15.1**. It includes ADR-021's save guard and `--no-push` contract plus ADR-020's shared Agent Skills source and projections.

> [!NOTE]
> VHK is **not** a coding agent. It wraps the ones you already use and pins "what we agreed to do · is it actually done · where the next session resumes" as files + CLI gates. Swap the model — the rules, memory, and gates stay in your repo.

Run `vhk` for the menu, or use explicit CLI commands such as `vhk save`, `vhk goal next`, and `vhk preflight`. The exact Korean alias `vhk 저장` is a Commander command; `vhk 저장해줘` is natural language. Under ADR-021, standard/strict natural-language save requests preview and exit 1; lite executes only with a TTY and otherwise blocks. Non-TTY Commander runs require either `--yes` (commit and push) or `--no-push` (local commit only).

## What's new in v2.15.1

- **No unapproved pushes** — non-TTY `vhk save` requires either `--yes` (commit and push) or `--no-push` (local commit only). Human TTY flows remain unchanged.
- **Agent Skills across tools** — `.agents/skills` is the shared source of truth, with safe projections for Claude Code and the npm bundle. `sync --check` detects missing files, drift, and user conflicts without writing.
- **Default-off safety policy** — `vhk policy level/risk/show/check` evaluates permission, risk, allowlist, call-count, and time limits without executing the target command or enabling enforcement.
- **Separate intent and proof baselines** — `vhk receipt --mark-start` records only the starting SHA for intent/forbidden change scope. A receipt runs a fresh verification and compares its starting HEAD/dirty state with the state after the gates finish.
- **Stable closeout** — `vhk goal next` no longer mistakes blocked/deferred/observing Goals for completion or rewrites a terminal DONE/CANCELED snapshot. Generated gate skills route a normal all-DONE branch closeout to `review N/A` plus a branch receipt.

Automatic enforcement is not part of v2.15. It remains behind the observation gate and a separate human decision for v2.16.
Pass only one executable plus its argv to `policy check`; never append shell pipes, chains, or substitutions, which the shell could execute outside VHK.

## Why VHK

| Common AI-coding problem | What VHK pins down | Command |
| --- | --- | --- |
| Rule files drift per tool | Sync one `RULES.md` into every agent's rule file | `vhk sync` |
| Context vanishes when a session ends | Resume via `.vhk/context.md`, `brief`, `work` | `vhk work` |
| The agent says "done" but evidence is thin | Confirm evidence + gates: verify/review/receipt/preflight | `vhk verify` |
| Too many goals, unclear what's next | Fix the next goal in `goals/*.md` + `next-task.md` | `vhk goal next` |
| The same mistakes repeat | Accumulate lessons + rule candidates | `vhk learn` |
| Work continues from an unsafe state | 3 stacked blockers → `.vhk/HARD_STOP` | `vhk blocker` |
| AI cost leaks unnoticed | Budget/usage guard (warn at 80%, block at 100%) | `vhk cost` |

## VHK vs. a bare agent

VHK doesn't replace your agent — it fills the layer above: the repetition, memory, and gates an agent can't hold on its own.

| | Bare agent<br/>(Claude Code · Cursor alone) | Plain CI · eslint | **VHK** |
| --- | --- | --- | --- |
| Adversarial code review | on request, inconsistent | static rules only | **repeated gate** |
| Execution-based verification | partial (claims) | tests only | **runs `verify`, records evidence** |
| Rules & memory across model swaps | evaporate with the session | n/a | **portable rules · carried memory** |
| Rules that self-accumulate | none | manual config | **auto-appended every session** |
| Korean-first | English default | n/a | **Korean SoT + NL routing** |
| Release gate enforcement | none | pass/fail | **preflight · goal gate loop** |

## Install

```bash
npm install -g @byh3071/vhk
vhk --version
```

Requires Node.js >= 22. One-off runs: `npx -y @byh3071/vhk`.

### Optional: connect your own rules YAML

VHK runs standalone and does not require another repository. To supply additional rules, point VHK at a YAML file you control:

```bash
vhk config set-rules-file /path/to/team-rules.yaml
# or set VHK_RULES_FILE before starting the process
```

## 3-minute start

**New project**
```bash
mkdir my-app && cd my-app
vhk start   # git init, base docs, MCP config, context files in one shot
```

**Existing project**
```bash
vhk init -y
vhk sync        # align each AI tool's rule file to RULES.md
vhk context
vhk mcp-init     # let MCP clients (Cursor / Claude Desktop, …) call VHK
```

For an existing Cursor project, `vhk bootstrap cursor` installs VHK-managed workflow skills. New installs use `.agents/skills`, the shared project path for Google Antigravity, Codex, and Cursor, and generate `.claude/skills` as a managed Claude Code projection from the same source. VHK updates only copies whose marker and content hash prove they are unmodified; customized files and existing `.cursor/skills` are preserved with a manual-merge warning. Missing or inconsistent source files, links detected at execution time, and real write failures fail closed. Before updating a managed copy, VHK moves the old file into `.vhk/backups` and creates the replacement exclusively. A failed replacement restores the active copy; filesystems that cannot atomically expose a complete new file fail instead of falling back to a partial copy. Project-specific test-script detection remains delegated to `vhk verify`.

**Daily loop**
```bash
vhk work
vhk goal next
vhk mission set --objective "checkout bug fix" --scope "src/**" --forbidden ".env"
# ...develop...
vhk verify
vhk verify --dismiss lint-gate  # dismiss a current advisory; repeated dismissals stay counted
vhk review
vhk preflight --pr
vhk goal done
vhk save --yes -m "fix checkout bug"     # non-TTY: commit and push
vhk save --no-push -m "fix checkout bug" # non-TTY: local commit only
vhk work handoff
```

`vhk goal next` preserves a human-written `next-task.md` when only blocked, deferred, or observing goals remain. If a VHK-generated terminal snapshot becomes false after a goal is reopened, VHK invalidates that marker and its timestamp. When only DONE/CANCELED Goals remain, VHK updates an existing `next-task.md` but does not create a missing file; repeated calls on the resulting snapshot are read-only and create no timestamp or backup churn.

## Core loops

**1. Rules and skills portability** — `RULES.md` is the rules source; VHK generates/updates 8 targets: `.cursorrules`, `CLAUDE.md`, `.windsurfrules`, `.github/copilot-instructions.md`, `.agents/rules/vhk-rules.md`, `AGENTS.md`, `GEMINI.md`, `.clinerules/vhk-rules.md`. Portable VHK skills use `.agents/skills` as their source and `.claude/skills` as a managed projection. `vhk sync --check` fails (exit 1) on missing files, drift, or preserved user conflicts without writing anything — CI-friendly.

**2. Goals & HARD_STOP** — Goals link `goals/*.md` to `scripts/check-goal-<id>.mjs`. `vhk goal done` only transitions to DONE when the gate re-passes. Repeated blockers halt progress.

If a Goal is split into Phases and Tasks, `vhk context --json` projects the exact syntax below as a read-only
task graph. Phase IDs and Goal-wide Task IDs must each be positive, unique, and strictly ascending; gaps are valid.
The Phase/Task projection is optional: a legacy Goal with no Phase remains valid.

```markdown
### Phase 10
- [x] **Task 100** implementation / evidence: sample-evidence
- [ ] **Task 105** `(na)` excluded from this scope

### Phase 30
- [ ] **Task 220** verification / 증거: sample-report
```

Only the exact backticked `(na)` token immediately after the Task label means `notApplicable`; combining it with
`[x]` or `[X]` is a structural error. `/ evidence:` and `/ 증거:` are equivalent optional hints, never proof of
completion. `completed` and `notApplicable` are `terminal`; pending Tasks in the first Phase are `ready`, while a
later pending Task is `ready` only when every Task in the immediately preceding Phase is terminal, otherwise it is
`waiting`. First-Phase `dependsOn` arrays are empty; every later Task receives all preceding-Phase
`goal:N/task:N` string IDs. Tasks in one Phase do not depend on each other and may all be ready, but automatic
parallel execution is not guaranteed.
Malformed Phase headers and Tasks outside a valid Phase are structural errors. A legacy Goal with no Phase is
projected with `valid: true`, empty `activeGoal.phases` and `activeGoal.tasks`, a `NO_PHASES` warning, and exit 0.

The JSON path writes no files on success or failure. Structural, flag, and public-boundary failures return exit 1
with `valid: false`, `activeGoal: null`, and stable `errors`, without raw input, absolute paths, or stacks.
`vhk context --compact --json` follows the same safe-error contract.
Public-boundary checks reject secrets/tokens/keys, home-directory absolute paths, personal email addresses/real names/
personal repository names, and real external-service object IDs. Rejected raw input is never echoed; examples use only
`sample-*`, `<HOME>`, and clearly fake IDs. The incompatible `--compact --json` combination is a flag error with
`valid: false` and exit 1.

**3. Trust / evidence gates**
- `vhk verify` — runs 5 gates, shows advisory age/dismiss count, and writes `.vhk/reports/latest.json`
- `vhk review` — cross-checks the latest evidence against the goal's done-conditions
- `vhk receipt` — 4 machine proofs (the five verify gates: typecheck/lint/test/build exit codes plus secure scan, git dirty, verify-SHA freshness, diff-cover) to catch false "done", **zero LLM**
- `vhk preflight` — pre-ship checks (2FA / shim / env / lint / type / test / git / branch)

`vhk receipt` runs its own fresh verification. If either the verification-start commit or the post-gate commit cannot be identified, freshness is unknown and the result is CAUTION (exit 0); only known stale evidence is BLOCK (exit 1).

## MCP — 35 tools

`vhk mcp-init` writes the MCP config; clients call the `vhk mcp` stdio server. 35 tools registered, e.g. `save`, `status`, `diff`, `ship`, `doctor`, `check`, `sync`, `verify`-family, `context`, `brief`, `remind`, `content`, `launch`, `ops`, `sell`, `deploy`, `publish`, `memory-list`, `learn`, `pattern-*`, `evolve-*`. Interactive / high-state commands stay CLI-only (`gate`, `start`, `init`, `goal`, `mission set`, …).

## Security & privacy

- Local-first by default: logs, context, and memory stay in the repo and `.vhk/`.
- `.env` and sensitive files are continually checked by `.gitignore`, `secure scan`, and `preflight`.
- `vhk cloud push` uses a GitHub secret gist; tokens are never stored in code or config.
- Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public issue.

## Requirements

- Node.js >= 22, Git
- Optional: `gh` CLI (for `vhk cloud push/pull`), a project package manager (pnpm/yarn/npm)

## License

MIT — [LICENSE](LICENSE)

Repository: https://github.com/byh3071-cpu/vhk · Site: https://yohanstudio.co/vhk
