#!/usr/bin/env bash
set -euo pipefail

. /etc/os-release

if [[ "$(dpkg --print-architecture)" != "arm64" ]]; then
  echo "This bootstrap is intended for Ubuntu ARM64 (aarch64) on OCI Ampere A1." >&2
  exit 1
fi

if [[ "$ID" != "ubuntu" ]]; then
  echo "Use an Ubuntu 24.04 ARM64 image for this pilot." >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y ca-certificates curl

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker

echo
echo "Docker and Docker Compose are installed."
echo "Use: sudo docker compose version"
