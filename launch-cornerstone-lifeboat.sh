#!/usr/bin/env bash
set -euo pipefail

cd /home/josh/cornerstone-lifeboat
unset ELECTRON_RUN_AS_NODE
exec "/home/josh/cornerstone-lifeboat/dist/Cornerstone Lifeboat-0.4.0.AppImage"
