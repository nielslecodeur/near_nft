#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
command -v node >/dev/null
command -v cargo >/dev/null
rustup target add wasm32-unknown-unknown
if ! cargo near --version >/dev/null 2>&1; then
  tools="$HOME/.cache/everkeep-tools"
  mkdir -p "$tools" "$HOME/.local/bin"
  url=https://github.com/near/cargo-near/releases/download/cargo-near-v0.22.0/cargo-near-x86_64-unknown-linux-gnu.tar.gz
  curl -fsSL "$url" -o "$tools/cargo-near.tgz"
  tar -xzf "$tools/cargo-near.tgz" -C "$tools"
  found=$(find "$tools" -type f -name cargo-near -print -quit)
  cp "$found" "$HOME/.local/bin/cargo-near"
fi
destination="$HOME/.near/sandbox"
mkdir -p "$destination"
if [ ! -x "$destination/near-sandbox" ]; then
  curl -fsSL https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/Linux-x86_64/2.14.0/near-sandbox.tar.gz -o "$destination/sandbox.tar.gz"
  tar -xzf "$destination/sandbox.tar.gz" -C "$destination"
  cp "$destination/Linux-x86_64/near-sandbox" "$destination/near-sandbox"
fi
"$destination/near-sandbox" --version
npm ci --ignore-scripts
