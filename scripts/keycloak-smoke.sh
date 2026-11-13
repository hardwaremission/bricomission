#!/usr/bin/env bash
# Compose smoke test for realm BricoMission (feature keycloak-realm-roles).
# Needs the stack running (./init.sh or docker compose up -d --build --wait).
# Checks, in order:
#   S3  password grants on bricomission-dev-cli give each seeded account exactly its role
#       and aud bricomission-api;
#   S5  the API enforces roles with real Keycloak tokens (/admin/ping, /me);
#   S6  Keycloak SMTP delivers to Mailpit (send-verify-email via the master bootstrap admin);
#   S7  browser login (Authorization Code + PKCE, driven with curl) asks for an email code
#       after the password, rejects a wrong code, and redirects with code= for the right one.
# Prints [ok]/[fail] per check; exits 0 only if every check passes.
# Side effects: deletes Mailpit messages addressed to the homeowner, leaves one login session.
# Honours COMPOSE_PROJECT_NAME; passwords come from the same env vars and defaults as compose.yaml.
set -euo pipefail

cd "$(dirname "$0")/.."

REALM=BricoMission
CLIENT=bricomission-dev-cli
REDIRECT_URI=http://localhost/dev-callback
HOMEOWNER_EMAIL=homeowner@bricomission.local
KC_ADMIN_USER=${KEYCLOAK_ADMIN_USERNAME:-admin}
KC_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-bricomission-kc-admin}
ADMIN_PW=${BM_SEED_ADMIN_PASSWORD:-bm-admin-dev}
HOMEOWNER_PW=${BM_SEED_HOMEOWNER_PASSWORD:-bm-homeowner-dev}
PROFESSIONAL_PW=${BM_SEED_PROFESSIONAL_PASSWORD:-bm-professional-dev}

host_port() {
  local port
  port=$(docker compose port "$1" "$2" 2>/dev/null | tail -n1 | awk -F: '{print $NF}')
  if [ -z "$port" ]; then
    echo "ERROR: service '$1' has no published port $2. Is the stack up? (./init.sh)" >&2
    exit 1
  fi
  printf '%s' "$port"
}
KC="http://localhost:$(host_port keycloak 8080)"
API="http://127.0.0.1:$(host_port api 3000)"
MAILPIT="http://127.0.0.1:$(host_port mailpit 8025)"
ISSUER="$KC/realms/$REALM"
OIDC="$ISSUER/protocol/openid-connect"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

failures=0
ok() { printf '  [ok]   %s\n' "$1"; }
fail() { printf '  [fail] %s\n' "$1"; failures=$((failures + 1)); }
expect() { # expect <label> <actual> <expected>
  if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (got '$2', expected '$3')"; fi
}

# json <python expression over `d`>  (reads JSON from stdin; prints '' on any error)
json() { python3 -c "import json,sys
try:
    d=json.load(sys.stdin); v=$1
    print('' if v is None else v)
except Exception:
    print('')"; }

# claims <jwt> <python expression over `c`> (decodes the JWT payload without verifying it)
claims() { printf '%s' "$1" | python3 -c "import base64,json,sys
try:
    p=sys.stdin.read().split('.')[1]; c=json.loads(base64.urlsafe_b64decode(p+'='*(-len(p)%4))); print($2)
except Exception:
    print('')"; }

password_token() { # password_token <username> <password>
  curl -s --max-time 10 -d grant_type=password -d "client_id=$CLIENT" -d scope=openid \
    --data-urlencode "username=$1" --data-urlencode "password=$2" "$OIDC/token" | json "d['access_token']"
}

http_status() { # http_status <url> [token]
  if [ -n "${2:-}" ]; then
    curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Authorization: Bearer $2" "$1"
  else
    curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1"
  fi
}

mailpit_clear() {
  curl -s -o /dev/null --max-time 10 -X DELETE "$MAILPIT/api/v1/search?query=to:$HOMEOWNER_EMAIL"
}

# mailpit_wait <python condition over message summary `m`>: prints the first matching id within 10 s
mailpit_wait() {
  local id="" i
  for i in $(seq 1 20); do
    id=$(curl -s --max-time 5 "$MAILPIT/api/v1/search?query=to:$HOMEOWNER_EMAIL" |
      json "next((m['ID'] for m in d.get('messages', []) if $1), None)")
    [ -n "$id" ] && break
    sleep 0.5
  done
  printf '%s' "$id"
}

echo "Keycloak smoke: $ISSUER  (api $API, mailpit $MAILPIT)"

echo "S3 seeded accounts get role tokens:"
declare -A TOKENS
for entry in "bm-admin:admin:$ADMIN_PW" "bm-homeowner:user:$HOMEOWNER_PW" "bm-professional:professional:$PROFESSIONAL_PW"; do
  user=${entry%%:*}; rest=${entry#*:}; role=${rest%%:*}; pw=${rest#*:}
  token=$(password_token "$user" "$pw")
  TOKENS[$user]=$token
  if [ -z "$token" ]; then
    fail "$user password grant returned no access token"
    continue
  fi
  roles=$(claims "$token" "','.join(sorted(r for r in c['realm_access']['roles'] if r in ('user','professional','admin')))")
  expect "$user realm roles (BricoMission roles only) = $role" "$roles" "$role"
  aud=$(claims "$token" "'yes' if 'bricomission-api' in (c['aud'] if isinstance(c['aud'], list) else [c['aud']]) else 'no'")
  expect "$user aud contains bricomission-api" "$aud" "yes"
  iss=$(claims "$token" "c['iss']")
  expect "$user iss" "$iss" "$ISSUER"
done

echo "S5 API role enforcement with real Keycloak tokens:"
expect "/admin/ping without token -> 401" "$(http_status "$API/admin/ping")" 401
expect "/admin/ping homeowner -> 403" "$(http_status "$API/admin/ping" "${TOKENS[bm-homeowner]}")" 403
expect "/admin/ping professional -> 403" "$(http_status "$API/admin/ping" "${TOKENS[bm-professional]}")" 403
expect "/admin/ping admin -> 200" "$(http_status "$API/admin/ping" "${TOKENS[bm-admin]}")" 200
me=$(curl -s --max-time 10 -H "Authorization: Bearer ${TOKENS[bm-homeowner]}" "$API/me")
expect "/me homeowner -> username bm-homeowner" "$(printf '%s' "$me" | json "d['username']")" bm-homeowner
expect "/me homeowner -> roles [user]" "$(printf '%s' "$me" | json "','.join(d['roles'])")" user

echo "S6 SMTP goes to Mailpit:"
mailpit_clear
master_token=$(curl -s --max-time 10 -d grant_type=password -d client_id=admin-cli \
  --data-urlencode "username=$KC_ADMIN_USER" --data-urlencode "password=$KC_ADMIN_PASSWORD" \
  "$KC/realms/master/protocol/openid-connect/token" | json "d['access_token']")
homeowner_id=$(curl -s --max-time 10 -H "Authorization: Bearer $master_token" \
  "$KC/admin/realms/$REALM/users?username=bm-homeowner&exact=true" | json "d[0]['id']")
if [ -z "$master_token" ] || [ -z "$homeowner_id" ]; then
  fail "master admin token / bm-homeowner id lookup"
else
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X PUT -H "Authorization: Bearer $master_token" \
    "$KC/admin/realms/$REALM/users/$homeowner_id/send-verify-email")
  expect "send-verify-email -> 204" "$status" 204
  msg_id=$(mailpit_wait "m['From']['Address'] == 'noreply@bricomission.local'")
  if [ -n "$msg_id" ]; then
    subject=$(curl -s --max-time 5 "$MAILPIT/api/v1/message/$msg_id" | json "d['Subject']")
    ok "Mailpit received verify email from noreply@bricomission.local (id $msg_id, subject '$subject')"
  else
    fail "Mailpit received no message from noreply@bricomission.local within 10 s"
  fi
fi

echo "S7 browser login requires the email code:"
mailpit_clear
jar="$WORK/cookies.txt"
read -r verifier challenge < <(python3 -c "import base64,hashlib,secrets
v=secrets.token_urlsafe(48); c=base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).rstrip(b'=').decode(); print(v, c)")
state=$(python3 -c "import secrets; print(secrets.token_hex(8))")
# form_action <html file> <form id>: prints the unescaped action URL of that form
form_action() { python3 - "$1" "$2" <<'PY'
import html, re, sys
page = open(sys.argv[1], encoding="utf-8", errors="replace").read()
m = re.search(r'<form[^>]*id="%s"[^>]*>' % re.escape(sys.argv[2]), page)
a = re.search(r'action="([^"]+)"', m.group(0)) if m else None
print(html.unescape(a.group(1)) if a else "")
PY
}
curl -s --max-time 10 -c "$jar" -b "$jar" -o "$WORK/login.html" -G "$OIDC/auth" \
  --data-urlencode "client_id=$CLIENT" --data-urlencode response_type=code --data-urlencode scope=openid \
  --data-urlencode "redirect_uri=$REDIRECT_URI" --data-urlencode "state=$state" \
  --data-urlencode "code_challenge=$challenge" --data-urlencode code_challenge_method=S256
login_action=$(form_action "$WORK/login.html" kc-form-login)
if [ -z "$login_action" ]; then
  fail "login page with form kc-form-login"
else
  ok "login page served (password form)"
  pw_status=$(curl -s --max-time 15 -c "$jar" -b "$jar" -o "$WORK/otp.html" -w '%{http_code}' \
    --data-urlencode username=bm-homeowner --data-urlencode "password=$HOMEOWNER_PW" --data-urlencode credentialId= \
    "$login_action")
  otp_action=$(form_action "$WORK/otp.html" kc-otp-login-form)
  if [ "$pw_status" = 200 ] && [ -n "$otp_action" ] && grep -q 'name="emailCode"' "$WORK/otp.html"; then
    ok "password accepted -> email code form instead of a redirect (HTTP $pw_status)"
  else
    fail "expected the email code form after the password (HTTP $pw_status)"
  fi
  # Code email of the bricomission email theme (en: bm-homeowner has no stored locale).
  code_msg=$(mailpit_wait "m['Subject'] == 'Your BricoMission code'")
  otp=""
  if [ -n "$code_msg" ]; then
    otp=$(curl -s --max-time 5 "$MAILPIT/api/v1/message/$code_msg" |
      json "__import__('re').search(r'^(\d{6})\s*$', d['Text'], __import__('re').M).group(1)")
  fi
  if [ -n "$otp" ]; then
    ok "Mailpit received the login code email (id $code_msg, ${#otp} digits)"
  else
    fail "no login code email in Mailpit within 10 s"
  fi
  if [ -n "$otp_action" ] && [ -n "$otp" ]; then
    wrong=$(python3 -c "import sys; c=sys.argv[1]; print(''.join(str((int(x)+1)%10) for x in c))" "$otp")
    wrong_status=$(curl -s --max-time 15 -c "$jar" -b "$jar" -o "$WORK/wrong.html" -w '%{http_code}' \
      --data-urlencode "emailCode=$wrong" --data-urlencode login=Sign-in "$otp_action")
    otp_action=$(form_action "$WORK/wrong.html" kc-otp-login-form)
    if [ "$wrong_status" != 302 ] && [ -n "$otp_action" ]; then
      ok "wrong code does not redirect (HTTP $wrong_status, code form shown again)"
    else
      fail "wrong code: expected the code form again, got HTTP $wrong_status"
    fi
    location=$(curl -s --max-time 15 -c "$jar" -b "$jar" -o /dev/null -w '%{redirect_url}' \
      --data-urlencode "emailCode=$otp" --data-urlencode login=Sign-in "$otp_action")
    auth_code=$(python3 -c "import sys, urllib.parse as u
p=u.urlparse(sys.argv[1]); q=u.parse_qs(p.query)
ok=f'{p.scheme}://{p.netloc}{p.path}'==sys.argv[2] and q.get('state',[''])[0]==sys.argv[3]
print(q['code'][0] if ok and 'code' in q else '')" "$location" "$REDIRECT_URI" "$state")
    if [ -n "$auth_code" ]; then
      ok "right code -> 302 to $REDIRECT_URI with code="
      token=$(curl -s --max-time 10 -d grant_type=authorization_code -d "client_id=$CLIENT" \
        --data-urlencode "code=$auth_code" --data-urlencode "redirect_uri=$REDIRECT_URI" \
        --data-urlencode "code_verifier=$verifier" "$OIDC/token" | json "d['access_token']")
      roles=$(claims "$token" "','.join(sorted(r for r in c['realm_access']['roles'] if r in ('user','professional','admin')))")
      expect "code exchange (PKCE) -> token with role user" "$roles" user
    else
      fail "right code did not redirect to $REDIRECT_URI with code= (location '$location')"
    fi
  fi
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "Keycloak smoke: all checks passed."
  exit 0
fi
echo "Keycloak smoke: $failures check(s) failed." >&2
exit 1
