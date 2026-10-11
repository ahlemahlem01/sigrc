#!/usr/bin/env bash
# Loads the local development settings (.env.local) into the current shell. Usage: source scripts/dev-env.sh
set -a
. "$(dirname "${BASH_SOURCE[0]}")/../.env.local"
set +a
