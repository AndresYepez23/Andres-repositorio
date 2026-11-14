#!/usr/bin/env node
// Read-only deployment credential regression check. Never logs or requests secret values.
// Usage: node prisma/scripts/check-provider-bindings.mjs <candidate-url> [known-good-url]
// Exit nonzero if a previously configured provider disappears from the candidate.
const candidate = process.argv[2];
const baseline = process.argv[3] || "https://17a6c338.prismaspace.pages.dev";
if (!candidate || !/^https:\/\//i.test(candidate) || !/^https:\/\//i.test(baseline)) {
  console.error("Usage: node prisma/scripts/check-provider-bindings.mjs https://candidate.pages.dev [https://known-good.pages.dev]");
  process.exit(2);
}
const providers = ["gemini", "groq", "huggingface", "openrouter", "pollinations", "kilo", "requesty", "sensenova", "zai", "aihubmix"];
async function status(url) {
  const endpoint = new URL("/api/providers/status", url);
  const response = await fetch(endpoint, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(endpoint.host + " returned HTTP " + response.status);
  const body = await response.json();
  if (!body || body.ok !== true || typeof body !== "object" || !body.credentialSlots) throw new Error(endpoint.host + " has no credentialSlots payload");
  return Object.fromEntries(providers.map(provider => {
    const count = body.credentialSlots?.[provider]?.count;
    if (!Number.isInteger(count) || count < 0) throw new Error(endpoint.host + " missing credential count for " + provider);
    return [provider, count];
  }));
}
try {
  const [good, next] = await Promise.all([status(baseline), status(candidate)]);
  const lost = providers.filter(provider => good[provider] > 0 && next[provider] === 0);
  console.log("Provider credential counts (no secret material):");
  for (const provider of providers) console.log(provider + ": baseline=" + good[provider] + ", candidate=" + next[provider]);
  if (lost.length) {
    console.error("BLOCK DEPLOYMENT: previously configured providers now have zero credentials: " + lost.join(", "));
    process.exitCode = 1;
  } else {
    console.log("PASS: no configured provider disappeared completely.");
  }
} catch (error) {
  console.error("BLOCK DEPLOYMENT: credential health check inconclusive: " + String(error.message || error));
  process.exitCode = 1;
}
