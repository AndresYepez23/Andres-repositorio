# Deploy Qwen on GenixNode (Ubuntu 24.04 x86_64)

> Guía HISTÓRICA de instalación inicial. VPS/Tunnel/Access/modelo ya existen y fueron recuperados. No reinstalar, crear claves ni ejecutar compose up por esta guía; [estado y overrides privados actuales](../../docs/QUEEN-HANDOFF.md).

This guide deploys the isolated Prisma Neural pilot. It does not change Prisma Space production.

## 1. Verify the VPS

In the GenixNode client area, confirm:
- Product: Nova VPS x4
- Status: Active / Running
- Location: Türkiye — Istanbul
- OS: Ubuntu 24.04 x86_64
- Resources: 2 vCPU and 4 GB RAM

Find the public IPv4 address and SSH port shown by the provider. Do not send anyone the root password, private SSH key, or API key.

## 2. Connect over SSH

From a terminal on your computer:

```bash
ssh root@SERVER_IP
```

Replace `root` with the username shown by GenixNode if it differs. If the provider specifies a non-standard SSH port, add `-p PORT`.

Accept the host fingerprint only if this is the first connection and it matches the provider's console information. If the VPS is still provisioning, wait until its status is Active.

## 3. Check OS, CPU and memory

Run:

```bash
cat /etc/os-release
uname -m
free -h
df -h /
nproc
```

Expected architecture: `x86_64` (Docker reports `amd64`). Confirm the RAM and disk match the plan.

## 4. Install Docker

Copy the repository to the server, or upload the `prisma/neural-pilot` directory. If the repository is accessible over HTTPS:

```bash
apt-get update
apt-get install -y git
git clone --branch feature/prisma-neural-genixnode-qwen35-pilot https://github.com/AndresYepez23/PRISMA.git
cd PRISMA/prisma/neural-pilot
bash deploy/install-docker.sh
```

If GitHub prompts for credentials, do not paste a personal access token into a shared terminal or chat. Use an SSH deploy key or upload only this pilot directory.

## 5. Create the API secret

```bash
cp .env.example .env
openssl rand -hex 32
```

Put the generated value after `LLAMA_API_KEY=` in `.env`, then:

```bash
chmod 600 .env
```

Keep the key private. Never commit `.env`, put the key in frontend JavaScript, or send it in screenshots.

## 6. Start Qwen

```bash
sudo docker compose config
sudo docker compose pull
sudo docker compose up -d
sudo docker compose logs -f qwen
```

The first start downloads the 1.28 GB Q4_K_M GGUF to the persistent `./models/cache` directory. Wait for the model-loading messages and server-ready message. It can take several minutes.

## 7. Verify locally on the VPS

In a second SSH session:

```bash
curl -fsS http://127.0.0.1:7860/health
```

Then test an authenticated chat request:

```bash
set -a
. ./.env
set +a
curl -sS http://127.0.0.1:7860/v1/chat/completions \
  -H "Authorization: Bearer $LLAMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen3.5-2B","messages":[{"role":"user","content":"Responde en español: ¿qué es Prisma Neural?"}],"max_tokens":96,"temperature":0.2}'
```

## 8. Keep it private

- Do not open TCP 7860 in the GenixNode firewall.
- Docker binds the published port to `127.0.0.1`, so it is only reachable from the VPS itself.
- Keep SSH (normally TCP 22) restricted to your IP if the provider firewall supports it.
- Do not enable llama.cpp `--tools`, `--agent`, shell access, file access or MCP on this server.
- Do not point Prisma Space at this VPS directly. The later production connection must go through Cloudflare Tunnel and a server-side Worker that stores the API key.

## 9. If the container exits or the VPS runs out of memory

Collect diagnostics before changing settings:

```bash
sudo docker compose ps
sudo docker compose logs --tail=150 qwen
free -h
sudo dmesg -T | tail -80
```

The 4 GB plan is tight. The pilot deliberately starts with 2048 context tokens and one slot. Do not raise context or concurrency until memory use is measured. If it is killed by the OOM manager, first consider a smaller quantization/model or a carefully configured swap file; swap can keep the VPS alive but may make generation much slower.

## 10. Remote testing without opening the model port

From your own computer, create an SSH tunnel:

```bash
ssh -L 7860:127.0.0.1:7860 root@SERVER_IP
```

Keep the SSH session open. Your computer can then call `http://127.0.0.1:7860` locally. Do not open port 7860 to the public Internet.
