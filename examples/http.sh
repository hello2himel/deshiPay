#!/usr/bin/env bash
# deshiQR — curl example for the stateless HTTP endpoint.
#
# Usage:
#   ./examples/http.sh                                   # local Supabase functions serve
#   ./examples/http.sh https://<project-ref>.supabase.co/functions/v1/update
#
# Deploy notes: docs/self-hosting.md. HTTP contract: docs/api.md.
# The payload below is the synthetic DEMO STORE fixture from docs/demo-payloads.md.
set -euo pipefail

ENDPOINT="${1:-http://localhost:54321/functions/v1/update}"
PAYLOAD="00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D"

echo "POST $ENDPOINT" >&2

# Each warning is a { code, message, tag? } issue; pass "warnings": false to silence them or
# {"warnings": ["59"]} to suppress specific tags/paths.
curl -sS -X POST "$ENDPOINT" \
  -H "content-type: application/json" \
  --data "$(cat <<JSON
{
  "payload": "$PAYLOAD",
  "edits": { "amount": 500, "reference": "BILL123" },
  "warnings": true
}
JSON
)"

echo
