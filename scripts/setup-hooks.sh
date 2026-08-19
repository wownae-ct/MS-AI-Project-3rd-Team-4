#!/usr/bin/env bash
# .githooks/의 git hook을 활성화한다(각자 로컬에서 최초 1회 실행).
# git hook은 커밋으로 자동 설치되지 않음 — core.hooksPath를 .githooks로 돌려놔야 실제로 동작한다.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"

# .githooks가 없으면(= sparse-checkout 패턴에서 빠진 경우) 원인을 명시하고 멈춘다.
# 예전에는 여기서 chmod가 곧바로 실패해 core.hooksPath 설정 줄까지 도달하지 못했고,
# 훅이 설치되지 않은 사실이 드러나지 않았다.
if [ ! -d "$REPO_ROOT/.githooks" ]; then
  echo "error: $REPO_ROOT/.githooks 가 없습니다." >&2
  echo "  sparse-checkout에서 제외되었을 수 있습니다. ./scripts/setup-sparse-checkout.sh backend|frontend 를 다시 실행하세요." >&2
  exit 1
fi

# 실행 권한은 커밋에 100755로 들어 있지만, core.fileMode=false 환경 등에서 누락될 수 있어 한 번 더 보장한다.
chmod +x "$REPO_ROOT/.githooks/"*
git config core.hooksPath .githooks
echo "core.hooksPath = .githooks 로 설정 완료. pre-commit 훅이 이제 로컬 커밋마다 실행됩니다."
