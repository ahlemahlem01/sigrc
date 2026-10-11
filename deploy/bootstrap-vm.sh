#!/usr/bin/env bash
# Prepares a fresh Ubuntu VM and starts SIGRC. Run it from the repository folder, as a normal user with sudo:
#   bash deploy/bootstrap-vm.sh <dns-name-of-the-vm> <https://address-of-the-vercel-frontend>
# It installs Docker if needed, creates .env (random passwords, token certificates) when it does not exist,
# then starts the stack. Re-running it is safe: an existing .env is never overwritten.
set -euo pipefail

PUBLIC_HOST="${1:?DNS name of the VM, e.g. sigrc-demo.spaincentral.cloudapp.azure.com}"
FRONTEND_URL="${2:?Address of the Vercel frontend, e.g. https://sigrc.vercel.app}"

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "Docker installed. Log out and back in, then run this script again."
  exit 0
fi

if [ ! -f .env ]; then
  rand() { openssl rand -hex 12; }
  cert_password="$(rand)Aa1"
  make_cert() { # <subject> <key usage> -> base64 PFX on stdout
    local dir; dir="$(mktemp -d)"
    openssl req -x509 -newkey rsa:2048 -nodes -days 730 -subj "/CN=$1" -addext "keyUsage=$2" \
      -keyout "$dir/key.pem" -out "$dir/cert.pem" 2>/dev/null
    openssl pkcs12 -export -inkey "$dir/key.pem" -in "$dir/cert.pem" -passout "pass:$cert_password" -out "$dir/cert.pfx"
    base64 -w0 "$dir/cert.pfx"; rm -rf "$dir"
  }
  {
    echo "MSSQL_SA_PASSWORD=Sa!$(rand)Aa1"
    echo "SEED_SUPERADMIN_PASSWORD=Su!$(rand)Aa1"
    echo "SEED_ADMIN_PASSWORD=Ad!$(rand)Aa1"
    echo "PUBLIC_HOST=$PUBLIC_HOST"
    echo "FRONTEND_URL=$FRONTEND_URL"
    echo "SEMANTIC_BACKFILL=false"
    echo "AUTH_CERT_PASSWORD=$cert_password"
    echo "AUTH_SIGNING_CERT_BASE64=$(make_cert 'Coficab Signing' digitalSignature)"
    echo "AUTH_ENCRYPTION_CERT_BASE64=$(make_cert 'Coficab Encryption' keyEncipherment)"
  } > .env
  chmod 600 .env
  echo ".env created (passwords and certificates generated). Keep a private copy of it."
fi

docker compose -f docker-compose.yml -f deploy/docker-compose.azure.yml up -d --build
echo "Started. Check:  curl https://$PUBLIC_HOST/health/ready  ,  :8443/health  and  :8444/health"
