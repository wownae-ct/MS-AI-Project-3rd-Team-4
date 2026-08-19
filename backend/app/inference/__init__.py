"""ONNX Runtime 기반 TCN 자세 판정 추론. ml 레포에서 학습→export된 모델(backend/models/*.onnx)을 로드해서 서빙.
T2 coach agent가 프레임 시퀀스를 받아 이 모듈로 판정을 얻는다."""
