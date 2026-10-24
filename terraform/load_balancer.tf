# ==============================================================================
# Mirage IDE — Global External Application Load Balancer
# ==============================================================================
# Architecture:
# - /*        --> Google Cloud Storage Backend Bucket + Cloud CDN (Frontend SPA)
# - /api/*    --> API Gateway Backend Service (Port 8000)
# - /ws/*     --> API Gateway Backend Service (Port 8000, 86400s WebSocket timeout)
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Reserved Global Public IPv4 Address
# ------------------------------------------------------------------------------
resource "google_compute_global_address" "lb_ip" {
  name        = "mirage-lb-ip"
  description = "Global Anycast IP address for the Mirage IDE application load balancer"
}

# ------------------------------------------------------------------------------
# 2. Health Check for API Gateway
# ------------------------------------------------------------------------------
resource "google_compute_health_check" "gateway_health" {
  name               = "mirage-gateway-health-check"
  description        = "Monitors API Gateway reachability on port 8000"
  check_interval_sec = 10
  timeout_sec        = 5
  healthy_threshold  = 2
  unhealthy_threshold = 3

  http_health_check {
    request_path = "/api/health"
    port         = 8000
  }
}

# ------------------------------------------------------------------------------
# 3. Backend Service: API Gateway (Microservices & WebSocket Proxy)
# ------------------------------------------------------------------------------
resource "google_compute_backend_service" "api_gateway" {
  name                  = "mirage-backend-gateway"
  description           = "Routes REST API and long-lived WebSocket connections to the API Gateway VM"
  protocol              = "HTTP"
  port_name             = "http-gateway"
  load_balancing_scheme = "EXTERNAL"
  
  # Crucial for long-lived WebSocket connections (collaboration presence & interactive terminal)
  # Default is 30 seconds; 86400 seconds (24 hours) prevents premature disconnection.
  timeout_sec = 86400

  backend {
    group                 = google_compute_instance_group.gateway_group.self_link
    balancing_mode        = "UTILIZATION"
    max_utilization       = 0.8
    capacity_scaler       = 1.0
  }

  health_checks = [google_compute_health_check.gateway_health.id]

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# ------------------------------------------------------------------------------
# 4. Backend Bucket: React Frontend Assets + Cloud CDN
# ------------------------------------------------------------------------------
resource "google_compute_backend_bucket" "frontend" {
  name        = "mirage-backend-frontend"
  description = "Serves React + Vite frontend single page application with Cloud CDN caching"
  bucket_name = google_storage_bucket.frontend.name
  enable_cdn  = true

  cdn_policy {
    cache_mode  = "CACHE_ALL_STATIC"
    default_ttl = 3600
    client_ttl  = 3600
    max_ttl     = 86400
  }
}

# ------------------------------------------------------------------------------
# 5. URL Map: Path-Based Ingress Routing Rules
# ------------------------------------------------------------------------------
resource "google_compute_url_map" "mirage_url_map" {
  name            = "mirage-url-map"
  description     = "Top-level ingress routing for Mirage IDE (Frontend vs API & WebSockets)"
  default_service = google_compute_backend_bucket.frontend.self_link

  host_rule {
    hosts        = ["*"]
    path_matcher = "mirage-paths"
  }

  path_matcher {
    name            = "mirage-paths"
    default_service = google_compute_backend_bucket.frontend.self_link

    # Route /api and /api/* to the central API Gateway
    path_rule {
      paths   = ["/api", "/api/*"]
      service = google_compute_backend_service.api_gateway.self_link
    }

    # Route /ws and /ws/* (terminal, collaboration, chat WebSockets) to the API Gateway
    path_rule {
      paths   = ["/ws", "/ws/*"]
      service = google_compute_backend_service.api_gateway.self_link
    }
  }
}

# ------------------------------------------------------------------------------
# 6. HTTP Target Proxy & Forwarding Rule (Port 80)
# ------------------------------------------------------------------------------
resource "google_compute_target_http_proxy" "http_proxy" {
  name    = "mirage-http-proxy"
  url_map = google_compute_url_map.mirage_url_map.self_link
}

resource "google_compute_global_forwarding_rule" "http_forwarding" {
  name                  = "mirage-http-forwarding-rule"
  description           = "Global public entrypoint forwarding HTTP traffic to Mirage URL Map"
  target                = google_compute_target_http_proxy.http_proxy.self_link
  ip_address            = google_compute_global_address.lb_ip.address
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL"
}

# ------------------------------------------------------------------------------
# 7. Optional HTTPS / Managed SSL Target Proxy & Forwarding Rule (Port 443)
# ------------------------------------------------------------------------------
resource "google_compute_managed_ssl_certificate" "cert" {
  count = var.enable_ssl && var.domain_name != "" ? 1 : 0
  name  = "mirage-ssl-cert"

  managed {
    domains = [var.domain_name]
  }
}

resource "google_compute_target_https_proxy" "https_proxy" {
  count            = var.enable_ssl && var.domain_name != "" ? 1 : 0
  name             = "mirage-https-proxy"
  url_map          = google_compute_url_map.mirage_url_map.self_link
  ssl_certificates = [google_compute_managed_ssl_certificate.cert[0].self_link]
}

resource "google_compute_global_forwarding_rule" "https_forwarding" {
  count                 = var.enable_ssl && var.domain_name != "" ? 1 : 0
  name                  = "mirage-https-forwarding-rule"
  target                = google_compute_target_https_proxy.https_proxy[0].self_link
  ip_address            = google_compute_global_address.lb_ip.address
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL"
}
