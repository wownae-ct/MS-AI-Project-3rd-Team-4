"""Langfuse Cloud "MerryMap" 대시보드 + 위젯 전체 정의를 JSON으로 백업한다.

이 대시보드는 Langfuse Cloud 프로젝트에만 존재하는 상태다 — Langfuse 자체 템플릿(preset)이
이 프로젝트에 맞는 게 없어서 Dashboard/Widget API로 직접 만들었다(2026-08-24-langfuse-
tracing-completion.md). 프로젝트가 실수로 삭제되거나 초기화돼도 정의를 복원할 수 있게 이
레포에도 스냅샷을 남겨둔다.

- `backup_dashboard()`: 읽기 전용. 지금 라이브 상태를 `langfuse_dashboard_backup.json`으로 덮어쓴다.
- `restore_dashboard()`: 백업 JSON을 읽어 대시보드+위젯을 재생성한다. 같은 이름의 대시보드가
  이미 있으면 중복 생성을 막기 위해 즉시 에러를 낸다(수동으로 지우거나 이름을 바꾼 뒤 재실행).

사용법: `uv run python -m scripts.backup_langfuse_dashboard` (기본 동작 = 백업).
"""

import json
from pathlib import Path

from langfuse import Langfuse
from langfuse.api.unstable.dashboard_widgets.types import (
    DashboardWidgetChartType,
    DashboardWidgetDimension,
    DashboardWidgetFilter,
    DashboardWidgetMetric,
    DashboardWidgetMetricAggregation,
    DashboardWidgetView,
)
from langfuse.api.unstable.dashboards.types import CreateDashboardPlacementRequest_Widget

from app.core.config import get_settings

_OUTPUT_PATH = Path(__file__).parent / "langfuse_dashboard_backup.json"
_DASHBOARD_NAME = "MerryMap"


def _client() -> Langfuse:
    settings = get_settings()
    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        raise SystemExit("LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY가 .env에 없습니다.")
    return Langfuse(
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key,
        host=settings.langfuse_host,
    )


def backup_dashboard(dashboard_name: str = _DASHBOARD_NAME) -> None:
    client = _client()
    target = next(
        (d for d in client.api.unstable.dashboards.list().data if d.name == dashboard_name), None
    )
    if target is None:
        raise SystemExit(f"대시보드 '{dashboard_name}'를 못 찾음")

    dashboard = client.api.unstable.dashboards.get(dashboard_id=target.id)
    widgets = []
    for placement in dashboard.definition.widgets:
        widget = client.api.unstable.dashboard_widgets.get(widget_id=placement.widget_id)
        widgets.append(
            {
                "placement": {
                    "x": placement.x,
                    "y": placement.y,
                    "width": placement.width,
                    "height": placement.height,
                },
                # id/createdAt/updatedAt은 재생성 시 Langfuse가 새로 발급하므로 백업에서 뺀다 —
                # 그대로 남기면 restore_dashboard()가 헷갈릴 수 있다.
                "widget": widget.dict(exclude={"id", "created_at", "updated_at"}),
            }
        )

    snapshot = {
        "dashboard": {"name": dashboard.name, "description": dashboard.description},
        "widgets": widgets,
    }
    _OUTPUT_PATH.write_text(
        json.dumps(snapshot, indent=2, ensure_ascii=False, default=str), encoding="utf-8"
    )
    print(f"백업 완료: {_OUTPUT_PATH} ({len(widgets)}개 위젯)")


def restore_dashboard(snapshot_path: Path = _OUTPUT_PATH) -> None:
    client = _client()
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    dashboard_name = snapshot["dashboard"]["name"]

    existing = next(
        (d for d in client.api.unstable.dashboards.list().data if d.name == dashboard_name), None
    )
    if existing is not None:
        raise SystemExit(
            f"대시보드 '{dashboard_name}'가 이미 있음(id={existing.id}) — 중복 생성 방지를 위해 "
            "중단. 정말 다시 만들려면 기존 대시보드를 먼저 지우거나 이름을 바꾸세요."
        )

    dashboard = client.api.unstable.dashboards.create(
        name=dashboard_name, description=snapshot["dashboard"]["description"]
    )
    for entry in snapshot["widgets"]:
        w = entry["widget"]
        widget = client.api.unstable.dashboard_widgets.create(
            name=w["name"],
            description=w.get("description"),
            view=DashboardWidgetView(w["view"]),
            dimensions=[DashboardWidgetDimension(field=d["field"]) for d in w["dimensions"]],
            metrics=[
                DashboardWidgetMetric(
                    measure=m["measure"], agg=DashboardWidgetMetricAggregation(m["agg"])
                )
                for m in w["metrics"]
            ],
            filters=[
                DashboardWidgetFilter(
                    column=f["column"], operator=f["operator"], type=f["type"], value=f.get("value")
                )
                for f in w["filters"]
            ],
            chart_type=DashboardWidgetChartType(w["chartType"]),
        )
        p = entry["placement"]
        client.api.unstable.dashboards.add_placement(
            dashboard_id=dashboard.id,
            request=CreateDashboardPlacementRequest_Widget(
                widget_id=widget.id, x=p["x"], y=p["y"], width=p["width"], height=p["height"]
            ),
        )
    print(f"복원 완료: '{dashboard_name}' ({len(snapshot['widgets'])}개 위젯)")


if __name__ == "__main__":
    backup_dashboard()
