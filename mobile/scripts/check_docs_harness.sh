#!/usr/bin/env bash
# Validates agent knowledge-base structure (OpenAI harness-style progressive disclosure).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "FAIL: $*" >&2; exit 1; }
warn() { echo "WARN: $*" >&2; }
ok() { echo "OK: $*"; }

# --- AGENTS.md map budget ----------------------------------------------------
[[ -f AGENTS.md ]] || fail "AGENTS.md missing at repo root"
AGENTS_LINES=$(wc -l < AGENTS.md | tr -d ' ')
if (( AGENTS_LINES > 200 )); then
  fail "AGENTS.md has ${AGENTS_LINES} lines (hard max 200). Move depth into docs/."
fi
if (( AGENTS_LINES > 150 )); then
  warn "AGENTS.md has ${AGENTS_LINES} lines (soft max 150). Prefer a shorter map."
fi
ok "AGENTS.md present (${AGENTS_LINES} lines)"

# --- CLAUDE.md identical via symlink (or content hash fallback) --------------
[[ -e CLAUDE.md ]] || fail "CLAUDE.md missing"
if [[ -L CLAUDE.md ]]; then
  target="$(readlink CLAUDE.md)"
  [[ "$target" == "AGENTS.md" || "$target" == "./AGENTS.md" ]] \
    || fail "CLAUDE.md symlink must point to AGENTS.md (got: $target)"
  ok "CLAUDE.md → AGENTS.md symlink"
else
  if command -v shasum >/dev/null 2>&1; then
    h1=$(shasum -a 256 AGENTS.md | awk '{print $1}')
    h2=$(shasum -a 256 CLAUDE.md | awk '{print $1}')
  else
    h1=$(sha256sum AGENTS.md | awk '{print $1}')
    h2=$(sha256sum CLAUDE.md | awk '{print $1}')
  fi
  [[ "$h1" == "$h2" ]] || fail "CLAUDE.md is not a symlink and content differs from AGENTS.md"
  warn "CLAUDE.md is a regular file (content matches). Prefer symlink to AGENTS.md."
fi

# --- Required paths ----------------------------------------------------------
REQUIRED=(
  ARCHITECTURE.md
  docs/design-docs/index.md
  docs/design-docs/core-beliefs.md
  docs/PLANS.md
  docs/PRODUCT_SENSE.md
  docs/DESIGN.md
  docs/FRONTEND.md
  docs/RELIABILITY.md
  docs/SECURITY.md
  docs/QUALITY_SCORE.md
  docs/exec-plans/tech-debt-tracker.md
  docs/exec-plans/active
  docs/exec-plans/completed
  docs/generated/feature-map.md
  docs/product-specs/index.md
  docs/references/backend-api.md
  docs/references/native-plugins.md
  docs/references/flutter-stack.md
  scripts/check_architecture.dart
)

for p in "${REQUIRED[@]}"; do
  [[ -e "$p" ]] || fail "missing required path: $p"
done
ok "required docs/scripts paths present"

# --- design-docs index must mention core-beliefs -----------------------------
grep -q 'core-beliefs' docs/design-docs/index.md \
  || fail "docs/design-docs/index.md must reference core-beliefs"
ok "design-docs index links core-beliefs"

# --- AGENTS.md must point at key docs ----------------------------------------
for needle in ARCHITECTURE.md docs/PLANS.md docs/design-docs/core-beliefs.md; do
  grep -q "$needle" AGENTS.md || fail "AGENTS.md must mention $needle"
done
ok "AGENTS.md map references key docs"

echo
echo "Docs harness checks passed."
