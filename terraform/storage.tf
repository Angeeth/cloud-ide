# ==============================================================================
# Mirage IDE — Google Cloud Storage (GCS) Buckets
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Frontend Static Assets Bucket (React + Vite Build Artifacts)
# ------------------------------------------------------------------------------
resource "google_storage_bucket" "frontend" {
  name                        = "mirage-frontend-${var.environment}-${random_id.bucket_suffix.hex}"
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true
  storage_class               = "STANDARD"

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD", "OPTIONS"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  labels = merge(var.labels, {
    bucket_type = "frontend-static"
  })
}

# Allow public read access to static frontend assets via Cloud Load Balancer / CDN
resource "google_storage_bucket_iam_member" "frontend_public_read" {
  bucket = google_storage_bucket.frontend.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# ------------------------------------------------------------------------------
# 2. Project Files Persistent Storage Bucket
# ------------------------------------------------------------------------------
resource "google_storage_bucket" "project_files" {
  name                        = "mirage-projects-${var.environment}-${random_id.bucket_suffix.hex}"
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true
  storage_class               = "STANDARD"

  versioning {
    enabled = true
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  labels = merge(var.labels, {
    bucket_type = "project-source-files"
  })
}

# ------------------------------------------------------------------------------
# 3. Version History & Snapshot Archives Bucket
# ------------------------------------------------------------------------------
resource "google_storage_bucket" "version_history" {
  name                        = "mirage-history-${var.environment}-${random_id.bucket_suffix.hex}"
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true
  storage_class               = "STANDARD"

  labels = merge(var.labels, {
    bucket_type = "version-snapshots"
  })
}

# ------------------------------------------------------------------------------
# 4. Temporary Uploads Staging Bucket (Auto-cleanup after 3 days)
# ------------------------------------------------------------------------------
resource "google_storage_bucket" "temp_uploads" {
  name                        = "mirage-temp-uploads-${var.environment}-${random_id.bucket_suffix.hex}"
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true
  storage_class               = "STANDARD"

  lifecycle_rule {
    condition {
      age = 3 # Automatically delete temp archives after 3 days
    }
    action {
      type = "Delete"
    }
  }

  labels = merge(var.labels, {
    bucket_type = "temporary-uploads"
  })
}
