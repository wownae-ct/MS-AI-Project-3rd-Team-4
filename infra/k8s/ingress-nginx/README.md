# ingress-nginx

클러스터 레벨 컴포넌트. Helm으로 **1벌만** 설치한다(staging/production 공용).

## 결정 배경
NGINX든 HAProxy든 둘 다 로컬에서 써본 경험이 있어서 후보였음 — **NGINX로 확정**(생태계/문서가 더 크고 AKS 예제가 많아서).
HAProxy는 향후 성능 튜닝이 필요해지면 대체 후보로 남겨둔다.

Azure의 별도 과금 리소스가 아니다 — AKS 안에서 도는 일반 워크로드일 뿐이고, Azure가 자동으로 붙여주는 건
Service(type: LoadBalancer) 앞단 공인 IP뿐이다(AKS 기본 네트워킹 범위, 추가 리소스 아님).
AGIC(Application Gateway Ingress Controller)를 썼다면 Application Gateway라는 별도 유료 PaaS 리소스가 필요했을 것 — 그래서 제외.

## 도메인 결정 (2026-08-13, staging/production 공용 컨트롤러로 재정리)

`frontend-ci.yml`을 보면 PR 프리뷰든 프로덕션 배포든 `VITE_API_BASE` 시크릿 하나만 항상 쓴다 — 즉
브라우저(Static Web App)가 staging 백엔드를 직접 호출하는 경로가 없다. staging 네임스페이스는 `backend`
브랜치 머지 전 팀 내부 사전 점검용이라, **production만 "예쁜" 공인 도메인이 필요**하고 staging은 접근만
가능하면 된다. 그래서 ingress-nginx 컨트롤러를 환경별로 나누지 않고 **1벌만 설치**해서 Public IP도 1개만
쓰고, 두 환경을 host 기반으로 같은 컨트롤러 안에서 구분한다:

- **production**: Azure LoadBalancer 자동생성 DNS 라벨(`service.beta.kubernetes.io/azure-dns-label-name`)
  로 실도메인 구매 없이 무료 발급 — `aicoach-production.koreacentral.cloudapp.azure.com`. DNS 이름 레이블
  범위는 ACR과 동일하게 **"재사용 안 함(No Reuse)"**(서브도메인 탈취 방지).
- **staging**: 같은 컨트롤러의 **같은 공인 IP**를 `nip.io`로 재사용 — `<IP를-하이픈으로-치환>.nip.io`
  (예: IP가 `20.1.2.3`이면 `20-1-2-3.nip.io`). 별도 리소스/설정 없이 즉시 동작하고, `nip.io`도 실제
  공개 DNS라서 cert-manager Let's Encrypt HTTP-01 challenge가 그대로 통과한다.
  **주의**: 이 IP는 동적 할당이라 ingress-nginx Service가 재생성되면 바뀔 수 있음 — staging 접속 URL이
  깨지면 `kubectl get svc -n ingress-nginx`로 새 IP 확인 후 `nip.io` 문자열만 다시 조합하면 됨(내부
  점검용이라 실서비스 영향 없음).

TLS는 **cert-manager + Let's Encrypt 자동 발급**으로 확정(둘 다 진짜 공인 DNS라 추가 비용/수고 없이 적용
가능). 설치 절차는 [../cert-manager/README.md](../cert-manager/README.md) 참고.

## 설치 (AKS 클러스터 배포 후, 1회만)

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-dns-label-name"=aicoach-production
```

설치 후 공인 IP 확인 → staging용 `nip.io` 호스트를 만들 때 필요:

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

몇 분 뒤 `nslookup aicoach-production.koreacentral.cloudapp.azure.com`으로 DNS 라벨이 실제로 반영됐는지
확인(**미검증 — 실배포 후 라이브 확인 필요**).

## 사용하는 곳

`infra/k8s/overlays/backend-staging/ingress.yaml`, `infra/k8s/overlays/backend-production/ingress.yaml`
둘 다 `ingressClassName: nginx`(기본 클래스, 커스터마이징 안 함)를 쓰고 host만 다르다.
