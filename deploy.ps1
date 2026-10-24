# ==============================================================================
# Mirage IDE — Automated GCP Deployment Orchestrator for Windows PowerShell
# ==============================================================================
# Usage:
#   .\deploy.ps1              Full deployment (Terraform plan/apply + Docker images + Frontend)
#   .\deploy.ps1 -Action app  Update microservice containers & frontend (skips Terraform)
#   .\deploy.ps1 -Action service -Service file-service  Update a single microservice
#   .\deploy.ps1 -Action frontend                       Build & upload frontend only
#   .\deploy.ps1 -Action verify                         Run health checks
#   .\deploy.ps1 -Action destroy                        Safely tear down all GCP infrastructure
# ==============================================================================

param (
    [ValidateSet("all", "app", "service", "frontend", "verify", "destroy")]
    [string]$Action = "all",
    [string]$Service = ""
)

$ErrorActionPreference = "Stop"

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARNING] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TerraformDir = Join-Path $ScriptDir "terraform"

$ServicesMap = @{
    "api-gateway"           = 8000
    "auth-service"          = 8001
    "project-service"       = 8002
    "file-service"          = 8003
    "import-service"        = 8004
    "execution-service"     = 8005
    "terminal-service"      = 8006
    "collaboration-service" = 8007
    "chat-service"          = 8008
    "history-service"       = 8009
}

function Check-Prerequisites {
    Write-Info "Verifying required tools on Windows..."
    $tools = @("gcloud", "terraform", "docker", "npm")
    foreach ($tool in $tools) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            Write-Err "Missing required tool: $tool. Please install it before proceeding."
            exit 1
        }
    }

    $tfvars = Join-Path $TerraformDir "terraform.tfvars"
    if (-not (Test-Path $tfvars)) {
        Write-Err "Missing 'terraform\terraform.tfvars'!"
        Write-Host "Please create it from the example file:"
        Write-Host "  Copy-Item terraform\terraform.tfvars.example terraform\terraform.tfvars"
        exit 1
    }
    Write-Success "Prerequisite tools verified."
}

function Get-TfOutputs {
    Push-Location $TerraformDir
    try {
        $jsonStr = terraform output -json
        $outputs = $jsonStr | ConvertFrom-Json
        return $outputs
    } finally {
        Pop-Location
    }
}

function Provision-Infrastructure {
    Write-Info "Initializing and validating Terraform..."
    Push-Location $TerraformDir
    try {
        terraform init
        terraform validate
        Write-Info "Generating Terraform execution plan..."
        terraform plan -out=mirage.tfplan

        Write-Warn "Review the Terraform execution plan above."
        $confirm = Read-Host "Do you want to apply this plan to create/update your GCP infrastructure? (y/N)"
        if ($confirm -notmatch "^[Yy]$") {
            Write-Warn "Deployment cancelled by user. No resources modified."
            exit 0
        }

        terraform apply mirage.tfplan
        Remove-Item "mirage.tfplan" -ErrorAction SilentlyContinue
        Write-Success "Infrastructure provisioned successfully."
    } finally {
        Pop-Location
    }
}

function Build-And-Push-Service($svc, $registryRepo) {
    $tag = "$registryRepo/${svc}:latest"
    Write-Info "Building Docker image for $svc..."
    docker build -f "services/$svc/Dockerfile" -t $tag .
    Write-Info "Pushing $svc to Google Artifact Registry..."
    docker push $tag
    Write-Success "Pushed $svc successfully."
}

function Deploy-Service-To-VM($svc, $port, $registryRepo, $zone, $tfOutputs) {
    $vmName = "mirage-$svc"
    $tag = "$registryRepo/${svc}:latest"
    $jwtSecret = "mirage_super_secret_jwt_key_dev_mode_only_2026"
    $dbPass = "MirageSecurePass2026!"
    $projectsBucket = $tfOutputs.project_files_bucket_name.value
    $historyBucket = $tfOutputs.version_history_bucket_name.value
    $projectId = (gcloud config get-value project 2>$null).Trim()

    Write-Info "Deploying container to $vmName on Port $port..."

    $envStr = "-e SERVICE_NAME=$svc -e PORT=$port -e SECRET_KEY=$jwtSecret " +
              "-e AUTH_SERVICE_URL=http://10.0.1.11:8001 -e PROJECT_SERVICE_URL=http://10.0.1.12:8002 " +
              "-e FILE_SERVICE_URL=http://10.0.1.13:8003 -e IMPORT_SERVICE_URL=http://10.0.1.14:8004 " +
              "-e EXECUTION_SERVICE_URL=http://10.0.1.15:8005 -e TERMINAL_SERVICE_URL=http://10.0.1.16:8006 " +
              "-e COLLABORATION_SERVICE_URL=http://10.0.1.17:8007 -e COLLABORATION_SERVICE_WS_URL=ws://10.0.1.17:8007 " +
              "-e CHAT_SERVICE_URL=http://10.0.1.18:8008 -e CHAT_SERVICE_WS_URL=ws://10.0.1.18:8008 " +
              "-e HISTORY_SERVICE_URL=http://10.0.1.19:8009 " +
              "-e DATABASE_URL=postgresql+psycopg2://mirage_user:${dbPass}@10.0.1.20:5432/mirage_db " +
              "-e REDIS_URL=redis://10.0.1.20:6379/0 "

    if ($svc -eq "file-service") {
        $envStr += "-e STORAGE_BACKEND=gcs -e USE_LOCAL_STORAGE=false -e GCS_BUCKET_NAME=$projectsBucket -e GCP_PROJECT_ID=$projectId "
    } elseif ($svc -eq "history-service") {
        $envStr += "-e STORAGE_BACKEND=gcs -e USE_LOCAL_STORAGE=false -e GCS_BUCKET_NAME=$historyBucket -e GCP_PROJECT_ID=$projectId "
    }

    $volStr = ""
    if ($svc -eq "execution-service") {
        $volStr = "-v /var/run/docker.sock:/var/run/docker.sock"
    }

    $remoteCmd = "sudo gcloud auth configure-docker us-central1-docker.pkg.dev --quiet; " +
                 "sudo docker pull $tag; " +
                 "sudo docker rm -f mirage-$svc 2>/dev/null || true; " +
                 "sudo docker run -d --name mirage-$svc --restart always -p ${port}:${port} $volStr $envStr $tag"

    gcloud compute ssh $vmName --zone=$zone --tunnel-through-iap --command=$remoteCmd
    Write-Success "Service $svc deployed to $vmName."
}

function Deploy-Frontend($frontendBucket) {
    Write-Info "Building React + Vite frontend..."
    Push-Location (Join-Path $ScriptDir "frontend")
    try {
        npm install
        npm run build
        Write-Info "Uploading static files to gs://$frontendBucket/..."
        gcloud storage rsync -r dist/ "gs://$frontendBucket/"
        Write-Success "Frontend deployed successfully."
    } finally {
        Pop-Location
    }
}

function Verify-Deployment($lbIp) {
    Write-Info "Verifying application status at http://$lbIp/api/health..."
    $url = "http://$lbIp/api/health"
    $maxAttempts = 12
    for ($i = 1; $i -le $maxAttempts; $i++) {
        try {
            $resp = Invoke-RestMethod -Uri $url -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($resp.gateway -eq "healthy") {
                Write-Success "Aggregate API Gateway health check passed!"
                Write-Host ($resp | ConvertTo-Json -Depth 3)
                break
            }
        } catch {
            Write-Host -NoNewline "."
            Start-Sleep -Seconds 10
        }
    }

    Write-Host ""
    Write-Host "==========================================================================" -ForegroundColor Green
    Write-Host "Mirage IDE is Live!" -ForegroundColor Green
    Write-Host "Public Web URL:    http://$lbIp" -ForegroundColor Cyan
    Write-Host "API Documentation: http://$lbIp/api/docs" -ForegroundColor Cyan
    Write-Host "Aggregate Health:  http://$lbIp/api/health" -ForegroundColor Cyan
    Write-Host "==========================================================================" -ForegroundColor Green
}

function Destroy-Infrastructure {
    Write-Warn "CRITICAL: You are about to DESTROY all Google Cloud infrastructure!"
    $confirm = Read-Host "Type 'DESTROY' to confirm"
    if ($confirm -eq "DESTROY") {
        Push-Location $TerraformDir
        try {
            terraform destroy
            Write-Success "All cloud resources destroyed. Active billing stopped."
        } finally {
            Pop-Location
        }
    } else {
        Write-Info "Destruction aborted."
    }
}

# ----------------- Main Execution -----------------
Check-Prerequisites

if ($Action -eq "destroy") {
    Destroy-Infrastructure
    exit 0
}

if ($Action -eq "all") {
    Provision-Infrastructure
}

$tfOutputs = Get-TfOutputs
$lbIp = $tfOutputs.load_balancer_ip.value
$frontendBucket = $tfOutputs.frontend_bucket_name.value
$registryRepo = $tfOutputs.artifact_registry_repository_url.value
$zone = "us-central1-a"

if ($Action -eq "verify") {
    Verify-Deployment $lbIp
    exit 0
}

if ($Action -eq "frontend") {
    Deploy-Frontend $frontendBucket
    exit 0
}

if ($Action -eq "service") {
    if (-not $Service -or -not $ServicesMap.ContainsKey($Service)) {
        Write-Err "Please specify a valid service name via -Service <name>"
        Write-Host "Valid services: $($ServicesMap.Keys -join ', ')"
        exit 1
    }
    Build-And-Push-Service $Service $registryRepo
    Deploy-Service-To-VM $Service $ServicesMap[$Service] $registryRepo $zone $tfOutputs
    exit 0
}

if ($Action -in @("all", "app")) {
    gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
    foreach ($svc in $ServicesMap.Keys) {
        Build-And-Push-Service $svc $registryRepo
        Deploy-Service-To-VM $svc $ServicesMap[$svc] $registryRepo $zone $tfOutputs
    }
    Deploy-Frontend $frontendBucket
    Verify-Deployment $lbIp
}
