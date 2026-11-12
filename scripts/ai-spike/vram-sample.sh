#!/usr/bin/env bash
# Sample amdgpu VRAM usage (read-only sysfs, no root). Feature local-ai-gpu-spike.
# Usage: scripts/ai-spike/vram-sample.sh <label> <seconds|pidfile>
#   <seconds>  sample for that many seconds
#   <pidfile>  sample until the PID written in that file exits
# Samples mem_info_vram_used every 0.5 s on the amdgpu card with the largest VRAM.
# Baseline = first sample, or VRAM_BASELINE_MIB if set (e.g. the desktop-only value).
set -euo pipefail

label="${1:?usage: vram-sample.sh <label> <seconds|pidfile>}"
until_arg="${2:?usage: vram-sample.sh <label> <seconds|pidfile>}"

card="" best=0
for f in /sys/class/drm/card*/device/mem_info_vram_total; do
  [ -r "$f" ] || continue
  t=$(cat "$f")
  if [ "$t" -gt "$best" ]; then best=$t; card=$(dirname "$f"); fi
done
[ -n "$card" ] || { echo "ERROR: no amdgpu card with mem_info_vram_total" >&2; exit 1; }

mib() { echo $(( $(cat "$card/mem_info_vram_used") / 1048576 )); }

first=$(mib)
baseline="${VRAM_BASELINE_MIB:-$first}"
peak=$first
n=0
if [[ "$until_arg" =~ ^[0-9]+$ ]]; then
  end=$(( $(date +%s%N) + until_arg * 1000000000 ))
  while [ "$(date +%s%N)" -lt "$end" ]; do
    v=$(mib); [ "$v" -gt "$peak" ] && peak=$v; n=$((n + 1)); sleep 0.5
  done
else
  pid=$(cat "$until_arg")
  while kill -0 "$pid" 2>/dev/null; do
    v=$(mib); [ "$v" -gt "$peak" ] && peak=$v; n=$((n + 1)); sleep 0.5
  done
fi
last=$(mib)
total=$(( best / 1048576 ))
printf 'vram[%s] card=%s total=%dMiB samples=%d baseline=%dMiB peak=%dMiB peak_over_baseline=%dMiB last=%dMiB\n' \
  "$label" "$(basename "$(dirname "$card")")" "$total" "$n" "$baseline" "$peak" $((peak - baseline)) "$last"
