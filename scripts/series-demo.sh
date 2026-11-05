#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
source scripts/sandbox-env.sh
npx tsx scripts/series-demo.ts "$@"
