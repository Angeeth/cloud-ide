# ==============================================================================
# Mirage IDE — Compute Engine Virtual Machines & Instance Groups
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Ten Microservice Compute Engine Instances
# ------------------------------------------------------------------------------

locals {
  microservices = {
    "api-gateway" = {
      name         = "mirage-api-gateway"
      ip           = "10.0.1.10"
      machine_type = var.machine_type_gateway
      port         = 8000
      tags         = ["mirage-vm", "mirage-gateway"]
      description  = "Central HTTP and WebSocket reverse proxy"
    }
    "auth-service" = {
      name         = "mirage-auth-service"
      ip           = "10.0.1.11"
      machine_type = var.machine_type_default
      port         = 8001
      tags         = ["mirage-vm"]
      description  = "User registration, login, and JWT validation service"
    }
    "project-service" = {
      name         = "mirage-project-service"
      ip           = "10.0.1.12"
      machine_type = var.machine_type_default
      port         = 8002
      tags         = ["mirage-vm"]
      description  = "Project CRUD and team membership permission service"
    }
    "file-service" = {
      name         = "mirage-file-service"
      ip           = "10.0.1.13"
      machine_type = var.machine_type_default
      port         = 8003
      tags         = ["mirage-vm"]
      description  = "File tree navigation, read/write, and cloud storage abstraction"
    }
    "import-service" = {
      name         = "mirage-import-service"
      ip           = "10.0.1.14"
      machine_type = var.machine_type_default
      port         = 8004
      tags         = ["mirage-vm"]
      description  = "ZIP archive unpacker and GitHub repo cloner"
    }
    "execution-service" = {
      name         = "mirage-execution-service"
      ip           = "10.0.1.15"
      machine_type = var.machine_type_execution
      port         = 8005
      tags         = ["mirage-vm"]
      description  = "Docker-in-Docker code execution sandbox engine"
    }
    "terminal-service" = {
      name         = "mirage-terminal-service"
      ip           = "10.0.1.16"
      machine_type = var.machine_type_default
      port         = 8006
      tags         = ["mirage-vm"]
      description  = "Interactive web PTY terminal sessions over WebSocket"
    }
    "collaboration-service" = {
      name         = "mirage-collaboration-service"
      ip           = "10.0.1.17"
      machine_type = var.machine_type_collaboration
      port         = 8007
      tags         = ["mirage-vm"]
      description  = "Real-time multi-user cursor presence and live file editing"
    }
    "chat-service" = {
      name         = "mirage-chat-service"
      ip           = "10.0.1.18"
      machine_type = var.machine_type_default
      port         = 8008
      tags         = ["mirage-vm"]
      description  = "In-project team chat and message persistence"
    }
    "history-service" = {
      name         = "mirage-history-service"
      ip           = "10.0.1.19"
      machine_type = var.machine_type_default
      port         = 8009
      tags         = ["mirage-vm"]
      description  = "Project snapshot creation, versioning, and rollback"
    }
  }
}

resource "google_compute_instance" "microservices" {
  for_each     = local.microservices
  name         = each.value.name
  machine_type = each.value.machine_type
  zone         = var.zone
  tags         = each.value.tags
  description  = each.value.description

  labels = merge(var.labels, {
    service = each.key
  })

  boot_disk {
    auto_delete = true
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 20
      type  = "pd-balanced"
      labels = merge(var.labels, {
        service = each.key
      })
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subnet.id
    network_ip = each.value.ip
    # VMs intentionally have NO public IP address.
    # Outbound access is provided via Cloud NAT; administrative access is provided via IAP.
  }

  service_account {
    email  = google_service_account.mirage_vm_sa.email
    scopes = ["cloud-platform"]
  }

  metadata_startup_script = <<-EOT
    #!/bin/bash
    set -euo pipefail
    exec > /var/log/startup-script.log 2>&1

    echo "=== Initializing ${each.key} host VM ==="

    # 1. Update OS packages
    apt-get update -y
    apt-get install -y curl ca-certificates gnupg lsb-release git

    # 2. Install Docker Engine
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    # Enable and start Docker service
    systemctl enable docker
    systemctl start docker
    usermod -aG docker ubuntu || true

    # 3. Configure Google Artifact Registry authentication for Docker
    gcloud auth configure-docker ${var.region}-docker.pkg.dev --quiet || true

    echo "=== ${each.key} host VM initialization completed ==="
  EOT

  metadata = {
    service-name = each.key
    service-port = tostring(each.value.port)
  }

  lifecycle {
    ignore_changes = [
      metadata["ssh-keys"],
    ]
  }
}

# ------------------------------------------------------------------------------
# 2. Unmanaged Instance Group for API Gateway (Required for Cloud Load Balancer)
# ------------------------------------------------------------------------------

resource "google_compute_instance_group" "gateway_group" {
  name        = "mirage-gateway-group"
  description = "Unmanaged instance group hosting the API Gateway instance for Cloud Load Balancing"
  zone        = var.zone

  instances = [
    google_compute_instance.microservices["api-gateway"].self_link
  ]

  named_port {
    name = "http-gateway"
    port = 8000
  }
}

# ------------------------------------------------------------------------------
# 3. Dedicated PostgreSQL Database VM with Persistent Disk
# ------------------------------------------------------------------------------

# Persistent storage disk for PostgreSQL data (retains data independently of VM lifecycle)
resource "google_compute_disk" "postgres_data" {
  name   = "mirage-postgres-data"
  type   = "pd-balanced"
  zone   = var.zone
  size   = var.db_disk_size_gb
  labels = merge(var.labels, {
    role = "database-storage"
  })
}

# The PostgreSQL Compute Engine VM
resource "google_compute_instance" "postgres_db" {
  name         = "mirage-postgres-db"
  machine_type = var.machine_type_database
  zone         = var.zone
  tags         = ["mirage-vm", "mirage-database"]
  description  = "Dedicated self-managed PostgreSQL Database Server"

  labels = merge(var.labels, {
    service = "postgres-db"
  })

  boot_disk {
    auto_delete = true
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 20
      type  = "pd-balanced"
      labels = merge(var.labels, {
        service = "postgres-db"
      })
    }
  }

  attached_disk {
    source      = google_compute_disk.postgres_data.id
    device_name = "postgres-data"
    mode        = "READ_WRITE"
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subnet.id
    network_ip = "10.0.1.20"
    # Database is strictly private; NO public IP address.
  }

  service_account {
    email  = google_service_account.mirage_vm_sa.email
    scopes = ["cloud-platform"]
  }

  metadata_startup_script = <<-EOT
    #!/bin/bash
    set -euo pipefail
    exec > /var/log/startup-script-postgres.log 2>&1

    echo "=== Initializing Dedicated PostgreSQL Database VM ==="

    DISK_DEVICE="/dev/disk/by-id/google-postgres-data"
    MOUNT_DIR="/mnt/disks/postgres-data"

    mkdir -p "$MOUNT_DIR"

    # 1. Format disk with ext4 if unformatted
    if ! blkid "$DISK_DEVICE"; then
      echo "Formatting persistent disk $DISK_DEVICE with ext4..."
      mkfs.ext4 -m 0 -E lazy_itable_init=0,lazy_journal_init=0 "$DISK_DEVICE"
    fi

    # 2. Mount persistent disk and add to /etc/fstab for persistence across reboots
    if ! mountpoint -q "$MOUNT_DIR"; then
      mount -o discard,defaults "$DISK_DEVICE" "$MOUNT_DIR"
      if ! grep -q "$MOUNT_DIR" /etc/fstab; then
        echo "$DISK_DEVICE $MOUNT_DIR ext4 discard,defaults,nofail 0 2" >> /etc/fstab
      fi
    fi

    # 3. Install PostgreSQL 16 official release
    apt-get update -y
    apt-get install -y curl ca-certificates gnupg lsb-release
    
    install -d /etc/apt/keyrings
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg --yes
    echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
    
    apt-get update -y
    apt-get install -y postgresql-16 postgresql-client-16

    systemctl stop postgresql

    # 4. Configure data directory on persistent mount
    PG_DATA_DIR="$MOUNT_DIR/postgresql/16/main"
    if [ ! -d "$PG_DATA_DIR" ]; then
      mkdir -p "$MOUNT_DIR/postgresql/16"
      chown -R postgres:postgres "$MOUNT_DIR/postgresql"
      chmod 700 "$MOUNT_DIR/postgresql"
      
      if [ -d "/var/lib/postgresql/16/main" ] && [ -f "/var/lib/postgresql/16/main/PG_VERSION" ]; then
        cp -a /var/lib/postgresql/16/main "$MOUNT_DIR/postgresql/16/" || true
      else
        su - postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PG_DATA_DIR" || true
      fi
    fi
    chown -R postgres:postgres "$MOUNT_DIR/postgresql"

    # Configure postgresql.conf to use mounted directory & listen on all VPC interfaces
    CONF_FILE="/etc/postgresql/16/main/postgresql.conf"
    sed -i "s|data_directory = .*|data_directory = '$PG_DATA_DIR'|g" "$CONF_FILE"
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" "$CONF_FILE"

    # Configure pg_hba.conf to accept connections from internal VPC subnet (10.0.0.0/16)
    HBA_FILE="/etc/postgresql/16/main/pg_hba.conf"
    if ! grep -q "10.0.0.0/16" "$HBA_FILE"; then
      echo "host all all 10.0.0.0/16 scram-sha-256" >> "$HBA_FILE"
    fi

    # Enable and start PostgreSQL service
    systemctl daemon-reload
    systemctl start postgresql
    systemctl enable postgresql

    # 5. Provision database user, password, and database schema
    su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${var.db_user}'\" | grep -q 1 || psql -c \"CREATE USER ${var.db_user} WITH PASSWORD '${var.db_password}';\""
    su - postgres -c "psql -c \"ALTER USER ${var.db_user} WITH PASSWORD '${var.db_password}';\""
    su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${var.db_name}'\" | grep -q 1 || psql -c \"CREATE DATABASE ${var.db_name} OWNER ${var.db_user};\""
    su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ${var.db_name} TO ${var.db_user};\""

    # 6. Install and configure Redis for real-time pub/sub (collaboration & chat)
    apt-get install -y redis-server
    sed -i "s/^bind 127.0.0.1.*/bind 0.0.0.0/g" /etc/redis/redis.conf
    sed -i "s/^protected-mode yes/protected-mode no/g" /etc/redis/redis.conf
    systemctl restart redis-server
    systemctl enable redis-server

    echo "=== PostgreSQL Database & Redis Server Provisioned and Ready ==="
  EOT

  lifecycle {
    ignore_changes = [
      metadata["ssh-keys"],
    ]
  }
}
