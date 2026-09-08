#!/usr/bin/env bash
# Reinstalls the packaged extension into your real (non-debug) VS Code, so you can verify
# a fix against your actual installed extensions instead of just the Extension Development Host.
set -euo pipefail

cd "$(dirname "$0")/.."

PUBLISHER=$(node -p "require('./package.json').publisher")
NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
VSIX="$NAME-$VERSION.vsix"

code --uninstall-extension "$PUBLISHER.$NAME" || true
npx vsce package
code --install-extension "$VSIX"
rm "$VSIX"

echo "Reinstalled $PUBLISHER.$NAME@$VERSION — fully quit and relaunch VS Code (Cmd+Q) to pick up the change."
