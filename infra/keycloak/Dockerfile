# BricoMission Keycloak image: pinned upstream Keycloak plus one email-OTP provider.
# Keycloak 26.8.2 core ships no email-code login authenticator (probed 2026-11-13:
# no such AuthenticatorFactory in /opt/keycloak/lib/lib/main), so the browser flow
# uses mesutpiskin/keycloak-2fa-email-authenticator (Apache-2.0), provider id
# `email-authenticator-no-enrollment`. Source, license and checksum are recorded in
# docs/risks-and-open-questions.md.
#
# The jar is fetched in a RUN step (cached by instruction text, so offline rebuilds
# reuse the layer) with the Node image the API already pins, then verified with
# sha256sum -c before it reaches the Keycloak image.

FROM node:26.13.1-bookworm-slim AS fetch
ARG EMAIL_OTP_URL=https://github.com/mesutpiskin/keycloak-2fa-email-authenticator/releases/download/v26.7.2/keycloak-2fa-email-authenticator-v26.7.2-KC26.8.2.jar
ARG EMAIL_OTP_SHA256=0e3dd714f0f20e7a1cd26cbe721fc12bef3be64c4c0abb221d9521d5331061fc
WORKDIR /fetch
RUN node -e "fetch(process.argv[1]).then(async (r) => { if (!r.ok) throw new Error('HTTP ' + r.status); require('node:fs').writeFileSync('email-otp.jar', Buffer.from(await r.arrayBuffer())); })" "$EMAIL_OTP_URL" \
 && echo "${EMAIL_OTP_SHA256}  email-otp.jar" | sha256sum -c -

FROM quay.io/keycloak/keycloak:26.8.2
COPY --from=fetch --chown=1000:0 /fetch/email-otp.jar /opt/keycloak/providers/keycloak-2fa-email-authenticator.jar
# Pre-register the provider; start-dev re-augments for its dev profile on boot anyway.
# The h2 directory must exist (owned by the keycloak user) so a fresh named volume
# mounted there inherits writable ownership.
RUN /opt/keycloak/bin/kc.sh build \
 && mkdir -p /opt/keycloak/data/h2
