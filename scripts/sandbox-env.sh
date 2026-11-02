#!/usr/bin/env bash
# Only the sandbox child uses this compatibility shim; no system clock is changed.
if [ -z "${EVERKEEP_SANDBOX_CLOCK_LIBRARY:-}" ]; then
  if [ "${EVERKEEP_STABLE_CLOCK:-auto}" = 1 ] || { [ "${EVERKEEP_STABLE_CLOCK:-auto}" = auto ] && uname -r | grep -qi microsoft; }; then
    cache="$HOME/.cache/everkeep-runtime"
    mkdir -p "$cache"
    cc -O2 -shared -fPIC -pthread scripts/support/stable-clock.c -o "$cache/stable-clock.so"
    export EVERKEEP_SANDBOX_CLOCK_LIBRARY="$cache/stable-clock.so"
  fi
fi
