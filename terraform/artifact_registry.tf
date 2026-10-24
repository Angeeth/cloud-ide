# ==============================================================================
# Mirage IDE — Google Artifact Registry (Docker Container Repository)
# ==============================================================================

resource "google_artifact_registry_repository" "docker_repo" {
  location      = var.region
  repository_id = "mirage-images"
  description   = "Docker repository hosting Mirage IDE backend microservices and language execution sandbox images"
  format        = "DOCKER"

  labels = merge(var.labels, {
    purpose = "container-registry"
  })
}
