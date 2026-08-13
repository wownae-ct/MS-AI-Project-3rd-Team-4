# cert-manager

`ingress-nginx`처럼 클러스터 레벨 컴포넌트. Let's Encrypt로 TLS 인증서를 자동 발급/갱신한다
(수동 인증서 관리 없음 — 90일마다 자동 갱신).

## 설치 (ingress-nginx 설치 이후)

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true
```

## ClusterIssuer 등록

ingress-nginx가 1벌만 도므로([../ingress-nginx/README.md](../ingress-nginx/README.md) 참고) ClusterIssuer도
**1개**(`letsencrypt-nginx`)면 충분 — staging/production Ingress 둘 다 같은 Issuer를 참조한다. Let's Encrypt
**운영(production) ACME 서버**를 쓴다(스테이징 앱 환경이라고 해서 Let's Encrypt의 테스트용 미신뢰 인증서
환경을 쓰는 게 아님 — 헷갈리지 않게 구분).

`cluster-issuer.yaml`의 `<LETSENCRYPT_EMAIL>`을 실제 팀 이메일로 교체 후 적용:

```bash
kubectl apply -f infra/k8s/cert-manager/cluster-issuer.yaml
```

인증서 발급 상태 확인:

```bash
kubectl get certificate -n staging
kubectl get certificate -n production
kubectl describe certificaterequest -n staging   # 실패 시 원인 확인
```

## 사용하는 곳

`infra/k8s/overlays/backend-staging/ingress.yaml`, `infra/k8s/overlays/backend-production/ingress.yaml`의
`cert-manager.io/cluster-issuer: letsencrypt-nginx` 어노테이션 + `spec.tls`가 이 ClusterIssuer를 참조한다.
