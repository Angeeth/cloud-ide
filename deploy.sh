#!/usr/bin/env bash
# ==============================================================================
# Mirage IDE — Automated GCP Deployment Orchestrator
# ==============================================================================
# Usage:
#   ./deploy.sh              Full deployment (Terraform plan/apply + Docker images + Frontend)
#   ./deploy.sh all          Same as above
#   ./deploy.sh app          Update microservice containers & frontend (skips Terraform)
#   ./deploy.sh service <n>  Update a single microservice (e.g. ./deploy.sh service file-service)
#   ./deploy.sh frontend     Build & upload React frontend only
#   ./deploy.sh verify       Run health checks against the deployed application
#   ./deploy.sh destroy      Safely tear down all GCP infrastructure to stop billing
# ==============================================================================

set -eo pipefail

# Text styles
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

log_info() { echo -e "${CYAN}${BOLD}[INFO]${RESET} $1"; }
log_success() { echo -e "${GREEN}${BOLD}[SUCCESS]${RESET} $1"; }
log_warn() { echo -e "${YELLOW}${BOLD}[WARNING]${RESET} $1"; }
log_error() { echo -e "${RED}${BOLD}[ERROR]${RESET} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/terraform"

# All 10 backend microservices with their listening ports
SERVICES=(
  "api-gateway:8000"
  "auth-service:8001"
  "project-service:8002"
  "file-service:8003"
  "import-service:8004"
  "execution-service:8005"
  "terminal-service:8006"
  "collaboration-service:8007"
  "chat-service:8008"
  "history-service:8009"
)

# ------------------------------------------------------------------------------
# 1. Dependency Verification
# ------------------------------------------------------------------------------
check_prerequisites() {
  log_info "Verifying required tools..."

  local missing_tools=()
  for cmd in gcloud docker npm; do
    if ! command -v "$cmd" &>/dev/null; then
      missing_tools+=("$cmd")
    fi
  done

  # Verify real terraform binary (Cloud Shell provides a placeholder script if not installed)
  if ! terraform version 2>&1 | grep -qi "Terraform v"; then
    missing_tools+=("terraform (real binary not installed)")
  fi

  if [ ${#missing_tools[@]} -gt 0 ]; then
    log_error "Missing required tools: ${missing_tools[*]}"
    echo "Please install the missing tools before proceeding."
    exit 1
  fi

  if [ ! -f "${TERRAFORM_DIR}/terraform.tfvars" ]; then
    log_error "Missing '${TERRAFORM_DIR}/terraform.tfvars'!"
    echo "Please create it from the example file:"
    echo "  cp ${TERRAFORM_DIR}/terraform.tfvars.example ${TERRAFORM_DIR}/terraform.tfvars"
    echo "and edit it with your actual GCP Project ID and database credentials."
    exit 1
  fi

  log_success "All prerequisite tools and configuration files verified."
}

# ------------------------------------------------------------------------------
# 2. Extract Terraform Configuration & Outputs
# ------------------------------------------------------------------------------
load_terraform_outputs() {
  log_info "Reading Terraform outputs..."
  pushd "${TERRAFORM_DIR}" > /dev/null

  if ! terraform output -json > /tmp/mirage_tf_outputs.json 2>/dev/null; then
    log_error "Could not read Terraform outputs. Has 'terraform apply' succeeded?"
    popd > /dev/null
    exit 1
  fi

  PROJECT_ID=$(gcloud config get-value project 2>/dev/null || grep -E '^\s*project_id\s*=' terraform.tfvars | cut -d'"' -f2)
  REGION=$(grep -E '^\s*region\s*=' terraform.tfvars | cut -d'"' -f2 || echo "us-central1")
  ZONE=$(grep -E '^\s*zone\s*=' terraform.tfvars | cut -d'"' -f2 || echo "us-central1-a")
  DB_USER=$(grep -E '^\s*db_user\s*=' terraform.tfvars | cut -d'"' -f2 || echo "mirage_user")
  DB_PASS=$(grep -E '^\s*db_password\s*=' terraform.tfvars | cut -d'"' -f2 || echo "MirageSecurePass2026!")
  DB_NAME=$(grep -E '^\s*db_name\s*=' terraform.tfvars | cut -d'"' -f2 || echo "mirage_db")
  JWT_SECRET=$(grep -E '^\s*jwt_secret_key\s*=' terraform.tfvars | cut -d'"' -f2 || echo "mirage_super_secret_jwt_key_dev_mode_only_2026")

  LB_IP=$(python3 -c "import json; d=json.load(open('/tmp/mirage_tf_outputs.json')); print(d.get('load_balancer_ip', {}).get('value', ''))")
  FRONTEND_BUCKET=$(python3 -c "import json; d=json.load(open('/tmp/mirage_tf_outputs.json')); print(d.get('frontend_bucket_name', {}).get('value', ''))")
  PROJECTS_BUCKET=$(python3 -c "import json; d=json.load(open('/tmp/mirage_tf_outputs.json')); print(d.get('project_files_bucket_name', {}).get('value', ''))")
  HISTORY_BUCKET=$(python3 -c "import json; d=json.load(open('/tmp/mirage_tf_outputs.json')); print(d.get('version_history_bucket_name', {}).get('value', ''))")
  REGISTRY_REPO=$(python3 -c "import json; d=json.load(open('/tmp/mirage_tf_outputs.json')); print(d.get('artifact_registry_repository_url', {}).get('value', ''))")

  popd > /dev/null

  if [ -z "$REGISTRY_REPO" ]; then
    REGISTRY_REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/mirage-images"
  fi

  log_info "Deployment Target: Project=${BOLD}${PROJECT_ID}${RESET}, Region=${BOLD}${REGION}${RESET}, Zone=${BOLD}${ZONE}${RESET}"
  log_info "Registry: ${REGISTRY_REPO}"
  log_info "Load Balancer IP: ${LB_IP}"
}

# ------------------------------------------------------------------------------
# 3. Infrastructure Provisioning (Terraform Plan & Apply)
# ------------------------------------------------------------------------------
provision_infrastructure() {
  log_info "Initializing and validating Terraform configuration..."
  pushd "${TERRAFORM_DIR}" > /dev/null

  terraform init
  terraform validate

  echo ""
  log_info "Generating Terraform execution plan (using concurrency=2 to prevent Cloud Shell network drops)..."
  export TF_CLI_ARGS_plan="-parallelism=2"
  export TF_CLI_ARGS_apply="-parallelism=2"
  export TF_CLI_ARGS_refresh="-parallelism=2"
  terraform plan -parallelism=2 -out=mirage.tfplan

  echo ""
  log_warn "Review the Terraform execution plan above."
  read -p "Do you want to apply this plan to create/update your GCP infrastructure? [y/N]: " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    log_warn "Deployment cancelled by user. No resources were modified."
    popd > /dev/null
    exit 0
  fi

  log_info "Applying Terraform execution plan..."
  terraform apply -parallelism=2 mirage.tfplan
  rm -f mirage.tfplan

  popd > /dev/null
  log_success "Google Cloud infrastructure successfully provisioned!"
}

# ------------------------------------------------------------------------------
# 4. Build & Push Docker Images
# ------------------------------------------------------------------------------
build_and_push_service() {
  local svc=$1
  local image_tag="${REGISTRY_REPO}/${svc}:latest"

  log_info "Building Docker image for ${BOLD}${svc}${RESET}..."
  export BUILDX_NO_DEFAULT_ATTESTATIONS=1
  docker build --provenance=false -f "services/${svc}/Dockerfile" -t "${image_tag}" .

  log_info "Pushing ${svc} to Google Artifact Registry..."
  local attempts=0
  until docker push "${image_tag}"; do
    attempts=$((attempts + 1))
    if [ $attempts -ge 3 ]; then
      log_error "Failed to push ${svc} after 3 attempts."
      return 1
    fi
    log_warn "Push failed (retrying in 5 seconds)..."
    sleep 5
  done
  log_success "Pushed ${svc} successfully."
}

build_and_push_all_images() {
  if [ -f "${SCRIPT_DIR}/cloudbuild.yaml" ]; then
    log_info "Submitting build to Google Cloud Build (runs directly on Google Cloud with zero network throttle)..."
    gcloud services enable cloudbuild.googleapis.com --quiet || true
    gcloud builds submit --config="${SCRIPT_DIR}/cloudbuild.yaml" \
      --substitutions="_REGISTRY=${REGISTRY_REPO}" \
      "${SCRIPT_DIR}"
    log_success "All 10 microservice container images built and pushed via Google Cloud Build!"
    return 0
  fi

  log_info "Authenticating Docker with Google Artifact Registry..."
  rm -f ~/.docker/config.json
  gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin "https://${REGION}-docker.pkg.dev"

  log_info "Building and pushing all 10 microservice Docker images..."
  for entry in "${SERVICES[@]}"; do
    local svc="${entry%%:*}"
    build_and_push_service "$svc"
  done
  log_success "All microservice container images successfully pushed to Artifact Registry."
}

# ------------------------------------------------------------------------------
# 5. Deploy Containers onto Compute Engine VMs via IAP SSH
# ------------------------------------------------------------------------------
deploy_container_to_vm() {
  local svc=$1
  local port=$2
  local vm_name="mirage-${svc}"
  local image_tag="${REGISTRY_REPO}/${svc}:latest"

  log_info "Deploying container on ${BOLD}${vm_name}${RESET} (Port ${port})..."

  # Base environment variables
  local env_args="-e SERVICE_NAME=${svc} -e PORT=${port} -e SECRET_KEY=${JWT_SECRET}"

  # Inter-service connection URLs (Private VPC IPs)
  env_args+=" -e AUTH_SERVICE_URL=http://10.0.1.11:8001"
  env_args+=" -e PROJECT_SERVICE_URL=http://10.0.1.12:8002"
  env_args+=" -e FILE_SERVICE_URL=http://10.0.1.13:8003"
  env_args+=" -e IMPORT_SERVICE_URL=http://10.0.1.14:8004"
  env_args+=" -e EXECUTION_SERVICE_URL=http://10.0.1.15:8005"
  env_args+=" -e TERMINAL_SERVICE_URL=http://10.0.1.16:8006"
  env_args+=" -e COLLABORATION_SERVICE_URL=http://10.0.1.17:8007"
  env_args+=" -e COLLABORATION_SERVICE_WS_URL=ws://10.0.1.17:8007"
  env_args+=" -e CHAT_SERVICE_URL=http://10.0.1.18:8008"
  env_args+=" -e CHAT_SERVICE_WS_URL=ws://10.0.1.18:8008"
  env_args+=" -e HISTORY_SERVICE_URL=http://10.0.1.19:8009"

  # Database and Redis URLs
  env_args+=" -e DATABASE_URL=postgresql+psycopg2://${DB_USER}:${DB_PASS}@10.0.1.20:5432/${DB_NAME}"
  env_args+=" -e REDIS_URL=redis://10.0.1.20:6379/0"

  # Storage configuration for file & history services
  if [ "$svc" == "file-service" ]; then
    env_args+=" -e STORAGE_BACKEND=gcs -e USE_LOCAL_STORAGE=false -e GCS_BUCKET_NAME=${PROJECTS_BUCKET} -e GCP_PROJECT_ID=${PROJECT_ID}"
  elif [ "$svc" == "history-service" ]; then
    env_args+=" -e STORAGE_BACKEND=gcs -e USE_LOCAL_STORAGE=false -e GCS_BUCKET_NAME=${HISTORY_BUCKET} -e GCP_PROJECT_ID=${PROJECT_ID}"
  fi

  # Docker socket volume for execution service
  local volume_args=""
  if [ "$svc" == "execution-service" ]; then
    volume_args="-v /var/run/docker.sock:/var/run/docker.sock"
  fi

  # Remote command executed on private VM via IAP
  local remote_cmd="
    sudo gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
    sudo docker pull ${image_tag}
    sudo docker rm -f mirage-${svc} 2>/dev/null || true
    sudo docker run -d \
      --name mirage-${svc} \
      --restart always \
      -p ${port}:${port} \
      ${volume_args} \
      ${env_args} \
      ${image_tag}
  "

  # Pre-pull sandbox images on execution service VM
  if [ "$svc" == "execution-service" ]; then
    remote_cmd+="
      sudo docker pull python:3.11-slim &
      sudo docker pull node:20-alpine &
      sudo docker pull openjdk:17-alpine &
      sudo docker pull gcc:12 &
      wait
    "
  fi

  gcloud compute ssh "${vm_name}" \
    --zone="${ZONE}" \
    --tunnel-through-iap \
    --command="${remote_cmd}"

  log_success "Container mirage-${svc} deployed and running on ${vm_name}."
}

deploy_all_containers() {
  log_info "Deploying container images across all 10 microservice VMs..."
  for entry in "${SERVICES[@]}"; do
    local svc="${entry%%:*}"
    local port="${entry##*:}"
    deploy_container_to_vm "$svc" "$port"
  done
  log_success "All 10 microservice containers deployed successfully."
}

# ------------------------------------------------------------------------------
# 6. Build & Deploy Frontend to Google Cloud Storage
# ------------------------------------------------------------------------------
deploy_frontend() {
  log_info "Building React + Vite frontend..."
  pushd "${SCRIPT_DIR}/frontend" > /dev/null

  npm install
  npm run build

  if [ -z "$FRONTEND_BUCKET" ]; then
    load_terraform_outputs
  fi

  log_info "Syncing static distribution files to GCS bucket 'gs://${FRONTEND_BUCKET}'..."
  gcloud storage rsync -r dist/ "gs://${FRONTEND_BUCKET}/"

  popd > /dev/null
  log_success "Frontend single page application deployed successfully to Cloud Storage + CDN."
}

# ------------------------------------------------------------------------------
# 7. Post-Deployment Verification & Health Check
# ------------------------------------------------------------------------------
verify_deployment() {
  load_terraform_outputs

  log_info "Verifying deployment health via Load Balancer IP: ${BOLD}${LB_IP}${RESET}..."
  local health_url="http://${LB_IP}/api/health"

  log_info "Querying ${health_url} (waiting for Load Balancer propagation)..."
  local attempts=0
  local max_attempts=12

  while [ $attempts -lt $max_attempts ]; do
    attempts=$((attempts + 1))
    local response
    response=$(curl -s -m 5 "${health_url}" || true)

    if echo "$response" | grep -q '"gateway":"healthy"'; then
      echo ""
      log_success "API Gateway and downstream microservices responded healthy!"
      echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
      break
    else
      echo -n "."
      sleep 10
    fi
  done

  echo ""
  echo "=========================================================================="
  log_success "Mirage IDE Deployment is Active!"
  echo "=========================================================================="
  echo -e "Web Application URL:    ${CYAN}${BOLD}http://${LB_IP}${RESET}"
  echo -e "API Documentation:      ${CYAN}${BOLD}http://${LB_IP}/api/docs${RESET}"
  echo -e "Aggregate Health URL:   ${CYAN}${BOLD}http://${LB_IP}/api/health${RESET}"
  echo -e "Frontend Cloud Storage: ${BOLD}gs://${FRONTEND_BUCKET}${RESET}"
  echo "=========================================================================="
}

# ------------------------------------------------------------------------------
# 8. Safe Infrastructure Teardown (Destroy)
# ------------------------------------------------------------------------------
destroy_infrastructure() {
  log_warn "=========================================================================="
  log_warn "CRITICAL ACTION: You are about to DESTROY all Google Cloud infrastructure!"
  log_warn "This will delete all 11 VMs, Persistent Disks, Load Balancer, and Buckets."
  log_warn "=========================================================================="
  echo ""
  read -p "To confirm destruction, type 'DESTROY' in capital letters: " confirmation

  if [ "$confirmation" != "DESTROY" ]; then
    log_info "Teardown aborted. No resources were deleted."
    exit 0
  fi

  log_info "Initiating Terraform destruction..."
  pushd "${TERRAFORM_DIR}" > /dev/null
  terraform destroy
  popd > /dev/null
  log_success "All GCP infrastructure has been deleted. Active billing has stopped."
}

# ------------------------------------------------------------------------------
# Main Dispatcher
# ------------------------------------------------------------------------------
main() {
  local action="${1:-all}"

  case "$action" in
    all|"")
      check_prerequisites
      provision_infrastructure
      load_terraform_outputs
      build_and_push_all_images
      deploy_all_containers
      deploy_frontend
      verify_deployment
      ;;
    app)
      check_prerequisites
      load_terraform_outputs
      build_and_push_all_images
      deploy_all_containers
      deploy_frontend
      verify_deployment
      ;;
    service)
      local target_svc="$2"
      if [ -z "$target_svc" ]; then
        log_error "Please specify a service name. Example: ./deploy.sh service file-service"
        exit 1
      fi
      check_prerequisites
      load_terraform_outputs

      local found=false
      for entry in "${SERVICES[@]}"; do
        local svc="${entry%%:*}"
        local port="${entry##*:}"
        if [ "$svc" == "$target_svc" ]; then
          found=true
          build_and_push_service "$svc"
          deploy_container_to_vm "$svc" "$port"
          break
        fi
      done
      if [ "$found" = false ]; then
        log_error "Service '${target_svc}' not found among valid services: ${SERVICES[*]}"
        exit 1
      fi
      ;;
    frontend)
      check_prerequisites
      load_terraform_outputs
      deploy_frontend
      ;;
    verify)
      check_prerequisites
      verify_deployment
      ;;
    destroy)
      check_prerequisites
      destroy_infrastructure
      ;;
    *)
      echo "Mirage IDE Deployment Orchestrator"
      echo "Usage: $0 [all|app|service <name>|frontend|verify|destroy]"
      exit 1
      ;;
  esac
}

main "$@"
