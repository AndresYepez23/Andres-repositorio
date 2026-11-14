#!/usr/bin/env node
// Read-only credential regression check. Never requests or prints secret values.
// Production: node prisma/scripts/check-provider-bindings.mjs production https://CANDIDATE https://KNOWN_GOOD
// Preview:    node prisma/scripts/check-provider-bindings.mjs preview https://CANDIDATE https://KNOWN_GOOD_PREVIEW
// IMPORTANT: both URLs must use the SAME Pages environment. Production and preview
// have different secrets; comparing across environments produces false alarms.
import { pathToFileURL } from "node:url";
const providers = ["gemini", "groq", "huggingface", "openrouter", "pollinations", "kilo", "requesty", "sensenova", "zai", "aihubmix"];
function endpoint(input) {
  const url = new URL(input);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".pages.dev")) throw new Error("Only HTTPS Pages deployment URLs are accepted");
  return new URL("/api/providers/status", url);
}
export function bindingInventory(body) {
  if (!body || body.ok !== true || !body.credentialSlots) throw new Error("Invalid status payload");
  const counts = Object.fromEntries(providers.map(provider => {
    const count = body.credentialSlots[provider]?.count;
    if (!Number.isInteger(count) || count < 0) throw new Error("Missing credential count for " + provider);
    return [provider, count];
  }));
  const tavily = body.research?.tavily?.configuredKeys;
  const jina = body.research?.jina?.configured;
  const cloudflare = body.configured?.cloudflare;
  const d1 = body.protection?.d1RateLimiting;
  if (!Number.isInteger(tavily) || tavily < 0 || [jina, cloudflare, d1].some(value => typeof value !== "boolean")) {
    throw new Error("Missing research, Cloudflare AI or D1 binding inventory");
  }
  return { ...counts, tavily, jina: Number(jina), cloudflare: Number(cloudflare), d1: Number(d1) };
}
export function compareBindings(nextBody, goodBody, mode) {
  if (!["production", "preview"].includes(mode)) throw new Error("Invalid Pages environment");
  const good = bindingInventory(goodBody), next = bindingInventory(nextBody);
  if (mode === "production" && providers.every(provider => good[provider] === 0)) {
    throw new Error("Production baseline has no configured external providers; cannot establish safety");
  }
  return { good, next, regressed: Object.keys(good).filter(name => next[name] < good[name]) };
}
async function status(input, fetcher) {
  const url = endpoint(input);
  const response = await fetcher(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(url.host + " returned HTTP " + response.status);
  const body = await response.json();
  bindingInventory(body);
  return body;
}
export async function checkBindings(mode, candidate, baseline, fetcher = fetch) {
  const [candidateUrl, baselineUrl] = [endpoint(candidate), endpoint(baseline)];
  if (candidateUrl.hostname === baselineUrl.hostname) throw new Error("Candidate and baseline must be distinct immutable deployment URLs");
  if (mode === "production" && (candidateUrl.hostname.includes("preview") || baselineUrl.hostname.includes("preview"))) {
    throw new Error("Use production deployment URLs for production comparisons");
  }
  const [good, next] = await Promise.all([status(baseline, fetcher), status(candidate, fetcher)]);
  return compareBindings(next, good, mode);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, candidate, baseline] = process.argv.slice(2);
  if (!["production", "preview"].includes(mode) || !candidate || !baseline) {
    console.error("Usage: node prisma/scripts/check-provider-bindings.mjs production|preview https://candidate https://same-environment-baseline");
    process.exitCode = 2;
  } else try {
    const { good, next, regressed } = await checkBindings(mode, candidate, baseline);
    console.log("Credential counts and binding presence only (" + mode + "):");
    for (const name of Object.keys(good)) console.log(name + ": baseline=" + good[name] + ", candidate=" + next[name]);
    if (regressed.length) {
      console.error("FAIL: credential counts or bindings decreased: " + regressed.join(", "));
      process.exitCode = 1;
    } else {
      console.log("PASS: inventoried bindings did not decrease. This does NOT prove inference, key validity, or Queen/Resend/Supabase private bindings.");
    }
  } catch (error) {
    console.error("FAIL: " + String(error.message || error));
    process.exitCode = 1;
  }
}
