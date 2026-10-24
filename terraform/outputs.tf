# ==============================================================================
# Mirage IDE — Terraform Infrastructure Outputs
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Ingress & Application Access
# ------------------------------------------------------------------------------
output "load_balancer_ip" {
  description = "The reserved global public IPv4 address of the Mirage IDE Load Balancer"
  value       = google_compute_global_address.lb_ip.address
}

output "application_url" {
  description = "Public URL to access the Mirage IDE browser web application"
  value       = var.enable_ssl && var.domain_name != "" ? "https://${var.domain_name}" : "http://${google_compute_global_address.lb_ip.address}"
}

output "api_health_check_url" {
  description = "Public URL to verify the API Gateway status and aggregate downstream microservice health"
  value       = "http://${google_compute_global_address.lb_ip.address}/api/health"
}

# ------------------------------------------------------------------------------
# 2. Google Cloud Storage Buckets
# ------------------------------------------------------------------------------
output "frontend_bucket_name" {
  description = "Cloud Storage bucket name for uploading the compiled frontend distribution (dist/)"
  value       = google_storage_bucket.frontend.name
}

output "project_files_bucket_name" {
  description = "Cloud Storage bucket name storing persistent project source files"
  value       = google_storage_bucket.project_files.name
}

output "version_history_bucket_name" {
  description = "Cloud Storage bucket name storing version snapshots and rollback history"
  value       = google_storage_bucket.version_history.name
}

output "temp_uploads_bucket_name" {
  description = "Cloud Storage bucket name for staging ZIP uploads (auto-purged after 3 days)"
  value       = google_storage_bucket.temp_uploads.name
}

# ------------------------------------------------------------------------------
# 3. Artifact Registry (Docker Images)
# ------------------------------------------------------------------------------
output "artifact_registry_repository_url" {
  description = "Base Docker repository path for tagging and pushing container images"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo.name}"
}

# ------------------------------------------------------------------------------
# 4. Database Connection Details (Private Network)
# ------------------------------------------------------------------------------
output "postgres_internal_ip" {
  description = "Private internal IP address of the dedicated PostgreSQL VM"
  value       = google_compute_instance.postgres_db.network_interface[0].network_ip
}

output "postgres_connection_string" {
  description = "Internal SQLAlchemy connection string used by backend microservices"
  value       = "postgresql://${var.db_user}:${var.db_password}@${google_compute_instance.postgres_db.network_interface[0].network_ip}:5432/${var.db_name}"
  sensitive   = true
}

# ------------------------------------------------------------------------------
# 5. Microservice Internal Private IPs
# ------------------------------------------------------------------------------
output "microservice_internal_ips" {
  description = "Assigned private static IP addresses for each microservice VM"
  value = {
    for service, instance in google_compute_instance.microservices :
    service => instance.network_interface[0].network_ip
  }
}

# ------------------------------------------------------------------------------
# 6. Helpful Administrative SSH Commands (via Identity-Aware Proxy)
# ------------------------------------------------------------------------------
output "ssh_commands" {
  description = "Convenient gcloud SSH commands to connect to private VMs using Identity-Aware Proxy (no public IP required)"
  value = {
    api_gateway = "gcloud compute ssh mirage-api-gateway --zone=${var.zone} --tunnel-through-iap"
    database    = "gcloud compute ssh mirage-postgres-db --zone=${var.zone} --tunnel-through-iap"
    execution   = "gcloud compute ssh mirage-execution-service --zone=${var.zone} --tunnel-through-iap"
  }
}
