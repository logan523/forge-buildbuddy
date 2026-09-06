#!/usr/bin/env bash
# Build the C renderer on the host and diff it against the frozen goldens.
#
# Same translation units the firmware links, so green here means green on the
# device: same code, same card bytes, same integers. Runs in seconds and needs
# no ESP-IDF -- the point of keeping the renderer free of ESP dependencies.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
KIT="$HERE/../../docs/rocket-poster-kit"
SDK="$(xcrun --show-sdk-path 2>/dev/null || echo /)"
BIN=/tmp/rocket_conformance
CARD=/tmp/rktcard

# -fsigned-char pins char signedness (signed on Xtensa and macOS-arm64,
# unsigned on Linux-arm64 -- a real CI divergence). -ffp-contract=off stops the
# host fusing a*b+c into an FMA that Xtensa has no instruction for.
clang -std=c11 -O2 -Wall -Wextra -Werror -fsigned-char -ffp-contract=off \
      -isysroot "$SDK" -o "$BIN" \
      "$HERE/conformance.c" "$HERE/../renderer/rocket_card.c" "$HERE/../renderer/rocket_render.c"

python3 "$KIT/bake_assets.py" --out "$CARD" --force >/dev/null
exec python3 "$HERE/check_conformance.py" "$CARD" "$BIN"
