<!-- English README (round-2 launch asset). Korean README.md is the source of truth; keep in sync on release. -->

<div align="center">

# VHK — Vibe Harness Kit

**A full-cycle, agent-agnostic coding harness that survives swapping the model underneath.**

Wrap whatever agent you use — Claude Code, Cursor, Codex — in one loop of review · verify · memory.
Rules compound as you go, so the project doesn't collapse when a better model replaces your main one. **Korean-first.**

[![CI](https://github.com/byh3071-cpu/vhk/actions/workflows/ci.yml/badge.svg)](https://github.com/byh3071-cpu/vhk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@byh3071/vhk?logo=npm)](https://www.npmjs.com/package/@byh3071/vhk)
![node](https://img.shields.io/node/v/@byh3071/vhk)
![license](https://img.shields.io/badge/license-MIT-blue)
![MCP](https://img.shields.io/badge/MCP-35_tools-8A2BE2)

**[Quick Start](#install) · [VHK vs. a bare agent](#vhk-vs-a-bare-agent) · [Core loops](#core-loops)**

</div>

> [!NOTE]
> VHK is **not** a coding agent. It wraps the ones you already use and pins "what we agreed to do · is it actually done · where the next session resumes" as files + CLI gates. Swap the model — the rules, memory, and gates stay in your repo.

Run `vhk` for a menu, or natural language: `vhk save`, `vhk goal next`, `vhk preflight`. Korean-first (`vhk 저장해줘`); the Korean [README.md](README.md) is the fullest reference.

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

**Daily loop**
```bash
vhk work
vhk goal next
vhk mission set --objective "checkout bug fix" --scope "src/**" --forbidden ".env"
# ...develop...
vhk verify
vhk review
vhk preflight --pr
vhk goal done
vhk save -m "fix checkout bug"
vhk work handoff
```

## Core loops

**1. Rules portability** — `RULES.md` is the source; VHK generates/updates 8 targets: `.cursorrules`, `CLAUDE.md`, `.windsurfrules`, `.github/copilot-instructions.md`, `.agents/rules/vhk-rules.md`, `AGENTS.md`, `GEMINI.md`, `.clinerules/vhk-rules.md`. `vhk sync --check` fails (exit 1) on drift — CI-friendly.

**2. Goals & HARD_STOP** — Goals link `goals/*.md` to `scripts/check-goal-<id>.mjs`. `vhk goal done` only transitions to DONE when the gate re-passes. Repeated blockers halt progress.

**3. Trust / evidence gates**
- `vhk verify` — runs 5 gates (tsc / lint / test / build / secure) and writes `.vhk/reports/latest.json`
- `vhk review` — cross-checks the latest evidence against the goal's done-conditions
- `vhk receipt` — 4 machine proofs (tsc/test/build exit codes, git dirty, stale SHA, diff-cover) to catch false "done", **zero LLM**
- `vhk preflight` — pre-ship checks (2FA / shim / env / lint / type / test / git / branch)

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
