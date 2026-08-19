#!/usr/bin/env bash
# 실행권한(git 인덱스 모드 100755) 검사기 — 로컬 훅과 CI가 같은 규칙을 쓰도록 한 곳에 모아둔다.
#
# 왜 필요한가:
#   워킹트리에서 chmod +x 를 해도 git 인덱스 모드가 100644면 커밋에는 실행권한이 들어가지 않는다.
#   더 고약한 건 머지다 — 2026-08-19 머지 커밋 d63a717은 add/add 충돌을 해결하면서 "내용"은
#   실행권한이 있던 쪽(origin/backend, b7febe4)을 채택했는데 "모드"는 반대쪽(100644)을 기록해,
#   b7febe4가 고쳐둔 scripts/deploy-infra.sh 실행권한이 조용히 되돌아갔다.
#   실행권한이 빠지면 (1) ./scripts/*.sh 가 Permission denied 로 죽고,
#   (2) .githooks/* 는 git이 아무 메시지 없이 건너뛰어 pre-commit 게이트 전체가 무력화된다.
#
# 사용법:
#   bash .githooks/check-exec-bits.sh            # 인덱스 전체 검사 (CI용)
#   bash .githooks/check-exec-bits.sh --staged   # 이번 커밋에 스테이징된 파일만 검사 (훅용)
#
# scripts/가 아니라 .githooks/에 두는 이유: setup-sparse-checkout.sh의 frontend 역할은
# scripts/를 체크아웃하지 않는다. .githooks/는 양쪽 역할 모두 받으므로(COMMON), 여기 둬야
# frontend 담당자 로컬에서도 훅이 이 검사기를 찾을 수 있다.
#
# --staged 만으로는 부족하다: 모드가 이미 잘못 커밋된 뒤에는 그 파일이 HEAD와 같아져
# diff에 안 잡히므로 영영 조용해진다(d63a717 이후가 정확히 그 상태였다).
# 이미 들어간 회귀를 잡는 건 CI의 전체 트리(--all) 검사 쪽이다.
#
# 종료코드: 0 통과 / 1 위반 발견
set -euo pipefail

MODE_SCOPE="all"
case "${1:-}" in
  --staged) MODE_SCOPE="staged" ;;
  ""|--all) MODE_SCOPE="all" ;;
  *) echo "usage: $0 [--staged|--all]" >&2; exit 2 ;;
esac

cd "$(git rev-parse --show-toplevel)"

# 검사 대상 경로 수집 (한글 파일명이 저장소에 있으므로 -z 로 NUL 구분 처리)
targets=()
if [ "$MODE_SCOPE" = "staged" ]; then
  while IFS= read -r -d '' f; do targets+=("$f"); done \
    < <(git diff --cached --name-only --diff-filter=ACMR -z)
else
  while IFS= read -r -d '' f; do targets+=("$f"); done \
    < <(git ls-files -z)
fi

if [ "${#targets[@]}" -eq 0 ]; then
  echo "check-exec-bits: 검사 대상 파일이 없습니다 (scope=$MODE_SCOPE)."
  exit 0
fi

missing=()   # 실행권한이 있어야 하는데 없는 파일
suspect=()   # 실행권한이 있는데 근거가 없는 파일 (경고만)

for f in "${targets[@]}"; do
  entry=$(git ls-files -s -- "$f")
  [ -n "$entry" ] || continue
  mode=${entry%% *}
  # 심볼릭 링크(120000)·서브모듈(160000)은 실행권한 개념이 없다
  case "$mode" in 100644|100755) ;; *) continue ;; esac

  # 실행 대상 판정: 셰뱅으로 시작하거나, .sh 확장자거나, .githooks/ 아래 훅 파일
  blob=$(git cat-file blob ":$f" 2>/dev/null | head -c 2 || true)
  want_exec=0
  [ "$blob" = "#!" ] && want_exec=1
  case "$f" in
    *.sh) want_exec=1 ;;
    .githooks/*) want_exec=1 ;;
  esac

  if [ "$want_exec" -eq 1 ] && [ "$mode" != "100755" ]; then
    missing+=("$f")
  elif [ "$want_exec" -eq 0 ] && [ "$mode" = "100755" ]; then
    suspect+=("$f")
  fi
done

for f in ${suspect[@]+"${suspect[@]}"}; do
  echo "경고: '$f' 에 실행권한(100755)이 있지만 셰뱅도 .sh도 아닙니다 — 의도한 것인지 확인하세요." >&2
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "오류: 다음 파일에 실행권한(git 인덱스 모드 100755)이 없습니다:" >&2
  for f in "${missing[@]}"; do echo "  - $f" >&2; done
  echo "" >&2
  echo "수정 방법 (워킹트리 chmod만으로는 커밋에 반영되지 않습니다):" >&2
  printf '  git update-index --chmod=+x' >&2
  for f in "${missing[@]}"; do printf ' %q' "$f" >&2; done
  echo "" >&2
  exit 1
fi

echo "check-exec-bits: 통과 — 검사 대상 ${#targets[@]}개 중 실행권한 누락 없음 (scope=$MODE_SCOPE)."
exit 0
