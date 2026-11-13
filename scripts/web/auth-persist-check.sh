#!/usr/bin/env bash
# Scenario 3 of homeowner-password-login: a web session survives `docker compose restart web`.
#   1. phase save:  sign in as bm-homeowner (Playwright, Keycloak + Mailpit code) and write the
#                   storage state to apps/web/test-results/auth-state.json (git-ignored);
#   2. restart:     docker compose restart web, then wait until it is healthy again;
#   3. phase check: load that state, expect the account entry and /api/me 200.
# Prerequisite: the stack is up (./init.sh). Exit 0 only when both phases pass.
set -euo pipefail
cd "$(dirname "$0")/../.."

state=apps/web/test-results/auth-state.json
rm -f "$state"
echo "==> phase save (sign in)"
E2E_PERSIST_PHASE=save bash scripts/web/e2e.sh auth-persist.spec.ts
# Scenario 4: the row key is the SHA-256 of the cookie value, and the tokens are ciphertext.
cookie=$(python3 -c "import json,sys; print(next(c['value'] for c in json.load(open(sys.argv[1]))['cookies'] if c['name'] == 'bm_session'))" "$state")
hash_hex=$(printf '%s' "$cookie" | sha256sum | cut -d' ' -f1)
row=$(docker compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -c \"select count(*), coalesce(bool_or(encode(access_token_enc, 'escape') like '%eyJ%' or encode(refresh_token_enc, 'escape') like '%eyJ%'), false) from web_session.sessions where id_hash = decode('${hash_hex}', 'hex')\"")
if [ "$row" != "1|f" ]; then
  echo "ERROR: expected one session row keyed by sha256(cookie) with ciphertext tokens, got '$row'" >&2
  exit 1
fi
echo "  web_session.sessions: 1 row keyed by sha256(bm_session), tokens are ciphertext (no eyJ)"
echo "==> docker compose restart web"
docker compose restart web
docker compose up -d --no-build --wait --wait-timeout 120 web
echo "==> phase check (same browser state after the restart)"
E2E_PERSIST_PHASE=check bash scripts/web/e2e.sh auth-persist.spec.ts
rm -f "$state"
echo "auth-persist-check: session survived the web restart"
