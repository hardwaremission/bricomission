#!/usr/bin/env bash
# Host prerequisite installer and checker for BricoMission (CachyOS/Arch, pacman).
#
# Usage: install-host-prereqs.sh [--check | --help]
#
#   (no args)  Install mode. Run by the DEVELOPER in their own terminal; calls sudo.
#              Installs docker, docker-compose (v2 plugin) and docker-buildx with
#              `pacman -S --needed`, enables docker.service and adds the user to the
#              docker group. Idempotent: a second run changes nothing.
#   --check    Read-only. Never calls sudo, never changes the system. Agents may run it.
#              Exit 0 only if every item is ok.
#   --help     Print this usage.
#
# Optional (not scripted, not required): to keep images and volumes off the system
# disk, mount a data NVMe and set "data-root" in /etc/docker/daemon.json BEFORE the
# first image pull, then restart docker. See docs/technical-discovery.md.
set -euo pipefail

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
}

target_user() {
  echo "${SUDO_USER:-${USER:-$(id -un)}}"
}

# --- check mode (read-only, no sudo) -----------------------------------------

check_failed=0
pending_relogin=0
report() {
  # report <ok|missing> <name> [detail]
  local state="$1" name="$2" detail="${3:-}"
  if [ "$state" = ok ]; then
    printf '  [ok]      %-30s %s\n' "$name" "$detail"
  else
    printf '  [missing] %-30s %s\n' "$name" "$detail"
    check_failed=$((check_failed + 1))
  fi
}

run_check() {
  local user
  user="$(target_user)"
  check_failed=0
  pending_relogin=0
  echo "Host prerequisites (read-only check, user: $user):"

  if command -v pacman >/dev/null 2>&1; then
    report ok "pacman" "$(command -v pacman)"
  else
    report missing "pacman" "(unsupported host for the installer)"
  fi

  if command -v docker >/dev/null 2>&1; then
    report ok "docker" "$(docker --version 2>/dev/null | head -n1)"
  else
    report missing "docker"
  fi

  local v
  if command -v docker >/dev/null 2>&1 && v=$(docker compose version 2>/dev/null); then
    report ok "docker compose v2" "$(echo "$v" | head -n1)"
  else
    report missing "docker compose v2"
  fi

  if command -v docker >/dev/null 2>&1 && v=$(docker buildx version 2>/dev/null); then
    report ok "docker buildx" "$(echo "$v" | head -n1)"
  else
    report missing "docker buildx"
  fi

  if command -v systemctl >/dev/null 2>&1 && systemctl is-enabled --quiet docker.service 2>/dev/null; then
    report ok "docker.service enabled"
  else
    report missing "docker.service enabled"
  fi

  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet docker.service 2>/dev/null; then
    report ok "docker.service active"
  else
    report missing "docker.service active"
  fi

  local members
  members="$(getent group docker 2>/dev/null | cut -d: -f4 || true)"
  if getent group docker >/dev/null 2>&1 && echo ",$members," | grep -q ",$user,"; then
    report ok "user in docker group" "$user"
  else
    report missing "user in docker group" "$user"
  fi

  if id -nG 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
    report ok "docker group active in session"
  else
    report missing "docker group active in session" "(log out/in or run: newgrp docker)"
    pending_relogin=1
  fi

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    report ok "docker daemon reachable"
  else
    report missing "docker daemon reachable"
    pending_relogin=1
  fi

  if [ "$check_failed" -eq 0 ]; then
    echo "All host prerequisites are ok."
    return 0
  fi
  echo "$check_failed item(s) missing."
  return 1
}

# --- install mode (developer only, uses sudo) ---------------------------------

run_install() {
  if ! command -v pacman >/dev/null 2>&1; then
    echo "unsupported: this helper only supports pacman-based hosts (Arch/CachyOS)" >&2
    exit 1
  fi

  if [ "$(id -u)" -eq 0 ] && [ -z "${SUDO_USER:-}" ]; then
    echo "refusing to run as root without SUDO_USER: run this script as your normal user (it calls sudo itself)" >&2
    exit 1
  fi

  local user
  user="$(target_user)"

  echo "Planned actions (each step is skipped by the tool when already done):"
  echo "  1. sudo pacman -S --needed docker docker-compose docker-buildx"
  echo "  2. sudo systemctl enable --now docker.service"
  echo "  3. sudo usermod -aG docker $user   (only if not already a member)"
  echo

  sudo pacman -S --needed docker docker-compose docker-buildx
  sudo systemctl enable --now docker.service

  local members
  members="$(getent group docker 2>/dev/null | cut -d: -f4 || true)"
  if echo ",$members," | grep -q ",$user,"; then
    echo "User $user is already in the docker group: nothing to do."
  else
    sudo usermod -aG docker "$user"
    echo "Added $user to the docker group."
  fi

  echo
  echo "Notes:"
  echo "  a) Log out and back in (or run 'newgrp docker') for the docker group to take effect."
  echo "  b) Membership in the docker group is root-equivalent on this host."
  echo "  c) If pacman failed on a stale package database, run 'sudo pacman -Syu' first (no partial upgrades)."
  echo

  if run_check; then
    exit 0
  fi
  if [ "$pending_relogin" -eq 1 ]; then
    echo "Some items are pending re-login: log out/in (or 'newgrp docker'), then run: $0 --check"
  fi
  exit 1
}

case "${1:-}" in
  --check) run_check; exit $? ;;
  --help|-h) usage; exit 0 ;;
  "") run_install ;;
  *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
esac
