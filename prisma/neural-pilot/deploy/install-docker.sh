#!/usr/bin/env bash
set -euo pipefail

. /etc/os-release
if [[ "${ID}" != "ubuntu" ]]; then
  echo "This installer is for Ubuntu 24.04." >&2
  exit 1
fi
if [[ "$(dpkg --print-architecture)" != "amd64" ]]; then
  echo "Expected x86_64/amd64 architecture." >&2
  exit 1
fi

SUDO=""
if [[ "${EUID}" -ne 0 ]]; then
  SUDO="sudo"
fi

${SUDO} apt-get update
${SUDO} apt-get install -y ca-certificates curl gnupg

${SUDO} install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | ${SUDO} gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
${SUDO} chmod a+r /etc/apt/keyrings/docker.gpg

CODENAME="${UBUNTU_CODENAME:-$VERSION_CODENAME}"
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
  | ${SUDO} tee /etc/apt/sources.list.d/docker.list >/dev/null

${SUDO} apt-get update
${SUDO} apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
${SUDO} systemctl enable --now docker

${SUDO} docker version
${SUDO} docker compose version
