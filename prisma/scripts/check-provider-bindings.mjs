#!/usr/bin/env node
// Read-only credential regression check. Never requests or prints secret values.
// Production: node prisma/scripts/check-provider-bindings.mjs production https://CANDIDATE https://KNOWN_GOOD
// Preview:    node prisma/scripts/check-provider-bindings.mjs preview https://CANDIDATE https://KNOWN_GOOD_PREVIEW
// IMPORTANT: both URLs must use the SAME Pages environment. Production and preview
// have different secrets; comparing across environments produces false alarms.
const [mode, candidate, baseline] = process.argv.slice(2);
if (!["production", "preview"].includes(mode) || !candidate || !baseline) {
  console.error("Usage: node prisma/scripts/check-provider-bindings.mjs production|preview https://candidate https://same-environment-baseline");
  process.exit(2);
}
const providers = ["gemini", "groq", "huggingface", "openrouter", "pollinations", "kilo", "requesty", "sensenova", "zai", "aihubmix"];
function endpoint(input) {
  const url = new URL(input);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".pages.dev")) throw new Error("Only HTTPS Pages deployment URLs are accepted");
  return new URL("/api/providers/status", url);
}
async function status(input) {
  const url = endpoint(input);
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(url.host + " returned HTTP " + response.status);
  const body = await response.json();
  if (!body || body.ok !== true || !body.credentialSlots) throw new Error(url.host + " returned an invalid status payload");
  return Object.fromEntries(providers.map(provider => {
    const count = body.credentialSlots?.[provider]?.count;
    if (!Number.isInteger(count) || count < 0) throw new Error(url.host + " missing credential count for " + provider);
    return [provider, count];
  }));
}
try {
  const [candidateUrl, baselineUrl] = [endpoint(candidate), endpoint(baseline)];
  if (candidateUrl.hostname === baselineUrl.hostname) throw new Error("Candidate and baseline must be distinct immutable deployment URLs");
  if (mode === "production" && (candidateUrl.hostname.includes("preview") || baselineUrl.hostname.includes("preview"))) {
    throw new Error("Use production deployment URLs for production comparisons");
  }
  const [good, next] = await Promise.all([status(baseline), status(candidate)]);
  const regressed = providers.filter(provider => next[provider] < good[provider]);
  console.log("Credential slot counts only (" + mode + "):");
  for (const provider of providers) console.log(provider + ": baseline=" + good[provider] + ", candidate=" + next[provider]);
  if (mode === "production" && providers.every(provider => good[provider] === 0)) {
    throw new Error("Production baseline has no configured external providers; cannot establish safety");
  }
  if (lost.length) {
    console.error("FAIL: previously configured providers dropped to zero: " + lost.join(", "));
    process.exitCode = 1;
  } else {
    console.log("PASS: configured credential counts did not decrease. This does NOT prove inference or key validity.");
  }
} catch (error) {
  console.error("FAIL: " + String(error.message || error));
  process.exitCode = 1;
}
