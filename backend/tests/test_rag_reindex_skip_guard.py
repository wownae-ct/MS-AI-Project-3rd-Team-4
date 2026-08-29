"""app/rag/corpus.py::compute_corpus_hash + app/rag/indexing.py::_should_skip_reindex —
2026-08-30 rag-reindex CronJob 스킵 가드 회귀 테스트. 코퍼스가 안 바뀐 날에도 매일 03시마다
임베딩 API를 다시 부르고 DB를 통째로 갈아끼우던 낭비를 없애기 위해 추가된 가드라, 이 가드
자체가 "진짜로 바뀐 것"과 "안 바뀐 것"을 정확히 구분하는지가 이 기능의 전부다."""

from pathlib import Path

from app.rag.corpus import compute_corpus_hash
from app.rag.indexing import _should_skip_reindex


def _write_json(directory: Path, name: str, content: str) -> None:
    (directory / name).write_text(content, encoding="utf-8")


class TestComputeCorpusHash:
    def test_same_content_produces_same_hash(self, tmp_path: Path) -> None:
        _write_json(tmp_path, "a.json", '{"dataset_code": "DS1"}')

        first = compute_corpus_hash(tmp_path)
        second = compute_corpus_hash(tmp_path)

        assert first == second

    def test_editing_a_file_changes_the_hash(self, tmp_path: Path) -> None:
        _write_json(tmp_path, "a.json", '{"dataset_code": "DS1"}')
        before = compute_corpus_hash(tmp_path)

        _write_json(tmp_path, "a.json", '{"dataset_code": "DS1", "extra": "field"}')
        after = compute_corpus_hash(tmp_path)

        assert before != after

    def test_adding_a_file_changes_the_hash(self, tmp_path: Path) -> None:
        _write_json(tmp_path, "a.json", '{"dataset_code": "DS1"}')
        before = compute_corpus_hash(tmp_path)

        _write_json(tmp_path, "b.json", '{"dataset_code": "DS2"}')
        after = compute_corpus_hash(tmp_path)

        assert before != after

    def test_renaming_a_file_with_same_content_changes_the_hash(self, tmp_path: Path) -> None:
        # 파일 경로도 해시에 들어가야 한다 — 내용은 같은데 이름만 바뀌는 것도 "코퍼스가
        # 바뀐 것"으로 잡아야 색인 결과의 rag_documents.title 등이 실제로 바뀌었을 때
        # 스킵 가드가 조용히 그 변경을 놓치지 않는다.
        _write_json(tmp_path, "a.json", '{"dataset_code": "DS1"}')
        before = compute_corpus_hash(tmp_path)
        (tmp_path / "a.json").unlink()

        _write_json(tmp_path, "z.json", '{"dataset_code": "DS1"}')
        after = compute_corpus_hash(tmp_path)

        assert before != after

    def test_dataset_subdirectory_layout_matches_flat_configmap_layout_when_same_files(
        self, tmp_path: Path
    ) -> None:
        # 로컬 저장소(2단계: DATASET_CODE/문서.json)와 K8s ConfigMap 마운트(1단계, 평평함)가
        # 서로 다른 디렉터리 구조라도, load_corpus가 실제로 찾는 파일 집합이 같다면 해시도
        # 같아야 한다 — 두 환경에서 스킵 가드 판단이 갈리면 안 되기 때문.
        flat_root = tmp_path / "flat"
        flat_root.mkdir()
        _write_json(flat_root, "doc.json", '{"dataset_code": "DS1"}')

        nested_root = tmp_path / "nested"
        (nested_root / "DS1_PRICE").mkdir(parents=True)
        _write_json(nested_root / "DS1_PRICE", "doc.json", '{"dataset_code": "DS1"}')

        assert compute_corpus_hash(flat_root) == compute_corpus_hash(nested_root)


class TestShouldSkipReindex:
    def test_skips_when_hash_matches_previous(self) -> None:
        assert _should_skip_reindex("abc123", "abc123") is True

    def test_does_not_skip_when_hash_differs(self) -> None:
        assert _should_skip_reindex("abc123", "def456") is False

    def test_does_not_skip_on_first_ever_run(self) -> None:
        # rag_index_state에 아직 아무 행도 없는 최초 실행 — previous_hash가 None이면
        # 무조건 색인을 진행해야 한다(스킵하면 DB가 영원히 빈 채로 남는다).
        assert _should_skip_reindex("abc123", None) is False
