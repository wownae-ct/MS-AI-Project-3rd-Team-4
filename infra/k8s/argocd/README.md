# ArgoCD 설치 (AKS)

홈랩 `k3s-repo`/`infra-repo`에서 쓰던 app-of-apps 패턴을 그대로 재사용한다.
차이점: 시크릿 백엔드는 SealedSecrets 대신 **Key Vault CSI + Workload Identity**(`infra/k8s/base/secretproviderclass.yaml`).

## 설치

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -n argocd -f infra/k8s/argocd/argocd-cmd-params-cm.yaml
kubectl rollout restart deployment argocd-server -n argocd

# Image Updater (ACR 신규 태그 자동 반영)
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml
```

## 프라이빗 레포 접근 (필수 — 이 레포는 private)

ArgoCD가 이 레포를 읽으려면 자격증명이 필요하다. GitHub PAT(레포 read 권한)로 시크릿 생성:

```bash
kubectl apply -n argocd -f - << YAML
apiVersion: v1
kind: Secret
metadata:
  name: repo-ms-ai-project-3rd-team-4
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: https://github.com/wownae-ct/MS-AI-Project-3rd-Team-4.git
  username: wownae-ct
  password: <GITHUB_PAT>
YAML
```

PAT는 커밋하지 말고 로컬에서만 주입할 것 (`gitleaks` CI가 어차피 탐지한다).

## ACR 인증 (Image Updater가 태그 목록을 조회하려면 필요)

static ACR 토큰 대신 전용 Workload Identity를 쓴다(`infra/bicep/modules/aks.bicep`의
`imageUpdaterIdentity` — backend Identity와 별개, ACR에 대한 AcrPull 롤만 보유). backend Identity의
네임스페이스별 federation과 같은 패턴으로, `argocd` 네임스페이스의 `argocd-image-updater`
ServiceAccount에 federated credential이 연결돼 있다.

설치 후 서비스어카운트에 Workload Identity를 붙인다 (P1 배포 출력값의 `imageUpdaterIdentityClientId` 사용):

```bash
kubectl annotate serviceaccount argocd-image-updater \
  -n argocd \
  azure.workload.identity/client-id=<IMAGE_UPDATER_IDENTITY_CLIENT_ID> \
  --overwrite

kubectl patch deployment argocd-image-updater -n argocd --type merge -p \
  '{"spec":{"template":{"metadata":{"labels":{"azure.workload.identity/use":"true"}}}}}'

kubectl rollout restart deployment argocd-image-updater -n argocd
```

argocd-image-updater 설정(`argocd-image-updater-config` ConfigMap 또는 `registries.conf`)에서 해당
ACR을 `api_version: 'auto'`, workload identity 기반(`azure` credential 없이 노드/파드 identity 사용)으로
잡아야 한다 — 정확한 키 이름은 실배포 후 라이브로 확인 필요(**미검증** — 업스트림 설치 매니페스트의
ServiceAccount 이름이 `argocd-image-updater`가 맞는지도 함께 확인할 것, 버전에 따라 바뀔 수 있음).

## 배포

```bash
kubectl apply -f infra/k8s/apps/root-app.yaml
```

이후 `infra/k8s/apps/*.yaml`에 Application을 추가하면 자동으로 동기화된다(app-of-apps).
