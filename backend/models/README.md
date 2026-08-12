# models

ml 레포에서 학습 후 ONNX로 export된 모델 아티팩트(.onnx)를 여기 둔다. **git으로 추적하지 않음**(바이너리, `.gitignore` 참고).

받아오는 방법 확정됨: ml 레포가 `az storage blob upload`로 Blob Storage(`models/<version>/model.onnx`)에 올리면,
AKS Deployment의 Init Container(`infra/k8s/base/backend/deployment.yaml`)가 `MODEL_VERSION`(ConfigMap)에 해당하는
버전을 내려받아 여기(컨테이너 안 `/app/backend/models`)에 채운다. 로컬 개발 시엔 직접 다운로드해서 넣을 것.

로딩/추론 코드는 `backend/app/inference/`. 버전 관리 상세는 `infra/README.md`의 "ML 모델 버전 관리" 참고.
