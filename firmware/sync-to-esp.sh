#!/usr/bin/env bash
# Copy the rocket renderer + app into the ESP-IDF project.
#
# The two trees lay the files out differently, so a plain `cp` breaks the
# build: this repo has renderer/ beside app/ and includes "../renderer/x.h",
# while the ESP project puts them under main/rocket_renderer/ and includes
# "rocket_renderer/x.h". Copying without rewriting that one line fails with
# a fatal "No such file or directory" on rocket_app.c. This script rewrites it.
#
# Run it after ANY change under firmware/renderer or firmware/app, then rebuild.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
DST="${1:-$HOME/esp/esp32-photoframe/main}"
[ -d "$DST/rocket_renderer" ] || { echo "not an esp32-photoframe main/: $DST" >&2; exit 1; }

cp "$SRC"/renderer/rocket_*.[ch] "$DST/rocket_renderer/"
cp "$SRC"/app/rocket_app.[ch]    "$DST/"
# the one path that differs between the trees
sed -i '' 's|#include "\.\./renderer/|#include "rocket_renderer/|' "$DST/rocket_app.c"

echo "synced -> $DST"
grep -n 'rocket_renderer/rocket_poster.h' "$DST/rocket_app.c" | sed 's/^/  include fixed: /'
