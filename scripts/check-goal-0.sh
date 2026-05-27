#!/usr/bin/env bash
# scripts/check-goal-0.sh — Goal 0 (MCP full coverage) gate.
#
# Mirrors goals/0-mcp-full-coverage.md "Completion Check" section.
# Pre-conditions:
#   - goals/_meta.md gates pass (delegated to scripts/check-meta.sh)
# Goal-local claims:
#   G0.1  src/mcp/server.ts has >= 24 registerTool() calls
#   G0.2  server.ts does not import inquirer (TTY-incompatible in MCP mode)
#   G0.3  src/mcp/server.ts does not use execSync (use safeExecFile)

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f ".vhk/HARD_STOP" ]; then
  echo "🛑 .vhk/HARD_STOP detected — refusing to run goal 0 gate."
  exit 1
fi

# ─── meta first ─────────────────────────────────────────────────────────
echo "[goal 0] running _meta gate first"
if ! bash "$ROOT/scripts/check-meta.sh"; then
  echo "    ✗ _meta failed — fix cross-cutting gates first"
  exit 1
fi

PASS=true
SERVER_FILE="src/mcp/server.ts"

if [ ! -f "$SERVER_FILE" ]; then
  echo "    ✗ $SERVER_FILE missing"
  exit 1
fi

# ─── G0.1 registerTool count ────────────────────────────────────────────
echo "[G0.1] registerTool count >= 24"
TOOL_COUNT=$(grep -c "registerTool(" "$SERVER_FILE" || true)
if [ "${TOOL_COUNT:-0}" -ge 24 ]; then
  echo "    ✓ pass ($TOOL_COUNT tools registered)"
else
  echo "    ✗ fail (found $TOOL_COUNT, need >= 24)"
  PASS=false
fi

# ─── G0.2 no inquirer import in MCP server ──────────────────────────────
echo "[G0.2] server.ts does not import inquirer"
if grep -E "from ['\"]inquirer['\"]" "$SERVER_FILE" >/dev/null 2>&1; then
  echo "    ✗ fail — inquirer import found in $SERVER_FILE"
  PASS=false
else
  echo "    ✓ pass"
fi

# ─── G0.3 no execSync ───────────────────────────────────────────────────
echo "[G0.3] server.ts does not use execSync"
if grep -E "\bexecSync\b" "$SERVER_FILE" >/dev/null 2>&1; then
  echo "    ✗ fail — execSync found (use safeExecFile)"
  PASS=false
else
  echo "    ✓ pass"
fi

if [ "$PASS" = true ]; then
  echo "✅ goal 0 gate passes"
  exit 0
fi

echo "❌ goal 0 gate failed"
exit 1
