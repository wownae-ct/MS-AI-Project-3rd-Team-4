#!/usr/bin/env bash
# 로컬 워크트리에서 자신이 담당하는 폴더만 체크아웃하도록 sparse-checkout을 설정한다.
# 사용법: ./scripts/setup-sparse-checkout.sh backend|frontend
set -euo pipefail

ROLE="${1:-}"

case "$ROLE" in
  backend)
    PATHS=(backend ml db infra scripts docs .github)
    ;;
  frontend)
    PATHS=(frontend docs .github)
    ;;
  *)
    echo "usage: $0 backend|frontend" >&2
    exit 1
    ;;
esac

git sparse-checkout init --cone
git sparse-checkout set "${PATHS[@]}"
echo "sparse-checkout set to: ${PATHS[*]}"
