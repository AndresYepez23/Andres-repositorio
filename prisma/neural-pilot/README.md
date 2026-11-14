# Prisma Neural Engine — GenixNode Qwen pilot

> Estado14/11/2026UTC: Queen conectada a Core y activada públicamente, validación neuronal públicaHTTP422 pendiente. Piloto inicial histórico: no repetir instalación/benchmark. Leer [handoff](../docs/QUEEN-HANDOFF.md).

**Status:** isolated VPS pilot; not connected to Prisma Core or production.  
**Branch:** `feature/prisma-neural-genixnode-qwen35-pilot`  
**Host target:** GenixNode Nova VPS x4, Ubuntu 24.04 x86_64, 2 vCPU, 4 GB RAM.  
**Runtime:** llama.cpp server in Docker, CPU only.  
**Model:** `unsloth/Qwen3.5-2B-GGUF:Q4_K_M` (GGUF file: 1.28 GB).  

## Goals

1. Run Qwen3.5-2B on the VPS and verify real inference.
2. Measure cold/warm latency, tokens per second, RAM and stability.
3. Keep the endpoint private; do not expose port 7860 directly.
4. Later connect through a Cloudflare Tunnel and a Prisma Worker.
5. Only after evaluation, test Qwen as the natural-language planner for Prisma Core tools.

## Initial resource limits

The VPS has 4 GB RAM and no GPU. The initial context is deliberately limited to 2048 tokens, one inference slot, and 256 output tokens. This is a cautious starting point, not a performance guarantee. If the process is killed for memory, inspect RAM and swap before changing model or context.

## Security boundaries

- Docker publishes port 7860 only on `127.0.0.1`.
- `LLAMA_API_KEY` is required and must never be committed or placed in browser code.
- Do not open port 7860 in the provider firewall.
- Do not enable llama.cpp's built-in `--tools`, `--agent`, shell, file, or MCP tools on this public VPS.
- Qwen may propose tool calls in a later Prisma integration, but Prisma Core must validate permissions, parameters, and results before executing anything.
- Do not send clinical records, private conversations, API keys, or personal files during the pilot.

## Deploy

Follow [deploy/README.md](deploy/README.md). The model is downloaded to a persistent Docker volume on the VPS, not to visitors' devices.

## Test

After the server reports ready:

```bash
cd prisma/neural-pilot
cp .env.example .env
# Put a fresh random key in .env; chmod 600 .env
sudo docker compose up -d
sudo docker compose logs -f qwen
```

Check health:

```bash
curl -fsS http://127.0.0.1:7860/health
```

Run the manual benchmark:

```bash
set -a
. ./.env
set +a
python3 benchmark.py --url http://127.0.0.1:7860
```

The benchmark reports responses and latency; quality is assessed manually.

## Promotion criteria

Do not merge this pilot into `main` or route real users to it until:
- Qwen starts reliably after a VPS reboot.
- RAM use remains stable during repeated requests.
- Spanish instruction-following and tool-selection tests pass.
- Timeouts, rate limits, authentication and request-size limits are in place.
- A Cloudflare Tunnel + server-side Worker gateway is configured.
- Existing provider fallbacks and local Core intelligence remain intact.
