# 비전 파이프라인 — 캡처·추론·CANON19·업링크

> 근거: 설계서 v2.1 §4.1~§4.4. 구현 규칙의 SSOT는 `.claude/skills/mediapipe-worker-pipeline`,
> 수치는 CLAUDE.md §4 (「윈도우 계약」·「CANON19 페이로드」·「업링크 백프레셔」·「t_offset_ms」·「카메라 워치독」·「Worker 타이머」).

## 1. 캡처 — rVFC 단일 경로 (§4.1)

- `requestVideoFrameCallback`으로만 캡처한다. **rAF 폴백 금지** — rVFC 부재는 "느린 경로로 계속"이 아니라
  "비지원 브라우저 → 안내 화면"이다 (P0-9, §6.2.1). rAF는 3용처(오버레이 렌더·프레임 예산 실측·Worker 실패 시 저주기 강등)만.
- **대기열 최대 1개**: Worker가 in-flight면 새 프레임은 즉시 드롭(+close). 큐잉하면 지연이 누적돼 "실시간" 코칭이 아니게 된다.
- **프레임 close 계약 (P0-8)**: 모든 캡처 프레임은 생성 경로와 무관하게 정확히 1회 `close()`.
  - Worker가 처리 완료한 것 → Worker가 close
  - 메인이 드롭한 것 → 메인이 즉시 close
  - terminate 직전 → in-flight 드레인 대기 후 (「Worker 타이머」)
  누수 시 GPU/디코더 리소스가 고갈되어 수 분 뒤 캡처가 조용히 멈춘다 — 개발 빌드에 미해제 카운터를 둔다 (§7.5 P0).
- **카메라 워치독**: rVFC 미수신 일정 시간 초과 → CAMERA_STALLED → 안내 → getUserMedia 1회 재시도 → `session_pause`/복구 시 `session_resume`. track의 `ended`/`mute`/`unmute` 구독 필수 (§4.1.2).

## 2. Worker — 탭당 1개 싱글턴 (§4.3)

- Worker Pool 금지 (P0-6). ref-count로 획득/반납, 세션 중 terminate 금지, 유휴 시에만 지연 terminate.
- 헬스 경로: 응답 타임아웃 → 재생성+재초기화+rule_params 재주입(횟수 상한) → 초과 시 저주기 메인 스레드 강등.
  `webglcontextlost` → CPU delegate 즉시 전환.
- 추론용 OffscreenCanvas는 GPU delegate의 공식 필수 입력 — "캔버스는 메인 소유" 원칙(P0-7)의 위반이 아니라 별개 경로.
- WASM·`.task` 모델은 self-hosting (`public/mediapipe/`) — CDN 하드코딩 금지 (P0-10). 배치 절차는 `docs/plan/03_툴체인_정비계획.md` §5.

## 3. CANON19 변환·윈도우 조립 (§4.4) — Worker 내부

- 33 랜드마크를 **Worker가 내부에서 CANON19(19관절×6채널)로 축약** — 33개 원본을 그대로 싣지 않는다 (P0-14).
- 윈도우는 고정 길이·오버랩 스트라이드, `t_offset_ms` **고정 격자 리샘플**:
  양측 실측이 있으면 선형 보간, 한쪽뿐이면 최근접 홀드 — 두 경우 모두 INTERPOLATED 플래그.
  유효 프레임 비율 미달 윈도우는 미전송 + dropped_window_count 증가 (「윈도우 계약」).
- 왜 고정 격자인가: 서버 TCN 모델이 등간격 시퀀스를 전제한다. 실측 타임스탬프를 그대로 보내면 기기별 fps 편차가 모델 입력 분포를 오염시킨다.

## 4. t_offset_ms 원점 (§3.4)

- 원점은 `auth_ok`의 `session_started_at`(session_epoch)이고, 값은 **performance.now() 파생 단조 경과 ms**다.
  `Date.now()` 대입 금지 — u32 절단이 조용히 일어난다 (「t_offset_ms」). 송신 전 범위 assert.
- **재바인딩은 session_id 변경 시만** — 재연결마다 재바인딩하면 고정 격자가 오염된다.

## 5. 업링크 — 메인 스레드 소유 (§4.4.0 · §4.4.4)

- Worker는 윈도우 payload까지만. **24B 헤더 작성과 `ws.send`는 메인** (P0-14) — seq·연결 상태는 메인의 상태 기계 소유이기 때문.
- 백프레셔는 **단일 링 버퍼** 하나뿐 (「업링크 백프레셔」): 초과 시 오래된 것부터 축출 + 카운터.
  송신 직전 `ws.bufferedAmount` 임계 초과면 defer — **defer는 drop이 아니다** (버퍼에 남는다).
- 오프라인 소급 업로드는 미지원 — 실시간 코칭 데이터는 낡으면 가치가 없다.

## 6. 성능 예산 (§6.3)

메인 스레드 프레임 예산은 rVFC 캡처+transfer / rAF 오버레이 / 룰 판정 / 상태+send로 분할되어 있다 (「메인 프레임 예산」).
초과 감지는 LoAF 1급 + rAF 실측 병행 (버전 지연 Chromium 대비). 추론 SLO 초과 시 캡처 주기 하향 (「추론 SLO」).
