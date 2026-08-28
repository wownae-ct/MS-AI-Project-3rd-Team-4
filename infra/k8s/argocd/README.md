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

# Image Updater가 실제로 Application을 감시하게 만드는 CR — 이거 없으면 컨트롤러가 켜져
# 있어도 "감시 대상 없음" 상태로 아무 일도 안 한다(2026-08-26 발견, 아래 참고).
kubectl apply -f infra/k8s/argocd/argocd-image-updater-crs.yaml
```

> ⚠️ **2026-08-26 발견 — Image Updater가 설치 이후 실제로는 한 번도 동작하지 않고 있었다.**
> 업스트림이 kubebuilder/CRD 구조로 재구성되면서(§5-2, `quay.io/argoprojlabs/argocd-image-updater:v1.3.0`)
> 컨트롤러 기본 동작이 바뀌었다 — Application의 `argocd-image-updater.argoproj.io/*` annotation을
> 자동으로 스캔하던 옛 방식과 달리, 이제는 **`ImageUpdater` CR이 명시적으로 지정한 Application만**
> 처리한다. CR을 만들지 않았던 12일 동안 컨트롤러 로그는 시작 직후 "No ImageUpdater CRs to process"
> 한 줄만 남기고 그 뒤로 아무 활동이 없었다(`kubectl get imageupdaters -A` → 0개) — 즉 backend/
> frontend가 새 이미지를 ACR에 push해도 staging/production 어느 쪽도 자동으로 갱신되지 않는 상태가
> 계속 유지되고 있었다. `infra/k8s/argocd/argocd-image-updater-crs.yaml`(신규, `useAnnotations: true`
> + `namePattern: "*"`)이 기존 6개 Application의 annotation을 그대로 읽게 만들어 고쳤다 — annotation
> 자체는 안 건드렸다(중복 설정을 피하려고 "이 annotation을 봐라"는 선택 하나만 CR에 추가).

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

`argocd-image-updater-config` ConfigMap에 `registries.conf`를 병합하고, 인증은 공식 문서(Azure Workload
Identity 예제)의 외부 스크립트 방식(`credentials: ext:/app/auth/auth.sh`)을 쓴다 — Image Updater에
내장된 `azure` credential 타입은 따로 없고, `AZURE_FEDERATED_TOKEN_FILE`을 읽어 AAD 토큰 → ACR refresh
token으로 직접 교환하는 스크립트가 필요하다(스크립트 원본:
[argocd-image-updater 공식 문서](https://argocd-image-updater.readthedocs.io/en/stable/configuration/registries/)).
이 스크립트는 `infra/k8s/argocd/argocd-image-updater-auth-script.yaml`(ConfigMap)로 이미 만들어뒀고,
`infra/ansible/playbooks/bootstrap-cluster.yml`이 적용 + Deployment에 `ACR_NAME` env var/볼륨마운트까지
자동으로 붙인다(수동 kubectl 불필요) — **미검증**: `argocd-image-updater` 컨테이너 이미지에 스크립트가
쓰는 `python3`/`wget`이 실제로 있는지는 배포 후 `kubectl logs -n argocd deployment/argocd-image-updater`로
확인 필요. 업스트림 설치 매니페스트의 ServiceAccount 이름이 `argocd-image-updater`가 맞는지도 함께 확인할 것
(버전에 따라 바뀔 수 있음).

## 배포

```bash
kubectl apply -f infra/k8s/root-app-staging.yaml
kubectl apply -f infra/k8s/root-app-production.yaml
```

이후 `infra/k8s/apps/staging/*.yaml`(root-app-staging, `backend` 브랜치 추적) 또는
`infra/k8s/apps/production/*.yaml`(root-app-production, `main` 브랜치 추적)에 Application을 추가하면
자동으로 동기화된다(app-of-apps). **2026-08-26 분리**: 예전엔 root-app 하나가 `main` 기준으로
`infra/k8s/apps/` 전체를 읽어서, staging용 Application을 새로 추가해도 main 승격 전까지는 반영이
안 되는 비대칭이 있었다 — root-app을 staging/production 둘로 나눠 staging은 `backend`를 직접
추적하게 해서 해결했다. `root-app-{staging,production}.yaml`이 각자 관리하는
`infra/k8s/apps/{staging,production}/` 밖에 있는 이유는 자기참조(root-app이 관리하는 폴더 안에
자기 자신이 있으면 `prune: true`일 때 스스로를 지울 수 있음) 방지 —
[../../README.md](../../README.md) 참고.
