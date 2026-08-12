@description('AKS — Workload Identity(OIDC) 활성화, Container Insights 연동, kubelet identity에 ACR pull 권한 부여. System/User 노드풀 분리(AKS 권장 패턴): System은 CriticalAddonsOnly taint로 kube-system 전용, User는 taint 없이 앱 워크로드 전용이라 기존 파드 스펙에 toleration을 안 넣어도 자동으로 User에 스케줄된다.')
param location string
param namePrefix string
param tags object = {}
param acrName string
param logAnalyticsWorkspaceId string

@description('System 노드풀 VM 사이즈 — kube-system 코어 파드만 돌아서 저비용 사이즈로 충분')
param systemNodeVmSize string = 'Standard_B2s'

@description('User 노드풀 VM 사이즈 — 실제 앱 워크로드(gateway/T4 워커/rag-cronjob/CPU TCN 추론)가 도는 곳. 설계 문서의 리소스 사이징 기조(Postgres Burstable B1ms, ACR Basic, GPU 워크로드 0~N 등 전부 최소 사양)를 따라 D2s_v5 유지 — 부족하면 나중에 노드풀 추가로 사이즈업')
param userNodeVmSize string = 'Standard_D2s_v5'

@description('User 노드풀 오토스케일 최소/최대 노드 수. 평소엔 1로 시작해 저비용 유지하고, 발표일 최대 25명 동시접속\n예상 시엔 오토스케일이 반응하길 기다리지 말고(노드 기동 2~5분 지연) 데모 시작 전에 미리 min/maxCount를\n수동으로 올려두고(예: az aks nodepool update --update-cluster-autoscaler) 끝나면 다시 낮출 것. maxCount\n천장은 여유 있게 잡아둠(실제로 안 쓰면 비용 영향 없음)')
param userMinCount int = 1
param userMaxCount int = 6

param kubernetesVersion string = '1.35' // 1.30은 2026-08 기준 AKS 지원 종료됨(최신 3개 마이너만 지원) — 안정화된 최신판으로
param backendServiceAccountName string = 'backend-sa'

@description('Workload Identity federated credential을 만들 네임스페이스 목록. backend Deployment와 rag-cronjob이 각 네임스페이스에서 동일한 서비스어카운트 이름을 쓰므로 네임스페이스당 1개씩 필요')
param backendNamespaces array = [
  'staging'
  'production'
]

@description('kubectl 접근용 AAD RBAC 클러스터 관리자로 등록할 Azure AD 오브젝트 ID 목록. az ad signed-in-user show --query id -o tsv로 본인 것 확인 후 채울 것')
param clusterAdminPrincipalIds array = []

@description('ArgoCD Image Updater가 도는 네임스페이스. infra/k8s/argocd/README.md의 설치 절차 기준(kubectl create namespace argocd)')
param argocdNamespace string = 'argocd'

@description('업스트림 argocd-image-updater 설치 매니페스트의 기본 ServiceAccount 이름 — 실배포 후 실제 매니페스트와 일치하는지 확인 필요(버전에 따라 바뀔 수 있음)')
param imageUpdaterServiceAccountName string = 'argocd-image-updater'

resource acr 'Microsoft.ContainerRegistry/registries@2026-03-01-preview' existing = {
  name: acrName
}

resource aks 'Microsoft.ContainerService/managedClusters@2026-04-02-preview' = {
  name: '${namePrefix}-aks'
  location: location
  tags: tags
  // Free 티어 — 컨트롤플레인 SLA(Standard/Premium 유료)가 20일짜리 데모 프로젝트엔 불필요
  sku: {
    name: 'Base'
    tier: 'Free'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: '${namePrefix}-aks'
    kubernetesVersion: kubernetesVersion
    agentPoolProfiles: [
      {
        name: 'system'
        mode: 'System'
        count: 1
        vmSize: systemNodeVmSize
        osType: 'Linux'
        enableAutoScaling: false
        nodeTaints: [
          'CriticalAddonsOnly=true:NoSchedule'
        ]
      }
      {
        name: 'user'
        mode: 'User'
        count: userMinCount
        vmSize: userNodeVmSize
        osType: 'Linux'
        enableAutoScaling: true
        minCount: userMinCount
        maxCount: userMaxCount
      }
    ]
    networkProfile: {
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      loadBalancerSku: 'standard' // outbound는 기본(loadBalancer) 유지 — NAT Gateway 낼 트래픽 규모 아님
      networkPolicy: 'none' // 워크로드 3종뿐이라 파드 간 격리 요구 없음, 불필요한 복잡도
    }
    // API 서버는 공개 유지(apiServerAccessProfile 미설정) — Storage IP 화이트리스트 검토와 동일 결론
    // (팀원 IP가 바뀌면 계속 관리해야 하는 부담이 이득보다 큼). private cluster는 VNet 없어서 선택지 아님.
    oidcIssuerProfile: {
      enabled: true
    }
    // kubectl 접근을 정적 로컬 kubeconfig 대신 Azure AD RBAC로 — 이 프로젝트 전체의 "정적 자격증명 대신
    // AAD/Managed Identity" 원칙과 통일. disableLocalAccounts는 일부러 안 켬 — AAD 권한 부여가 잘못돼도
    // 구독 Owner/Contributor면 az aks get-credentials --admin으로 항상 복구 가능하게 비상 통로를 남겨둠
    aadProfile: {
      managed: true
      enableAzureRBAC: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
      // Defender for Containers는 스킵 — 유료 애드온인데 이 프로젝트 위협 모델(민감 데이터 없는 20일 데모)엔
      // 비용 대비 이득이 없음
    }
    // 20일짜리 프로젝트에서 자동 버전 업그레이드/노드 교체가 데모 직전에 터지는 걸 방지 — K8s 버전, 노드 OS 둘 다 수동으로만
    autoUpgradeProfile: {
      upgradeChannel: 'none'
      nodeOSUpgradeChannel: 'None'
    }
    addonProfiles: {
      omsagent: {
        enabled: true
        config: {
          logAnalyticsWorkspaceResourceId: logAnalyticsWorkspaceId
        }
      }
      azurepolicy: {
        enabled: false // 2인 팀 20일 프로젝트엔 정책 거버넌스 불필요 — 빠뜨린 게 아니라 명시적으로 안 씀
      }
      // k8s 매니페스트(backend/rag-cronjob의 secretproviderclass.yaml)가 이미 이 방식(CSI 드라이버가 KV 시크릿을
      // 파일로 마운트)을 전제로 짜여 있는데 이 애드온이 빠져 있었음 — 추가 안 하면 그 리소스들이 아예 동작 안 함
      azureKeyvaultSecretsProvider: {
        enabled: true
        config: {
          enableSecretRotation: 'true'
          rotationPollInterval: '2m'
        }
      }
    }
    // 노드 자동 프로비전(NAP/Karpenter 스타일)은 안 씀 — System/User 노드풀을 이미 의도적으로 수동 설계했고
    // (taint 기반 분리, 사이즈 선정 근거 있음), NAP를 켜면 이 설계가 사실상 무시되고 자동 판단으로 대체됨
  }
}

// kubelet identity에 이 ACR에 대한 AcrPull만 부여 (리소스그룹 전체 아님)
resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, aks.id, 'AcrPull')
  scope: acr
  properties: {
    principalId: aks.properties.identityProfile.kubeletidentity.objectId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalType: 'ServicePrincipal'
  }
}

// 백엔드 워크로드용 User Assigned Managed Identity + Workload Identity 페더레이션
// (파드가 이 identity로 Key Vault/Azure OpenAI 등을 직접 호출, 시크릿 없이)
resource backendIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2025-05-31-preview' = {
  name: '${namePrefix}-backend-id'
  location: location
  tags: tags
}

// 네임스페이스(staging/production)당 1개씩 — backend Deployment와 rag-cronjob이 같은 서비스어카운트 이름을 공유하므로
// 네임스페이스 단위로만 federation을 나누면 됨(워크로드별로 나눌 필요 없음)
resource federatedCredentials 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2025-05-31-preview' = [for ns in backendNamespaces: {
  parent: backendIdentity
  name: 'backend-sa-federation-${ns}'
  properties: {
    issuer: aks.properties.oidcIssuerProfile.issuerURL
    subject: 'system:serviceaccount:${ns}:${backendServiceAccountName}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}]

// ArgoCD Image Updater용 User Assigned Managed Identity + Workload Identity 페더레이션
// (ACR 태그 목록 조회 전용 — static docker-registry secret 대신, backend/kubelet과 동일하게 무자격증명 인증으로 통일)
resource imageUpdaterIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2025-05-31-preview' = {
  name: '${namePrefix}-image-updater-id'
  location: location
  tags: tags
}

resource imageUpdaterFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2025-05-31-preview' = {
  parent: imageUpdaterIdentity
  name: 'image-updater-sa-federation'
  properties: {
    issuer: aks.properties.oidcIssuerProfile.issuerURL
    subject: 'system:serviceaccount:${argocdNamespace}:${imageUpdaterServiceAccountName}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

// image-updater identity에도 이 ACR에 대한 AcrPull만 부여 (kubelet과 동일 스코프, 리소스그룹 전체 아님)
resource imageUpdaterAcrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, imageUpdaterIdentity.id, 'AcrPull')
  scope: acr
  properties: {
    principalId: imageUpdaterIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalType: 'ServicePrincipal'
  }
}

// 배포 완료 즉시 지정된 AAD 계정에 클러스터 admin 권한 부여 — 별도 수동 단계로 미루면 그 사이 아무도 못 들어가는 창이 생김
resource clusterAdminRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principalId in clusterAdminPrincipalIds: {
  name: guid(aks.id, principalId, 'AksRbacClusterAdmin')
  scope: aks
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b') // Azure Kubernetes Service RBAC Cluster Admin
    principalType: 'User'
  }
}]

output aksName string = aks.name
output oidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL
output backendIdentityClientId string = backendIdentity.properties.clientId
output backendIdentityPrincipalId string = backendIdentity.properties.principalId
output imageUpdaterIdentityClientId string = imageUpdaterIdentity.properties.clientId
