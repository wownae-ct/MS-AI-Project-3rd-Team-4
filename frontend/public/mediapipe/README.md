# MediaPipe self-hosting 자산 (§6.2 — CDN 하드코딩 금지 P0)

WASM 런타임과 pose_landmarker 모델을 동일 오리진에서 서빙한다. 로드 경로 상수는 `src/shared/config/mediapipe.ts`.

## 출처·버전 (2026-08-17 확보)

| 자산 | 출처 | 버전 |
|---|---|---|
| `wasm/*` (6파일) | `@mediapipe/tasks-vision@1.0.1` npm 패키지 `wasm/` 디렉토리 복사 | 1.0.1 (락파일 고정) |
| `models/pose_landmarker_lite.task` | 공식 스토리지 `mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest` | float16 latest (2026-08-17 시점) |
| `models/pose_landmarker_full.task` | 공식 스토리지 `.../pose_landmarker_full/float16/latest` | float16 latest (상동) |

Heavy 모델은 제외 (§6.2). wasm 6파일 전부 서빙 — FilesetResolver가 런타임 SIMD 감지로 파일을 선택하므로 일부만 두면 404가 난다.

## SHA-256 (변조·손상 검증 기준선)

```
e170ee67dd4e16c1a6fcd8840a206687e5a59b22c20e4a902bc445b095454d73  wasm/vision_wasm_internal.js
8da277a733926eacd0474b8704b36742d6ec3231c57a860c5b889dff8f1df886  wasm/vision_wasm_internal.wasm
da8934057f147b622e82cfb4c0dbd85461c598e268588b5a8ba9ca963a8ff82d  wasm/vision_wasm_module_internal.js
2dabd8e23c60984628beb7bb338764c81a08e6837145273f59578684b5d53c1b  wasm/vision_wasm_module_internal.wasm
e81d715a3d42cc3373602eb2f7aff795d164934db680e32496b65dab537f9658  wasm/vision_wasm_nosimd_internal.js
a28483cd42e74e855bf5ebdb6b40d9b66a5b49e35e95020bc97669e6822a3192  wasm/vision_wasm_nosimd_internal.wasm
4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad  models/pose_landmarker_full.task
59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a  models/pose_landmarker_lite.task
```

## 갱신 규칙 (재발 방지)

- tasks-vision 업그레이드 시: wasm 재복사 + 고정 입력 세트에서 CANON19 좌표 편차 허용치 이내 확인 후에만 락파일 갱신 (§7.3).
- 모델 갱신 시: 위 표의 확보 일자·해시를 함께 갱신 — 해시 불일치 발견 시 배포 자산 변조·손상으로 간주하고 재확보.
- SWA 서빙 요건: `.task` MIME(`application/octet-stream`)·immutable 캐시는 `staticwebapp.config.json`(M5, §6.4.1)에서 설정.
