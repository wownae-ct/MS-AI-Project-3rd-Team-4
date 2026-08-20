"""LangGraph 오케스트레이션. 4-노드 그래프: extract_metrics -> coach_agent -> verify_agent
-> finalize, verify_agent에서 pass/retry(최대 2회)/degrade로 갈라지는 조건부 엣지.
노드 로직 자체는 LangGraph에 종속되지 않는 순수 함수로 작성한다(브리프코치_기술설계서.md §6)."""
