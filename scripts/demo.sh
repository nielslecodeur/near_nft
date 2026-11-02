#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
export NEAR_SANDBOX_BINARY_PATH="${NEAR_SANDBOX_BINARY_PATH:-$HOME/.near/sandbox}"
export NEAR_SANDBOX_BIN_PATH="${NEAR_SANDBOX_BIN_PATH:-$NEAR_SANDBOX_BINARY_PATH/near-sandbox}"
export NEAR_NO_LOGS=1
source scripts/sandbox-env.sh
npm run demo
