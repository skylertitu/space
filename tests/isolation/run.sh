#!/usr/bin/env bash
# Corre la suite de aislamiento contra el emulador de Firestore (nunca producción).
# Requiere Java (JRE en ~/tools). Se ejecuta desde un directorio temporal para NO cargar .env.local.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="$HOME/tools/jdk-21.0.12.1+1-jre/bin:$PATH"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$ROOT"
firebase emulators:exec --only firestore --project demo-roosevelt-test \
  "cd '$TMP' && ROOT_DIR='$ROOT' '$ROOT/node_modules/.bin/tsx' --tsconfig '$ROOT/tsconfig.json' '$ROOT/tests/isolation/run.ts'"
