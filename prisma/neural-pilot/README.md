---
title: Prisma Neural Pilot
emoji: 🧠
colorFrom: purple
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Prisma Neural Pilot — isolated evaluation only

**Selected model:** Qwen3.5-2B, GGUF Q4_K_M from unsloth/Qwen3.5-2B-GGUF. Weight file ~1.28 GB; text-only in this initial CPU configuration. License Apache-2.0; maintain license notices and attribution. Does **not** use Prisma Mini or call inference APIs. **Not a model trained by Prisma.**

## Purpose

Evaluate Spanish response quality, tool choice, formatting, adherence to security boundaries and CPU latency *before* integrating into Prisma Core. Existing chat routing and production providers remain untouched. Model downloads happen on the server, never in the user's browser.

## Hosting reality (November 2026)

Hugging Face free accounts generally cannot create new CPU/Docker compute Spaces without a paid plan. A free eligible ZeroGPU Space uses a different Gradio/PyTorch deployment and has daily GPU quotas; this Docker prototype **must not be described as hosted free**. Deploy only where CPU/Docker hosting is available without charges, or after an explicit cost decision. A dormant GitHub branch has zero inference hosting cost.

## Boot and testing

Use the Dockerfile in a private staging environment with at least 4 GB usable RAM and preferably >=4 CPU threads for interactive responsiveness; the target 2-vCPU configuration may be slow. Docker pulls the llama.cpp server and the server downloads open GGUF weights on first boot. Disk/cache and outbound network access are required.

Example for a developer's machine (test only, do not expose public endpoint):

```bash
docker build -t prisma-neural-pilot .
docker run --rm -p 127.0.0.1:7860:7860 prisma-neural-pilot
python3 benchmark.py --url http://127.0.0.1:7860
```

It exposes a local OpenAI-compatible endpoint at `/v1/chat/completions`. Do not connect to Prisma Core before adding server-side authentication, user quota, per-request timeouts, concurrency limits, payload validation, logging without user prompts, and deterministic allowlisted tool execution. Model-generated tool calls are **proposals**, never permissions to run tools.

## Acceptance checks

- Answers in Spanish, follows concise output constraints and declines to invent facts.
- Selects only valid allowlisted tool IDs for simple instructions, without executing them.
- Keeps a multi-turn conversation topic.
- Records latency for every test; avoids unbounded responses by capping tokens.
- Runs independently from API inference providers; doesn't silently switch to Cloudflare or Hugging Face API.

Do not merge or deploy to production solely because the smoke tests pass. Real inference, concurrent load, memory use and hosting viability require a live run.
