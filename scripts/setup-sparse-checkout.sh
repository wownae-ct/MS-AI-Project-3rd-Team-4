#!/usr/bin/env bash
# 로컬 워크트리에서 자신이 담당하는 폴더만 체크아웃하도록 sparse-checkout을 설정한다.
# 사용법: ./scripts/setup-sparse-checkout.sh backend|frontend
set -euo pipefail

ROLE="${1:-}"

# .githooks는 역할과 무관하게 항상 포함한다. 빠지면 sparse-checkout이 .githooks/를 워킹트리에서
# 지워버리고, setup-hooks.sh가 core.hooksPath를 설정하기 전에 실패해 pre-commit 훅이 조용히 비활성화된다.
COMMON=(.githooks .github docs)

case "$ROLE" in
  backend)
    PATHS=("${COMMON[@]}" backend ml db infra scripts)
    ;;
  frontend)
    PATHS=("${COMMON[@]}" frontend)
    ;;
  *)
    echo "usage: $0 backend|frontend" >&2
    exit 1
    ;;
esac

git sparse-checkout init --cone
git sparse-checkout set "${PATHS[@]}"
echo "sparse-checkout set to: ${PATHS[*]}"
