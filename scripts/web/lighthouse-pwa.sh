#!/usr/bin/env bash
# Lighthouse PWA installability check for apps/web (Home, Accept-Language: en).
# Runs lighthouse 11.7.1 (apps/web devDependency; the last major with the PWA category and
# the `installable-manifest` audit) inside the pinned Playwright image (compose service
# web-e2e) with that image's Chromium. Report: apps/web/test-results/lighthouse/report.json.
# Exit 0 only when `installable-manifest` scores 1. The CDP check
# (Page.getInstallabilityErrors == [], e2e/pwa.spec.ts) is the fallback evidence if
# Lighthouse 11 cannot drive the pinned Chromium; report that instead of changing the rule.
# Prerequisite: the stack is up (./init.sh).
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! port=$(docker compose port web 3000 2>/dev/null | awk -F: '{print $NF}') || [ -z "$port" ]; then
  echo "ERROR: compose service 'web' is not running; start the stack with ./init.sh" >&2
  exit 1
fi
if [ ! -x apps/web/node_modules/.bin/lighthouse ]; then
  echo "ERROR: apps/web dependencies missing; run pnpm install --frozen-lockfile" >&2
  exit 1
fi
url="http://localhost:${port}/"
echo "Lighthouse PWA against ${url}"
mkdir -p apps/web/test-results/lighthouse

docker compose --profile e2e run --rm --user "$(id -u):$(id -g)" \
  -e CHROME_PATH=/ms-playwright/chromium-1254/chrome-linux64/chrome \
  web-e2e sh -c '
    set -e
    ./node_modules/.bin/lighthouse "$1" \
      --only-categories=pwa \
      --chrome-flags="--headless=new --no-sandbox" \
      --extra-headers="{\"Accept-Language\":\"en\"}" \
      --output=json --output-path=test-results/lighthouse/report.json \
      --quiet
    node -e "
      const r = require(\"./test-results/lighthouse/report.json\");
      const a = r.audits[\"installable-manifest\"];
      console.log(\"lighthouse \" + r.lighthouseVersion + \" on \" + r.environment.hostUserAgent);
      console.log(\"installable-manifest: score=\" + a.score + (a.explanation ? \" (\" + a.explanation + \")\" : \"\"));
      for (const item of (a.details && a.details.items) || []) console.log(\"  - \" + JSON.stringify(item));
      if (r.runtimeError) console.log(\"runtimeError: \" + JSON.stringify(r.runtimeError));
      process.exit(a.score === 1 ? 0 : 1);
    "
  ' sh "$url"
