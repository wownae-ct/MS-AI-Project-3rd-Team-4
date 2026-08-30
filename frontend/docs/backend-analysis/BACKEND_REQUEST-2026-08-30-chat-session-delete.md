# 프론트 → 백엔드 요청 (2026-08-30) — 상담 세션 삭제 엔드포인트 1건

> **보내는 쪽** 프론트엔드 (`frontend` 브랜치)
> **기준** 백엔드 `origin/main` 의 `backend/app/routers/ai/chat.py` · `backend/app/services/chat.py`
> **성격** **요청 1건.** 프론트 UI·API 함수·테스트는 **이미 다 만들어 두었고**, 이 엔드포인트만 붙으면 동작합니다.
> **급함** ⚠️ 중간 — 사용자 요청 기능이지만 다른 화면을 막지는 않습니다.
>
> 줄번호는 `origin/main` 기준 실측입니다.
>
> ## ✅ 닫혔다 — 백엔드 회신 도착 (2026-08-30)
>
> **요청 1건 구현 완료 · 판단 2건 결정 완료.** 전문과 대조 결과는 **[§6 회신 요약](#6-회신-요약-2026-08-30--닫힘)** 에 있다.
> 🚨 **아래 §2 「소프트 삭제로 가신다면」에 사실 오류가 있었다** — 백엔드가 잡아 줬고 그 자리에
> 정정을 붙였다. **이 문서를 근거로 소프트 삭제를 재검토하려는 사람은 정정된 표를 먼저 볼 것.**
> 🚨 **아직 머지·배포 전이다**(회신 시점 `fix/backend` 미커밋). §4 의 배포 순서가 그대로 유효하다.

---

## 요약

| # | 요청 | 종류 | 급함 | 왜 프론트가 못 하나 |
|---|---|---|---|---|
| **1** | `DELETE /api/v1/chat/sessions/{session_id}` 신설 | 코드 (라우터 1 + 서비스 1) | ⚠️ 중간 | 백엔드 소유. 프론트에는 대화를 지울 수단이 **아예 없습니다** |

**배경** — 사용자 리포트(2026-08-30): *"지난 대화기록을 삭제하는 기능이 필요함."*
현재 `chat.py` 의 엔드포인트는 **5개**(생성 · 목록 · 메시지조회 · 메시지전송 · 피드백)뿐이라
「지난 대화」 드로어가 읽기 전용이었습니다. 저희 코드 주석도 그 사실을 그대로 적어 두고 있었습니다
(`frontend/src/pages/chat/ui/ChatHistoryDrawer.tsx` 머리말 · `entities/chat/api/chat.ts`).

---

## 1. `DELETE /api/v1/chat/sessions/{session_id}`

### 요청하는 계약

| 항목 | 값 |
|---|---|
| 메서드·경로 | `DELETE /api/v1/chat/sessions/{session_id}` |
| 인증 | `Depends(get_current_wedding)` — 기존 4개 엔드포인트와 **똑같이** |
| 성공 | **`204 No Content`** (바디 없음) |
| 실패 | **`404 CHAT_SESSION_NOT_FOUND`** — 없거나 · 남의 것이거나 · 이미 지워졌거나 |
| 삭제 대상 | 그 세션 + 그 세션의 `chat_messages` 전부 |
| rate limit | **불필요** — LLM 호출이 없습니다. 기존 `DELETE /payments/{id}` 도 안 걸려 있습니다 |

### 왜 404 하나로 뭉치나 — 기존 정책 그대로입니다

`services/chat.py:69-80` 의 `get_chat_session` 이 이미 그렇게 설계돼 있습니다:

```python
"""wedding_id를 WHERE 절에 직접 넣어 "없음"과 "남의 것"을 구조적으로 구분 못 하게 한다 —
둘 다 404 CHAT_SESSION_NOT_FOUND로 응답해 세션 존재 여부 자체를 노출하지 않는다
(03_API_spec.md §5 — 다른 사람의 리소스를 조회/수정할 방법 자체가 없어야 함)."""
```

**이 함수를 그대로 재사용하시면 소유권 검사가 끝납니다** — 새 규칙이 필요 없습니다.

### 고칠 곳 — 2곳

**① 서비스** `backend/app/services/chat.py`

```python
async def delete_chat_session(
    session: AsyncSession, wedding_id: UUID, session_id: UUID
) -> None:
    chat_session = await get_chat_session(session, wedding_id, session_id)  # 없음/남의 것 → 404
    await session.delete(chat_session)
    await session.commit()
```

**② 라우터** `backend/app/routers/ai/chat.py` (기존 `list_chat_messages_route` 옆)

```python
@router.delete("/chat/sessions/{session_id}", status_code=204)
async def delete_chat_session_route(
    session_id: UUID,
    wedding: Wedding = Depends(get_current_wedding),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> None:
    await delete_chat_session_service(session, wedding.id, session_id)
```

---

## 2. 판단을 부탁드리는 것 — 하드 삭제 vs 소프트 삭제

**프론트는 어느 쪽이든 무관합니다.** 목록에서 사라지고 재조회가 404 면 화면은 똑같이 동작합니다.
다만 저희가 코드를 읽다가 **하드 삭제일 때 조용히 잃는 것 두 가지**를 찾았습니다. 판단에 참고만 해 주세요.

### 하드 삭제로 잃는 것

**① `user_rating` 피드백 표본이 함께 사라집니다.**
`chat_messages.user_rating`(`models/chat.py:75`)은 답변 품질 평가에 쓰라고 만든 컬럼입니다.
세션을 지우면 그 안의 좋아요/싫어요가 통째로 없어집니다 — **품질 분석에 그 값을 쓰고 계시면**
사용자가 대화를 정리할 때마다 표본이 깎입니다. (쓰고 계시지 않다면 신경 쓸 것 없습니다.)

**② `feedback_reports` 에 끊어진 참조가 남습니다.**
`models/feedback.py:3-5` 가 명시적으로 적어 둔 대로 `target_id` 는 **의도적으로 FK 가 아닙니다**:

> `target_id`는 의도적으로 ForeignKey가 아니다 — target_type(CHAT_MESSAGE/CHECKLIST_ITEM/…)에 따라
> 가리키는 테이블이 달라서다.

FK 가 아니므로 **DB 가 막아 주지도, 함께 지워 주지도 않습니다.** F13 신고가 달린 AI 답변을 포함한
세션을 하드 삭제하면 `feedback_reports` 행은 남고 그 `target_id` 는 아무 데도 닿지 않게 됩니다.

### 참고 — 메시지 cascade 자체는 이미 되어 있습니다

`models/chat.py:61-63` 의 `session_id` 가 `ForeignKey("chat_sessions.id", ondelete="CASCADE")` 라
**세션만 지우면 메시지는 DB 가 알아서 지웁니다.** 서비스에서 메시지를 따로 지울 필요가 없습니다.

### 소프트 삭제로 가신다면

> ## 🚨 정정 (2026-08-30, 백엔드 지적 — 프론트 확인 완료)
>
> **아래 원문은 틀렸습니다.** *"`get_chat_session` 하나가 관문이라 실질적으로 **두 곳**"* 이라고
> 썼는데, `chat_sessions` 를 읽는 지점은 **네 곳이고 그중 둘은 `get_chat_session` 을 안 거칩니다.**
> 백엔드 회신의 지적이고, `origin/main` 소스로 직접 확인했습니다:
>
> | 경로 | `get_chat_session` 경유? | 실측 |
> |---|---|---|
> | 메시지조회 `list_chat_messages` | ✅ 경유 | — |
> | 메시지전송 `send_chat_message` | ✅ 경유 | `routers/ai/chat.py` — 스트림 열기 전 호출 |
> | **답변 평가 `rate_chat_message` → `get_chat_message`** | ❌ **직접 조인** | `services/chat.py` — `select(ChatMessage).join(ChatSession, …).where(ChatSession.wedding_id == wedding_id)` |
> | **F13 신고 `target_exists_for_wedding`** | ❌ **직접 조인** | `services/feedback.py` — `CHAT_MESSAGE` 분기가 같은 조인을 따로 씁니다 |
>
> **제 오독의 원인**: `get_chat_message` 의 독스트링이 *"`feedback.py::target_exists_for_wedding`
> 의 CHAT_MESSAGE 분기와 **동일한 조인**"* 이라고 적어 둔 것을 「같은 관문을 거친다」로 읽었는데,
> 실제로는 **같은 조인을 두 곳이 각자 따로 쓴다**는 뜻이었습니다. 정반대입니다.
>
> **결과적으로 이 오류는 백엔드의 결정을 더 강화합니다** — 소프트 삭제였다면 `deleted_at IS NULL`
> 이 4곳 필요했고, 눈에 안 띄는 뒤 두 곳을 빠뜨리면 *"지운 대화의 메시지에 좋아요/싫어요와 신고가
> 계속 되는"* 조용한 구멍이 됐습니다. **하드 삭제엔 그 실수 여지가 원천적으로 없습니다.**
>
> ⚠️ 이 문서를 근거로 나중에 소프트 삭제를 재검토한다면 **두 곳이 아니라 네 곳**입니다.

~~`chat_sessions.deleted_at` 을 추가하고 **네 곳**의 조회에 `deleted_at IS NULL` 을 더하시면 됩니다 —
`get_chat_session`(→ 메시지조회 · 메시지전송 · 피드백이 전부 이걸 거칩니다)과 세션 목록 쿼리.
`get_chat_session` 하나가 관문이라 실질적으로 **두 곳**입니다.~~
이 경우 이미 지워진 세션에 대한 재요청은 그 함수가 자연히 404 를 냅니다 — 아래 멱등성 항목과 맞습니다.

---

## 3. 프론트가 이미 처리해 둔 것 (추가 요청 없음)

확인만 부탁드립니다 — **백엔드에 더 해 주실 일은 없습니다.**

| 상황 | 처리 |
|---|---|
| **멱등성** — 이미 지워진 대화를 또 지우려 함 | 프론트가 `CHAT_SESSION_NOT_FOUND` 를 **성공과 같이** 흡수해 조용히 행만 지웁니다. 다른 기기에서 먼저 지운 경우 「지워졌는데 실패했다고 한다」가 되지 않게 하는 처리입니다 |
| **진행 중 SSE 와의 경합** — 삭제 직후 그 세션으로 메시지 전송이 도착 | `send_chat_message`(`chat.py:94`)가 스트림을 열기 **전에** `get_chat_session` 을 부르므로 이미 404 로 막힙니다. 프론트도 삭제 시 진행 중이던 스트림을 `AbortController` 로 끊습니다 |
| **지금 열려 있는 대화를 지운 경우** | 프론트가 화면을 빈 새 대화로 되돌리고 `sessionStorage` 미러까지 지웁니다(`ChatPage.tsx::handleSessionDeleted`) |

---

## 4. 🚨 배포 순서 — 백엔드가 먼저입니다

프론트가 먼저 배포되면 **삭제 버튼이 이런 문구를 냅니다**:

> 서버 응답을 해석할 수 없습니다 (HTTP 404).

FastAPI 가 없는 라우트에 내는 `{"detail":"Not Found"}` 에는 이 프로젝트의 `error` 봉투가 없어서,
프론트의 공용 파서(`frontend/src/shared/api/errors.ts:48-60`)가 `UNKNOWN_ERROR` 로 떨어뜨리기 때문입니다.

**조용히 성공한 척하지는 않습니다** — 위 3절의 「멱등성」 흡수는 **봉투 안의 `CHAT_SESSION_NOT_FOUND`
코드**로만 걸리게 해 뒀습니다. 미배포 상태의 404 는 그 분기에 걸리지 않으므로 행이 사라지지 않고
에러가 그대로 보입니다. 그래도 사용자에게 보여 줄 문구는 아니니, 백엔드를 먼저 내보내 주세요.

---

## 5. 재현 · 검증

**현재 상태 확인** (엔드포인트 부재 확인)

```bash
# 로그인해 쿠키를 받은 뒤
curl -i -X DELETE "$API/api/v1/chat/sessions/$SESSION_ID" -b cookies.txt
# 지금:  HTTP/1.1 404 Not Found   {"detail":"Not Found"}     ← 라우트 자체가 없음
# 기대:  HTTP/1.1 204 No Content  (바디 없음)
```

**붙인 뒤 확인할 것 4가지**

```bash
# ① 정상 삭제 → 204
curl -i -X DELETE "$API/api/v1/chat/sessions/$MINE" -b cookies.txt

# ② 같은 것 다시 → 404 CHAT_SESSION_NOT_FOUND (봉투 형식이어야 프론트가 흡수합니다)
curl -s -X DELETE "$API/api/v1/chat/sessions/$MINE" -b cookies.txt | jq .error.code

# ③ 남의 세션 → 404 (403 이 아니어야 합니다 — 존재 여부 비노출)
curl -s -X DELETE "$API/api/v1/chat/sessions/$SOMEONE_ELSES" -b cookies.txt | jq .error.code

# ④ 메시지도 함께 사라졌는지 → 404
curl -s "$API/api/v1/chat/sessions/$MINE/messages" -b cookies.txt | jq .error.code
```

**프론트 쪽 계약 고정 위치** (이미 통과하는 테스트입니다)

| 파일 | 고정한 것 |
|---|---|
| `frontend/src/pages/chat/ui/ChatHistoryDrawer.test.tsx` | 되묻기 · 취소 · 확정 시 호출 id · 실패 시 행 보존 · `CHAT_SESSION_NOT_FOUND` 흡수 |
| `frontend/src/pages/chat/ui/ChatPage.test.tsx` | 열려 있던 대화를 지웠을 때의 화면·미러 정리 |

---

## 6. 회신 요약 (2026-08-30) — 닫힘

백엔드 회신 도착. **요청 1건 구현 · 판단 2건 결정.** 아래는 회신 내용과 프론트 쪽 대조 결과다.

### 6.1 계약 — 요청한 그대로 왔다 (프론트 변경 0)

| 항목 | 요청 | 회신 | 프론트 영향 |
|---|---|---|---|
| 경로 · 메서드 | `DELETE /api/v1/chat/sessions/{id}` | ✅ 동일 | 없음 — `deleteChatSession` 그대로 |
| 성공 | `204 No Content` | ✅ 동일 | 없음 — `shared/api/client.ts::readBody` 가 204 를 `undefined` 로 처리한다(확인함) |
| 실패 | `404 CHAT_SESSION_NOT_FOUND` **봉투 형식** | ✅ 동일 · **봉투까지 테스트로 고정** | 없음 — 멱등성 흡수가 그 코드로만 걸린다 |
| 인증 | `get_current_wedding` | ✅ 동일 | 없음 |
| cascade | 메시지 함께 삭제 | ✅ 실DB 로 행 소멸까지 확인 | 없음 |

**구현 위치** — `services/chat.py::delete_chat_session` · `routers/ai/chat.py::delete_chat_session_route` ·
`tests/test_smoke.py::TestChatSessionsSmoke` 5건. `ruff` 통과 · `pytest` 427건 통과(신규 5건 포함).

⚠️ **테스트 3·4 가 저희가 낸 검증안보다 낫다** — 기록해 둔다.
· 「남의 세션 → 404」에 **원 소유자 목록에 세션이 그대로 남았는지**까지 더했다. 404 만 보면
  *"실제로는 지워 놓고 404 를 낸"* 경우를 못 잡는다.
· 「메시지 cascade」는 API 로는 세션 404 에 가려 확인이 불가능하므로 **실DB 행을 직접 조회**했다.

### 6.2 판단 2건 — 결정과 근거

| 판단 | 결정 | 근거 |
|---|---|---|
| 하드 vs 소프트 | **하드 삭제** | 위 §2 정정 참고 — 소프트였다면 `deleted_at IS NULL` 이 **4곳** 필요했고 뒤 둘은 빠뜨리기 쉽다. 게다가 이 코드베이스에 `deleted_at` 선례가 `app/`·`alembic/` 통틀어 **0건**이라 컨벤션도 갈린다 |
| `feedback_reports` 끊어진 참조 | **감수하고 그대로 둔다** | AI 안전성 신고가 사용자의 대화 정리로 함께 사라지는 것보다, 참조가 끊긴 채 남는 편이 F13 「책임성」 취지에 맞다. 현재 이 테이블을 읽는 코드가 **0건**(POST 뿐)이라 런타임 영향 없음. 근거를 서비스 독스트링에 남겼다 |

### 6.3 저희가 낸 우려 1건은 **기각됐다 — 타당하다**

`user_rating` 표본 손실 우려는 **실측상 해당되지 않는다.** `chat_messages.user_rating` 을 집계하는
DB 쿼리가 하나도 없고, 유일한 품질 대시보드(`scripts/langfuse_dashboard_backup.json`)는 **Langfuse
Score** 를 읽지 DB 컬럼을 읽지 않는다. Langfuse Score 는 우리 DB 삭제와 무관하게 살아남으므로
사용자가 대화를 정리해도 대시보드 수치가 깎이지 않는다.

↪ **교훈**: 「이 컬럼이 있다」에서 「이 컬럼이 쓰인다」로 건너뛰었다. 다음에 같은 종류의 우려를
제기할 땐 **소비처를 먼저 grep 한다.**

### 6.4 남은 것 — 배포 순서 하나뿐

회신 시점에 `fix/backend` **미커밋**이다(로컬 브랜치에도 아직 라우트가 없음을 확인했다).
§4 의 순서가 그대로 유효하다 — **백엔드 머지·배포 완료 통보를 받은 뒤 프론트를 내보낸다.**
그 전까지 프론트의 삭제 버튼은 「서버 응답을 해석할 수 없습니다 (HTTP 404).」를 낸다(조용히
성공한 척하지는 않는다 — §4).

---

## 부록 — 알려진 잔여 항목 (이번 요청 아님)

**메시지 0개짜리 세션은 여전히 지울 수 없습니다.**
`ChatPanel` 이 첫 메시지를 보내기 **직전에** 세션을 만들기 때문에, 그 전송이 실패하면
`title` · `last_message_at` 이 둘 다 `null` 인 빈 세션이 서버에 남습니다. 프론트는 그런 세션을
목록에서 거르고 있어서(`ChatHistoryDrawer.tsx::hasContent`) **사용자에게 보이지도, 지울 수도
없는 행**이 됩니다.

지금 당장 문제를 일으키지는 않습니다(용량뿐입니다). 다만 정리하실 거라면 프론트가 아니라
백엔드 쪽이 맞는 자리로 보입니다 — 예: 메시지 0개이고 생성 후 N시간 지난 세션을 배치로 정리.
**요청이 아니라 기록입니다.**

> ✅ **회신(2026-08-30)**: *"지적하신 대로 백엔드 쪽이 맞는 자리로 보입니다. 이번 스코프에는 안
> 넣었고, 별도 항목으로 잡아 두겠습니다."* — **백엔드가 항목으로 인수했다.** 프론트는 계속
> `hasContent` 로 거른다(그 필터를 걷어내면 열어 봐야 빈 화면인 행이 목록에 뜬다).
