from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.embeddings import EMBEDDING_BATCH_SIZE, embed_query, embed_texts


def _fake_client(response_factory):
    client = SimpleNamespace(
        embeddings=SimpleNamespace(create=AsyncMock(side_effect=response_factory))
    )
    return client


def _in_order_response(*, model, input):
    data = [SimpleNamespace(index=i, embedding=[float(i)]) for i in range(len(input))]
    return SimpleNamespace(data=data)


def _shuffled_response(*, model, input):
    # item.index는 정상적인 입력 순서를 갖지만, response.data 리스트 자체는 뒤섞어서 반환 —
    # 재정렬 로직(item.index 기준 sort)이 실제로 동작하는지 검증하려면 이렇게 섞어야 함.
    # 처음부터 정렬된 mock만 쓰면 재정렬 코드가 없어도(혹은 정렬 키가 틀려도) 테스트가 통과해버림.
    indices = list(reversed(range(len(input))))
    data = [SimpleNamespace(index=i, embedding=[float(i)]) for i in indices]
    return SimpleNamespace(data=data)


@pytest.mark.asyncio
async def test_embed_texts_empty_input_returns_empty_list_without_calling_api():
    client = _fake_client(_in_order_response)
    result = await embed_texts(client, [], "embedding")
    assert result == []
    client.embeddings.create.assert_not_called()


@pytest.mark.asyncio
async def test_embed_texts_batches_at_boundary():
    texts = [f"text-{i}" for i in range(EMBEDDING_BATCH_SIZE + 4)]  # 20개 → 16 + 4
    client = _fake_client(_in_order_response)

    result = await embed_texts(client, texts, "embedding")

    assert len(result) == len(texts)
    assert client.embeddings.create.call_count == 2
    first_call, second_call = client.embeddings.create.call_args_list
    assert len(first_call.kwargs["input"]) == EMBEDDING_BATCH_SIZE
    assert len(second_call.kwargs["input"]) == 4


@pytest.mark.asyncio
async def test_embed_texts_reorders_shuffled_response_by_index():
    texts = ["a", "b", "c", "d", "e"]
    client = _fake_client(_shuffled_response)

    result = await embed_texts(client, texts, "embedding")

    # _shuffled_response는 item.embedding = [float(item.index)]로 채우므로, 재정렬이 제대로 되면
    # 결과는 입력 순서 그대로 [0.0], [1.0], [2.0], [3.0], [4.0]이어야 함
    assert result == [[0.0], [1.0], [2.0], [3.0], [4.0]]


@pytest.mark.asyncio
async def test_embed_query_returns_single_embedding():
    client = _fake_client(_in_order_response)
    result = await embed_query(client, "질의문", "embedding")
    assert result == [0.0]
