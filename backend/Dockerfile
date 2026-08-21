# uv 공식 Docker 가이드(docs.astral.sh/uv/guides/integration/docker) 패턴.
# 이전 버전의 문제 4가지를 한번에 정리한 것:
#   1) `uv pip install ... || true` — 의존성 설치가 실패해도 이미지가 만들어졌다.
#   2) uv.lock을 쓰지 않아 CI(`uv sync --locked`)와 이미지의 의존성 버전이 갈릴 수 있었다.
#   3) root로 실행했다.
# (예전엔 rag/가 app/ 밖의 별도 최상위 패키지라 COPY가 하나 더 필요했지만, 메리맵
#  피벗에서 app/rag/로 옮겨졌으므로 `COPY app ./app` 하나로 충분하다.)

FROM python:3.12-slim AS builder

# 버전 고정 — `:latest`는 빌드 재현성을 깨뜨린다.
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /uvx /bin/

# UV_COMPILE_BYTECODE: 미리 .pyc를 만들어 두면 런타임(비루트)이 쓰기를 시도하지 않는다.
# UV_LINK_MODE=copy: 캐시 마운트와 대상이 다른 파일시스템이라 하드링크가 안 된다.
# UV_PYTHON_DOWNLOADS=0: 베이스 이미지의 python3.12를 쓰고 따로 내려받지 않는다.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# ── 의존성 레이어 — 코드와 분리해서 코드만 바뀌면 이 레이어를 캐시에서 재사용한다.
# bind 마운트라 pyproject/uv.lock이 이 레이어에 남지 않는다.
# --locked: 락이 pyproject와 어긋나면 exit 1 (CI의 backend-ci.yml과 같은 플래그).
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-editable

# ── 프로젝트 레이어. 2차 sync는 프로젝트 자체를 빌드하므로 pyproject/uv.lock이
# bind 마운트가 아니라 "실제 파일"로 있어야 한다.
COPY pyproject.toml uv.lock ./
COPY app ./app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-editable

# ── 런타임 이미지 — 빌드 도구 없이 완성된 venv만 가져온다.
FROM python:3.12-slim

RUN useradd --system --uid 10001 appuser

COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# WORKDIR는 필수다 — CMD의 모듈 경로(app.main:app)가 CWD 기준으로 resolve된다.
# WORKDIR가 없으면 CWD가 /가 되어 venv의 site-packages에서 app 패키지를 못 찾는다.
WORKDIR /app

USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
