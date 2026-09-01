"""RAG 파이프라인 — 코퍼스를 색인하고, 질문에 답할 근거를 찾고, 답변을 만들어 검증한다.

indexing은 오프라인(rag-reindex CronJob이 하루 한 번), 나머지는 요청마다 도는 온라인 경로다:
retrieval이 벡터+키워드 하이브리드로 근거를 찾고, graph가 그것을 retrieve→generate→verify
LangGraph로 엮는다(근거가 약하면 검색어를 다시 써서 1회까지 되돌아간다).

이 패키지 밖에서 쓰는 진입점은 graph.build_graph 하나다 — app/services/chat.py가 그것만
가져다 SSE로 흘려보낸다."""
