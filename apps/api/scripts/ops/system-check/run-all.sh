#!/usr/bin/env bash
# One-command system check (run from the apps/api/ folder).
#
# Prerequisites (local throwaway DB only - the scripts refuse any non-local API/DB):
#   1. DATABASE_URL points at a LOCAL Postgres, schema applied, then:
#        ALLOW_DEMO_RESET=true npm run db:seed && ALLOW_DEMO_RESET=true npm run demo:seed
#   2. API running on the demo port:  PORT=8123 npm run dev
#   3. (optional, for WITH_UI=1) client running with VITE_API_BASE=http://localhost:8123 and
#      Playwright available (npm i -D playwright; set CHROME_PATH if its browser is not downloaded).
#
# Usage:  bash scripts/ops/system-check/run-all.sh [outDir]      (WITH_UI=1 to include the browser pass)
set -uo pipefail
OUT="${1:-./system-check-out}"; mkdir -p "$OUT"
export SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://localhost:8123/api}"
echo "== 1/4 route inventory";   npx tsx scripts/ops/system-check/inventory.ts "$OUT/inventory.json"
echo "== 2/4 every route x every role"; npx tsx scripts/ops/system-check/sweep.ts "$OUT/inventory.json" "$OUT"
echo "== 3/4 file upload / download";   npx tsx scripts/ops/system-check/files.ts "$OUT"
echo "== 4/4 lifecycle, scoping, orphans, stored-file download evidence"; ALLOW_DEMO_RESET=true npx tsx scripts/demo/demo-verify.ts > "$OUT/demo-verify.log" 2>&1 || true
if [ "${WITH_UI:-0}" = "1" ]; then echo "== UI pass (all roles)"; mkdir -p "$OUT/ui"; node scripts/ops/system-check/ui-check.mjs "$OUT/ui"; fi
echo; echo "Reports: $OUT/sweep-report.md  $OUT/files-report.md  $OUT/demo-verify.log  ${WITH_UI:+$OUT/ui/ui-results.json}"
# Note: the sign-in limiter is 40 per 15 min per address; restart the API between repeated full runs.
