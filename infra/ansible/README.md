# infra/ansible — 클러스터 컴포넌트 부트스트랩

`infra/k8s/{ingress-nginx,cert-manager,argocd}/README.md`에 수동 절차로 적혀 있던 걸 반복 가능한 Ansible
플레이북 하나로 옮긴 것 — ingress-nginx / cert-manager / ArgoCD + Image Updater, 이 4개는 README에 있던
그대로다. 여기에 **Reloader** 하나만 새로 추가됨(ConfigMap이 바뀌어도 K8s가 Pod를 자동 재시작 안 해주는
문제 때문 — 아래 "모델 버전 관리" 절 참고).

## 모델 버전 관리 (ml 레포 multi-source)

ml 레포가 새 모델을 export할 때마다 이 레포에 PR 올릴 필요 없게, `infra/k8s/apps/{backend,rag-cronjob}-*.yaml`
Application들이 **ArgoCD multi-source**로 ml 레포의 `k8s/model-version/` 경로를 직접 바라본다(ml팀이 자기
레포에 커밋만 하면 끝). ConfigMap이 바뀌어도 이미 떠있는 Pod는 저절로 재시작 안 되는 게 K8s의 기본 동작이라,
**Reloader**가 그 변화를 감지해서 backend Deployment를 자동 롤링 재시작시킨다(수동 `kubectl rollout restart`
불필요). 자세한 흐름은 [../README.md](../README.md)의 "ML 모델 버전 관리" 절 참고.

ml 레포 쪽에 필요한 최소 파일 (`k8s/model-version/configmap-model-version.yaml`):

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: model-version
data:
  MODEL_VERSION: "v0.0.0-placeholder"
```

ml 레포의 export 파이프라인이 blob 업로드 후 이 파일의 `MODEL_VERSION` 값만 바꿔서 자기 레포에 커밋·푸시하면
된다 (kustomization.yaml 없이 이 파일 하나만 있어도 ArgoCD가 plain manifest로 인식해서 적용함).

## 홈랩 레포(k3s-repo/infra-repo)와의 차이

- `infra-repo/ansible/`은 SSH로 접속하는 VM 인벤토리(`hosts.ini`의 masters/workers/bastion 그룹)를 쓴다 —
  bare-metal/EC2에 k3s를 직접 올리는 구조라서 그렇다.
- 여기(AKS)는 매니지드 컨트롤플레인이라 SSH 인벤토리 자체가 없다. `inventory/hosts.ini`는 `localhost` 하나뿐이고,
  실제로는 `kubernetes.core` 컬렉션이 로컬 kubeconfig(현재 `kubectl config current-context`)로 K8s API에
  직접 붙는다. **먼저 `az aks get-credentials`로 컨텍스트를 잡아둬야** 이 플레이북이 의미가 있다.
- podman은 여기 관여하지 않는다. podman은 backend Docker 이미지를 로컬에서 빌드·테스트할 때 쓰는 도구고
  (AKS/containerd는 OCI 표준 이미지만 보므로 빌드 도구가 뭐든 상관없음), 클러스터 컴포넌트 설치는 이
  Ansible 플레이북이 kubectl/helm으로 K8s API를 직접 호출하는 완전히 별개의 트랙이다.

## 사용법

```bash
cd infra/ansible
ansible-galaxy collection install -r requirements.yml   # kubernetes.core (최초 1회)

# P1(az deployment group create) 완료 후:
az aks get-credentials --resource-group <RG> --name <AKS_NAME>

# infra/.env 채우고 로드 (LETSENCRYPT_EMAIL, GITHUB_PAT, IMAGE_UPDATER_IDENTITY_CLIENT_ID, AKS_KUBE_CONTEXT, ML_REPO_URL)
set -a && source ../.env && set +a

ansible-playbook playbooks/bootstrap-cluster.yml
```

## 이 플레이북이 하지 않는 것 (의도적)

- **Bicep 배포(P1)는 포함 안 함** — 그건 `scripts/deploy-infra.sh`가 계속 담당. 여기는 그 다음 단계만.
- **git에 커밋/푸시 안 함** — `infra/k8s/base/**/*.yaml`의 `<PLACEHOLDER>` 채우기, staging nip.io 호스트 반영,
  `infra/k8s/apps/*.yaml`의 `<ML_REPO_URL>` 채우기는 이 프로젝트의 PR 필수 + 코드오너 리뷰 흐름(`CLAUDE.md`)을
  그대로 타야 해서 사람이 PR로 하는 단계로 남겨뒀다. 플레이북 마지막에 필요한 값(공인 IP, nip.io 호스트)만 출력한다.
