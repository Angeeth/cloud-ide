# ==============================================================================
# Mirage IDE — VPC Networking, Subnets, Cloud NAT & Firewall Rules
# ==============================================================================

# Custom VPC Network
resource "google_compute_network" "vpc" {
  name                    = "mirage-vpc"
  auto_create_subnetworks = false
  description             = "Custom VPC Network isolating Mirage IDE microservices and database"
}

# Regional Subnetwork
resource "google_compute_subnetwork" "subnet" {
  name                     = "mirage-subnet"
  ip_cidr_range            = "10.0.0.0/16"
  region                   = var.region
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true
  description              = "Primary private subnet hosting all 10 microservices and PostgreSQL VM"
}

# Cloud Router for outbound internet connectivity
resource "google_compute_router" "router" {
  name    = "mirage-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

# Cloud NAT Gateway: Allows private VMs to pull packages and clone GitHub repos without public IPs
resource "google_compute_router_nat" "nat" {
  name                               = "mirage-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# ==================== Firewall Rules ====================

# 1. Allow all internal communication between microservice VMs within the VPC
resource "google_compute_firewall" "allow_internal" {
  name        = "mirage-allow-internal"
  network     = google_compute_network.vpc.name
  description = "Allows full inter-microservice communication within the 10.0.0.0/16 subnet"

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "icmp"
  }

  source_ranges = ["10.0.0.0/16"]
}

# 2. Allow Google Cloud Load Balancer health checks and ingress to API Gateway
resource "google_compute_firewall" "allow_lb_health_check" {
  name        = "mirage-allow-lb-health-check"
  network     = google_compute_network.vpc.name
  description = "Allows Google Cloud Load Balancer and health check probes to reach API Gateway"

  allow {
    protocol = "tcp"
    ports    = ["8000"]
  }

  # Official Google Cloud Load Balancer IPv4 IP ranges
  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
  target_tags   = ["mirage-gateway"]
}

# 3. Allow Identity-Aware Proxy (IAP) for secure SSH administration without public IPs
resource "google_compute_firewall" "allow_iap_ssh" {
  name        = "mirage-allow-iap-ssh"
  network     = google_compute_network.vpc.name
  description = "Allows secure administrative SSH access via Identity-Aware Proxy (IAP)"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # Official Google Cloud Identity-Aware Proxy range
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["mirage-vm"]
}

# 4. Strict rule: PostgreSQL Port 5432 is restricted exclusively to the internal VPC
resource "google_compute_firewall" "allow_postgres" {
  name        = "mirage-allow-postgres-internal"
  network     = google_compute_network.vpc.name
  description = "Allows TCP 5432 strictly from internal microservices; all external traffic blocked"

  allow {
    protocol = "tcp"
    ports    = ["5432"]
  }

  source_ranges = ["10.0.0.0/16"]
  target_tags   = ["mirage-database"]
}
