variable "project_id" {
  description = "The GCP Project ID where resources will be provisioned"
  type        = string
}

variable "region" {
  description = "The primary GCP region for all regional resources"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "The default GCP zone within the region for zonal resources"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Deployment environment name (e.g. production, staging, demo)"
  type        = string
  default     = "production"
}

variable "labels" {
  description = "Standard resource labels applied to all managed resources"
  type        = map(string)
  default = {
    project     = "mirage-ide"
    managed_by  = "terraform"
    environment = "production"
  }
}

# ==================== Compute Machine Types ====================
variable "machine_type_default" {
  description = "Default machine type for lightweight microservices (auth, project, file, import, terminal, chat, history)"
  type        = string
  default     = "e2-small"
}

variable "machine_type_gateway" {
  description = "Machine type for the central API Gateway VM handling all ingress routing & WebSockets"
  type        = string
  default     = "e2-medium"
}

variable "machine_type_execution" {
  description = "Machine type for the Execution Service VM running isolated Docker sandbox containers"
  type        = string
  default     = "e2-standard-2"
}

variable "machine_type_collaboration" {
  description = "Machine type for the Collaboration Service VM handling live cursor broadcasting"
  type        = string
  default     = "e2-medium"
}

variable "machine_type_database" {
  description = "Machine type for the dedicated PostgreSQL Database VM"
  type        = string
  default     = "e2-medium"
}

variable "db_disk_size_gb" {
  description = "Persistent disk size (in GB) attached to the PostgreSQL Database VM"
  type        = number
  default     = 20
}

# ==================== Database & Secrets ====================
variable "db_name" {
  description = "The PostgreSQL database name for Mirage IDE"
  type        = string
  default     = "mirage_db"
}

variable "db_user" {
  description = "The PostgreSQL database username"
  type        = string
  default     = "mirage_user"
}

variable "db_password" {
  description = "The PostgreSQL database password (kept sensitive and configured via terraform.tfvars)"
  type        = string
  sensitive   = true
  default     = "MirageSecurePass2026!"
}

variable "jwt_secret_key" {
  description = "Secret key used for signing and verifying JWT authentication tokens"
  type        = string
  sensitive   = true
  default     = "mirage_super_secret_jwt_key_dev_mode_only_2026"
}

# ==================== Domain & SSL (Optional) ====================
variable "domain_name" {
  description = "Optional custom domain name for Google-managed SSL (e.g., ide.example.com). Leave empty for HTTP-only demo."
  type        = string
  default     = ""
}

variable "enable_ssl" {
  description = "Whether to provision a Google-managed SSL certificate and HTTPS forwarding rule"
  type        = bool
  default     = false
}
