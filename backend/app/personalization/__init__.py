"""개인화 라우터 에이전트 — 웨딩 하나의 체크리스트/타임라인을 사용자 프로필에 맞춰 만든다.

app/rag와는 완전히 별개의 LangGraph다(route→generate→validate). 둘을 헷갈리지 말 것 —
이쪽은 온보딩 시점과 프로필 변경 시점에만 돌고, 검색 근거가 아니라 사용자 정보를 재료로 쓴다.

validate가 순수 코드라는 점이 이 그래프의 핵심이다. LLM 출력이 구조 규칙(카테고리 커버리지,
제목 중복 등)을 어기면 그 카테고리만 결정론적 카탈로그로 대체해, 한 카테고리의 실패가
나머지를 버리지 않게 한다.

이 패키지 밖에서 쓰는 진입점은 graph.build_personalization_graph 하나이고,
app/services/personalization.py가 그것을 감싸 DB 반영과 감사로그까지 맡는다."""
