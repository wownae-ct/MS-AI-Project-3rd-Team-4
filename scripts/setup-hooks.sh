#!/usr/bin/env bash
# .githooks/의 git hook을 활성화한다(각자 로컬에서 최초 1회 실행).
# git hook은 커밋으로 자동 설치되지 않음 — core.hooksPath를 .githooks로 돌려놔야 실제로 동작한다.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
chmod +x "$REPO_ROOT/.githooks/"*
git config core.hooksPath .githooks
echo "core.hooksPath = .githooks 로 설정 완료. pre-commit 훅이 이제 로컬 커밋마다 실행됩니다."
