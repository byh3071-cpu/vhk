<!-- English README (round-2 launch asset). Korean README.md is the source of truth; keep in sync on release. -->

# VHK - Vibe Harness Kit

> **v2.9.0** — A full-cycle, agent-agnostic coding harness. AI models keep changing; VHK keeps your project from collapsing when you swap the agent — or when a stronger model replaces your main one entirely.

VHK is **not** a coding agent. It's the harness underneath them. The model is the swappable part; the **system — rules, spec, evidence, memory, structure — lives in your repo**. Whether Claude Code, Codex, Cursor, Copilot, Gemini, or whatever's next does the work, the rules, gates, and context stay the same. It carries a project full-cycle: scaffold → spec → build with evidence gates → ship → even draft marketing/ops.

You don't have to memorize commands. Run `vhk` for a menu, or use natural language like `vhk save`, `vhk goal next`, `vhk preflight`.

> Korean-first: the tool routes Korean natural language too (`vhk 저장해줘`). English docs are catching up — the Korean [README.md](README.md) is the fullest reference.

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

## Install

```bash
npm install -g @byh3071/vhk
vhk --version
```

Requires Node.js >= 22. One-off runs: `npx -y @byh3071/vhk`.

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

## Requirements

- Node.js >= 22, Git
- Optional: `gh` CLI (for `vhk cloud push/pull`), a project package manager (pnpm/yarn/npm)

## License

MIT — [LICENSE](LICENSE)

Repository: https://github.com/byh3071-cpu/vhk · Site: https://yohanstudio.co/vhk
