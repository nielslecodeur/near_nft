#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/.cache/everkeep-target"
mkdir -p artifacts
for contract in wallet demo-token strategy collection test-receiver missions keepers agents agents-v2 agent-market; do
  cargo near build non-reproducible-wasm --locked --no-abi \
    --manifest-path "contracts/$contract/Cargo.toml" --out-dir artifacts
done
