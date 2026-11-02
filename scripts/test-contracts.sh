#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/.cache/everkeep-target"
cargo test --locked --workspace --lib
