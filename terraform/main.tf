# ==============================================================================
# Mirage IDE — Main Infrastructure Composition & Service Accounts
# ==============================================================================

# Random suffix for globally unique Cloud Storage bucket names
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# Dedicated Least-Privilege Service Account for all Mirage IDE Compute Engine VMs
resource "google_service_account" "mirage_vm_sa" {
  account_id   = "mirage-vm-sa"
  display_name = "Mirage IDE VM Service Account"
  description  = "Service account used by Mirage IDE microservice VMs to access Cloud Storage, Artifact Registry, and Cloud Logging"
}

# Grant permissions to write logs to Google Cloud Logging
resource "google_project_iam_member" "vm_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.mirage_vm_sa.email}"
}

# Grant permissions to write monitoring metrics to Google Cloud Monitoring
resource "google_project_iam_member" "vm_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.mirage_vm_sa.email}"
}

# Grant permissions to pull Docker images from Artifact Registry
resource "google_project_iam_member" "vm_artifact_registry" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.mirage_vm_sa.email}"
}

# Grant permissions to read and write project files and snapshots in Cloud Storage
resource "google_project_iam_member" "vm_storage_admin" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.mirage_vm_sa.email}"
}
