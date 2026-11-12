// Protected API credential pools per external provider.
// Compact JSON pools keep Cloudflare binding usage practical; individual legacy
// variables remain supported. Credentials may represent separate accounts; the
// caller decides whether quota holds are account-specific or provider-wide.
// Secret values never leave the backend.
import { getProviderHold, setProviderHold } from "./provider-health.js";

export const CREDENTIAL_ROOTS = Object.freeze({
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  huggingface: "HF_TOKEN",
  openrouter: "OPENROUTER_API_KEY",
  pollinations: "POLLINATIONS_API_KEY",
  kilo: "KILO_API_KEY",
  requesty: "REQUESTY_API_KEY",
  sensenova: "SENSENOVA_API_KEY",
  zai: "ZAI_API_KEY",
  aihubmix: "AIHUBMIX_API_KEY",
});

// One encrypted Cloudflare secret per provider can contain a JSON array of up
// to six keys. This is the recommended format on Workers Free, whose binding
// count is lower than the 72 individual secrets needed for twelve providers.
export const CREDENTIAL_POOL_VARIABLES = Object.freeze({
  gemini: "GEMINI_API_KEYS_JSON",
  groq: "GROQ_API_KEYS_JSON",
  huggingface: "HF_API_KEYS_JSON",
  openrouter: "OPENROUTER_API_KEYS_JSON",
  pollinations: "POLLINATIONS_API_KEYS_JSON",
  kilo: "KILO_API_KEYS_JSON",
  requesty: "REQUESTY_API_KEYS_JSON",
  sensenova: "SENSENOVA_API_KEYS_JSON",
  zai: "ZAI_API_KEYS_JSON",
  aihubmix: "AIHUBMIX_API_KEYS_JSON",
});

export const CREDENTIAL_SLOT_LIMITS = Object.freeze(
  Object.fromEntries(Object.keys(CREDENTIAL_ROOTS).map(provider => [provider, provider === "requesty" ? 3 : provider === "gemini" ? 7 : 6]))
);
export const MAX_CREDENTIAL_SLOTS = 7;

export function maxCredentialSlots(provider) {
  return CREDENTIAL_SLOT_LIMITS[provider] || 0;
}

function readJsonCredentialPool(env, provider) {
  const variable = CREDENTIAL_POOL_VARIABLES[provider];
  const raw = variable ? env?.[variable] : null;
  if (raw == null || raw === "") return { variable, configured: false, valid: true, values: [] };
  if (typeof raw !== "string") return { variable, configured: true, valid: false, values: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > maxCredentialSlots(provider)
      || parsed.some(value => typeof value !== "string")) {
      return { variable, configured: true, valid: false, values: [] };
    }
    return {
      variable,
      configured: true,
      valid: true,
      values: parsed.map(value => value.trim()),
    };
  } catch {
    return { variable, configured: true, valid: false, values: [] };
  }
}

export function getCredentialSlots(env, provider) {
  const root = CREDENTIAL_ROOTS[provider];
  if (!root) return [];
  const seen = new Set(), slots = [];
  const limit = maxCredentialSlots(provider);
  const pool = readJsonCredentialPool(env, provider);

  for (let number = 1; number <= limit; number++) {
    const individualName = number === 1 ? root : root + "_" + number;
    const legacyBackupName = number === 2 ? root + "_BACKUP" : null;
    const individualValue = String(
      env?.[individualName] || (legacyBackupName ? env?.[legacyBackupName] : "") || ""
    ).trim();
    const pooledValue = pool.values[number - 1] || "";
    const value = individualValue || pooledValue;
    if (!value || seen.has(value)) continue;
    seen.add(value);
    slots.push({
      number,
      name: individualValue
        ? (env?.[individualName] ? individualName : legacyBackupName)
        : pool.variable + "[" + number + "]",
      value,
    });
  }
  return slots;
}

export function getCredentialStatus(env, provider) {
  const slots = getCredentialSlots(env, provider);
  const byNumber = new Map(slots.map(item => [item.number, item]));
  const root = CREDENTIAL_ROOTS[provider];
  const pool = readJsonCredentialPool(env, provider);
  const max = maxCredentialSlots(provider);
  return {
    count: slots.length,
    max,
    poolVariable: pool.variable,
    poolConfigured: pool.configured,
    poolValid: pool.valid,
    slots: Array.from({ length: max }, (_, i) => {
      const number = i + 1;
      const configured = byNumber.get(number);
      return {
        slot: number,
        configured: Boolean(configured),
        variable: configured?.name || pool.variable + "[" + number + "]",
        individualVariable: number === 1 ? root : root + "_" + number,
      };
    }),
  };
}

export async function getCredentialFingerprint(provider, slot) {
  // Store only a short, non-reversible fingerprint. Never persist the secret.
  const bytes = new TextEncoder().encode(String(slot?.value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 8), b => b.toString(16).padStart(2, "0")).join("");
}

async function credentialHealthKey(provider, slot) {
  // Cooldowns belong to the actual credential, not just its slot position.
  // Updating a secret must not inherit the previous invalid key's one-hour hold.
  return "credential-slot:v2:" + provider + ":" + slot.number + ":" + await getCredentialFingerprint(provider, slot);
}

function credentialMetricScope(provider, fingerprint, metric) {
  return "credential:" + provider + ":" + fingerprint + ":" + metric;
}
function currentMinuteWindow(now = Date.now()) {
  return Math.floor(now / 60000);
}
function currentDayWindow(now = Date.now()) {
  return Math.floor(currentMinuteWindow(now) / 1440) * 1440;
}
async function writeCredentialMetric(env, provider, slot, metric, windowStart, value, mode = "set") {
  const db = env?.PRISMA_RATE_DB;
  if (!db?.prepare) return;
  const fingerprint = await getCredentialFingerprint(provider, slot);
  const scope = credentialMetricScope(provider, fingerprint, metric);
  const amount = Math.max(0, Math.floor(Number(value) || 0));
  const sql = mode === "increment"
    ? "INSERT INTO ai_rate_limits(scope,window_start,request_count) VALUES(?,?,?) ON CONFLICT(scope,window_start) DO UPDATE SET request_count=ai_rate_limits.request_count+excluded.request_count"
    : "INSERT INTO ai_rate_limits(scope,window_start,request_count) VALUES(?,?,?) ON CONFLICT(scope,window_start) DO UPDATE SET request_count=excluded.request_count";
  try {
    await db.prepare(sql).bind(scope, windowStart, amount).run();
  } catch (error) {
    console.warn("Prisma credential metrics write", String(error?.message || error).slice(0, 100));
  }
}
function finiteHeader(headers, names) {
  for (const name of names) {
    const raw = headers?.get?.(name);
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}
function durationSeconds(raw) {
  if (raw == null || raw === "") return null;
  const value = String(raw).trim();
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  const absolute = Date.parse(value);
  if (Number.isFinite(absolute)) return Math.max(0, (absolute - Date.now()) / 1000);
  const parts = value.match(/(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?/i);
  if (!parts || !parts[0]) return null;
  const seconds = Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
  return seconds > 0 ? seconds : null;
}
function parseRateLimitHeader(headers) {
  const raw = headers?.get?.("ratelimit") || "";
  const pick = name => {
    const match = raw.match(new RegExp("(?:^|[,; ]\\s*)" + name + "\\s*=\\s*(\\d+(?:\\.\\d+)?)", "i"));
    return match ? Number(match[1]) : null;
  };
  return { limit: pick("limit"), remaining: pick("remaining"), reset: pick("reset") };
}
function openRouterLimitResetAt(raw) {
  const value = String(raw || "").trim().toLowerCase();
  const now = new Date();
  if (value === "daily") return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) / 1000);
  if (value === "weekly") {
    const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
    return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday) / 1000);
  }
  if (value === "monthly") return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}
async function responsePayload(response, supplied) {
  if (supplied && typeof supplied === "object") return supplied;
  if (!response) return {};
  try { return await response.clone().json(); } catch { return {}; }
}
function usageTotals(payload) {
  const usage = payload?.usage || payload?.usageMetadata || payload?.data?.usage || {};
  const pick = values => {
    for (const value of values) {
      const number = Number(value);
      if (value !== undefined && value !== null && Number.isFinite(number) && number >= 0) return Math.floor(number);
    }
    return 0;
  };
  const input = pick([usage.prompt_tokens, usage.input_tokens, usage.promptTokenCount, usage.prompt_tokens_details?.total_tokens]);
  const output = pick([usage.completion_tokens, usage.output_tokens, usage.candidatesTokenCount]);
  const total = pick([usage.total_tokens, usage.totalTokenCount]) || input + output;
  return { input, output, total };
}

export async function recordCredentialMetrics(env, provider, slot, response, suppliedPayload, options = {}) {
  if (!slot?.value) return;
  const db = env?.PRISMA_RATE_DB;
  if (!db?.prepare) return;
  const now = Math.floor(Date.now() / 1000);
  const day = currentDayWindow();
  const status = Number(response?.status || options.status || 0);
  const countRequest = options.countRequest !== false;
  const payload = await responsePayload(response, suppliedPayload);
  const headers = response?.headers;
  const writes = [];

  if (countRequest) {
    writes.push(writeCredentialMetric(env, provider, slot, "last-used", 0, now));
    writes.push(writeCredentialMetric(env, provider, slot, "last-status", 0, status));
    writes.push(writeCredentialMetric(env, provider, slot, "daily-attempts", day, 1, "increment"));
    if (response?.ok) {
      writes.push(writeCredentialMetric(env, provider, slot, "daily-requests", day, 1, "increment"));
      const totals = usageTotals(payload);
      if (totals.input) writes.push(writeCredentialMetric(env, provider, slot, "daily-input-tokens", day, totals.input, "increment"));
      if (totals.output) writes.push(writeCredentialMetric(env, provider, slot, "daily-output-tokens", day, totals.output, "increment"));
      if (totals.total) writes.push(writeCredentialMetric(env, provider, slot, "daily-tokens", day, totals.total, "increment"));
      const costMicro = Number(payload?.usage?.cost_microdollars ?? payload?.cost_microdollars);
      const costUsd = Number(payload?.usage?.cost_usd ?? payload?.cost_usd ?? payload?.usage?.cost ?? payload?.cost);
      const cost = Number.isFinite(costMicro) && costMicro >= 0
        ? Math.floor(costMicro)
        : Number.isFinite(costUsd) && costUsd >= 0 ? Math.floor(costUsd * 1_000_000) : 0;
      if (cost) writes.push(writeCredentialMetric(env, provider, slot, "daily-cost-microusd", day, cost, "increment"));
      writes.push(writeCredentialMetric(env, provider, slot, "last-success", 0, now));
    }
  }

  const requestLimit = finiteHeader(headers, ["x-ratelimit-limit-requests", "ratelimit-limit"]);
  const requestRemaining = finiteHeader(headers, ["x-ratelimit-remaining-requests", "ratelimit-remaining"]);
  const tokenLimit = finiteHeader(headers, ["x-ratelimit-limit-tokens"]);
  const tokenRemaining = finiteHeader(headers, ["x-ratelimit-remaining-tokens"]);
  const rate = parseRateLimitHeader(headers);
  const requestResetSeconds = durationSeconds(headers?.get?.("x-ratelimit-reset-requests")) ?? rate.reset ?? null;
  const tokenResetSeconds = durationSeconds(headers?.get?.("x-ratelimit-reset-tokens"));
  const requestResetMinute = requestResetSeconds == null ? null : currentMinuteWindow() + Math.max(1, Math.ceil(requestResetSeconds / 60));
  const tokenResetMinute = tokenResetSeconds == null ? null : currentMinuteWindow() + Math.max(1, Math.ceil(tokenResetSeconds / 60));

  if (requestLimit != null) writes.push(writeCredentialMetric(env, provider, slot, "limit-requests", requestResetMinute || currentMinuteWindow() + 1, requestLimit));
  if (requestRemaining != null) writes.push(writeCredentialMetric(env, provider, slot, "remaining-requests", requestResetMinute || currentMinuteWindow() + 1, requestRemaining));
  if (tokenLimit != null) writes.push(writeCredentialMetric(env, provider, slot, "limit-tokens", tokenResetMinute || currentMinuteWindow() + 1, tokenLimit));
  if (tokenRemaining != null) writes.push(writeCredentialMetric(env, provider, slot, "remaining-tokens", tokenResetMinute || currentMinuteWindow() + 1, tokenRemaining));

  // OpenRouter exposes per-key spend limits through GET /api/v1/key.
  const keyData = payload?.data || payload;
  const balanceRemaining = keyData?.limit_remaining == null ? NaN : Number(keyData.limit_remaining);
  const balanceLimit = keyData?.limit == null ? NaN : Number(keyData.limit);
  if (provider === "openrouter" && Number.isFinite(balanceRemaining) && balanceRemaining >= 0) {
    writes.push(writeCredentialMetric(env, provider, slot, "balance-microusd", 0, Math.floor(balanceRemaining * 1_000_000)));
    if (Number.isFinite(balanceLimit) && balanceLimit >= 0) {
      writes.push(writeCredentialMetric(env, provider, slot, "balance-limit-microusd", 0, Math.floor(balanceLimit * 1_000_000)));
    }
    const resetAt = openRouterLimitResetAt(keyData?.limit_reset);
    if (resetAt > 0) writes.push(writeCredentialMetric(env, provider, slot, "balance-reset", 0, resetAt));
  }
  await Promise.all(writes);
}

export async function getCredentialMetricsSnapshot(env, providers = Object.keys(CREDENTIAL_ROOTS)) {
  const names = [...new Set((Array.isArray(providers) ? providers : []).filter(name => CREDENTIAL_ROOTS[name]))];
  const slotsByProvider = Object.fromEntries(names.map(name => [name, getCredentialSlots(env, name)]));
  const snapshot = Object.fromEntries(names.map(name => [name, {}]));
  const db = env?.PRISMA_RATE_DB;
  if (!db?.prepare) return snapshot;
  let rows = [];
  try {
    const result = await db.prepare("SELECT scope, window_start, request_count FROM ai_rate_limits WHERE scope LIKE ?")
      .bind("credential:%").all();
    rows = Array.isArray(result?.results) ? result.results : [];
  } catch (error) {
    console.warn("Prisma credential metrics lookup", String(error?.message || error).slice(0, 100));
    return snapshot;
  }
  const slotsByFingerprint = new Map();
  for (const provider of names) {
    for (const slot of slotsByProvider[provider]) {
      const fingerprint = await getCredentialFingerprint(provider, slot);
      slotsByFingerprint.set(provider + ":" + fingerprint, slot.number);
    }
  }
  const nowMinute = currentMinuteWindow();
  const day = currentDayWindow();
  const resetRows = new Map();
  for (const row of rows) {
    const parts = String(row.scope || "").split(":");
    if (parts.length !== 4 || parts[0] !== "credential") continue;
    const [, provider, fingerprint, metric] = parts;
    const slotNumber = slotsByFingerprint.get(provider + ":" + fingerprint);
    if (!slotNumber || !snapshot[provider]) continue;
    const value = Number(row.request_count) || 0;
    const window = Number(row.window_start) || 0;
    const item = snapshot[provider][slotNumber] ||= {};
    if (["daily-attempts", "daily-requests", "daily-input-tokens", "daily-output-tokens", "daily-tokens", "daily-cost-microusd"].includes(metric) && window === day) {
      const field = {
        "daily-attempts": "attemptsToday",
        "daily-requests": "requestsToday",
        "daily-input-tokens": "inputTokensToday",
        "daily-output-tokens": "outputTokensToday",
        "daily-tokens": "tokensToday",
        "daily-cost-microusd": "estimatedCostUsdMicros",
      }[metric];
      item[field] = value;
    } else if (window === 0 && metric === "last-used") item.lastUsedAt = value;
    else if (window === 0 && metric === "last-success") item.lastSuccessAt = value;
    else if (window === 0 && metric === "last-status") item.lastStatus = value;
    else if (window === 0 && metric === "balance-microusd") item.balanceRemainingUsd = value / 1_000_000;
    else if (window === 0 && metric === "balance-limit-microusd") item.balanceLimitUsd = value / 1_000_000;
    else if (window === 0 && metric === "balance-reset") item.balanceResetAt = value;
    else if (window > nowMinute && ["remaining-requests", "limit-requests", "remaining-tokens", "limit-tokens"].includes(metric)) {
      const key = provider + ":" + slotNumber + ":" + metric;
      const previous = resetRows.get(key);
      if (!previous || window > previous.window) {
        resetRows.set(key, { window, value });
        item[metric.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
        if (metric.includes("requests")) item.requestsResetAt = window * 60;
        if (metric.includes("tokens")) item.tokensResetAt = window * 60;
      }
    }
  }
  for (const provider of names) {
    for (const item of Object.values(snapshot[provider])) {
      if (provider === "openrouter" && item.balanceRemainingUsd != null) item.balanceSource = "OpenRouter key limits API";
    }
  }
  return snapshot;
}

async function nextCredentialStartIndex(env, provider, slotCount) {
  if (slotCount <= 1) return 0;
  const db = env?.PRISMA_RATE_DB;
  if (!db?.prepare) return Math.floor(Math.random() * slotCount);
  const scope = "credential-cursor:" + provider;
  const day = currentDayWindow();
  try {
    const row = await db.prepare("INSERT INTO ai_rate_limits(scope,window_start,request_count) VALUES(?,?,1) ON CONFLICT(scope,window_start) DO UPDATE SET request_count=ai_rate_limits.request_count+1 RETURNING request_count")
      .bind(scope, day).first();
    return ((Number(row?.request_count) || 1) - 1) % slotCount;
  } catch {
    return Math.floor(Math.random() * slotCount);
  }
}

function credentialCapacityScore(metrics) {
  if (!metrics) return null;
  const ratios = [];
  if (Number(metrics.balanceLimitUsd) > 0 && Number.isFinite(Number(metrics.balanceRemainingUsd))) {
    ratios.push(Math.max(0, Math.min(1, Number(metrics.balanceRemainingUsd) / Number(metrics.balanceLimitUsd))));
  }
  if (Number(metrics.limitRequests) > 0 && Number.isFinite(Number(metrics.remainingRequests))) {
    ratios.push(Math.max(0, Math.min(1, Number(metrics.remainingRequests) / Number(metrics.limitRequests))));
  }
  if (Number(metrics.limitTokens) > 0 && Number.isFinite(Number(metrics.remainingTokens))) {
    ratios.push(Math.max(0, Math.min(1, Number(metrics.remainingTokens) / Number(metrics.limitTokens))));
  }
  return ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : null;
}
export async function getCredentialHealthSnapshot(env, providers=Object.keys(CREDENTIAL_ROOTS)) {
  const names=[...new Set((Array.isArray(providers)?providers:[]).filter(name=>CREDENTIAL_ROOTS[name]))];
  const slotsByProvider=Object.fromEntries(names.map(name=>[name,getCredentialSlots(env,name)]));
  const snapshot=Object.fromEntries(names.map(name=>[name,{configuredSlots:slotsByProvider[name].length,healthySlots:slotsByProvider[name].length,pausedSlots:0,retryAt:null}]));
  const db=env?.PRISMA_RATE_DB;
  if(!db?.prepare)return snapshot;
  let rows=[];
  try {
    const result=await db.prepare("SELECT provider, state, reason, valid_until FROM ai_provider_health WHERE provider LIKE ? AND valid_until>?")
      .bind("credential-slot:v2:%",Math.floor(Date.now()/1000)).all();
    rows=Array.isArray(result?.results)?result.results:[];
  } catch(error) {
    console.error("Prisma credential health snapshot",String(error?.message||error).slice(0,100));
    return snapshot;
  }
  const holds=new Map(rows.map(row=>[String(row.provider||""),row]));
  for(const name of names){
    let pausedSlots=0,retryAt=null;
    for(const slot of slotsByProvider[name]){
      const key=await credentialHealthKey(name,slot),hold=holds.get(key);
      if(!hold)continue;
      pausedSlots++;
      const until=Number(hold.valid_until)||0;
      if(until>0&&(!retryAt||until<retryAt))retryAt=until;
    }
    snapshot[name]={configuredSlots:slotsByProvider[name].length,healthySlots:Math.max(0,slotsByProvider[name].length-pausedSlots),pausedSlots,retryAt};
  }
  return snapshot;
}

export async function getHealthyCredentialCount(env,provider) {
  const snapshot=await getCredentialHealthSnapshot(env,[provider]);
  return snapshot[provider]?.healthySlots||0;
}

function retryHoldSeconds(status, headers) {
  if (status === 401) return 120;
  if (status === 402) return 3600;
  if (status === 429) {
    const seconds = Number(headers?.get?.("retry-after"));
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(600, Math.max(30, seconds)) : 90;
  }
  return 60;
}

// Distribute healthy requests across configured credentials. Authentication,
// account-balance and explicitly account-scoped rate limits may rotate to an
// independent key; shared provider limits and network outages remain global.
export async function requestWithCredentialPool(env, provider, send, options = {}) {
  const slots = getCredentialSlots(env, provider);
  if (!slots.length) {
    const error = new Error("No existe una credencial configurada para este proveedor.");
    error.code = "MISSING_CREDENTIAL"; error.status = 503; throw error;
  }
  const sweepAuthSlots = options.sweepAuthSlots === true;
  const sweepQuotaSlots = options.sweepQuotaSlots === true;
  const sweepRateLimitSlots = options.sweepRateLimitSlots === true;
  const sweepIndependentSlots = sweepAuthSlots || sweepQuotaSlots || sweepRateLimitSlots;
  // A per-account quota/auth hold must not suppress independent accounts,
  // but a provider-wide network/5xx circuit breaker must remain in force.
  let providerHold = await getProviderHold(env, provider);
  const clearableHold = providerHold && (
    (sweepQuotaSlots && providerHold.state === "quota_exhausted") ||
    (sweepRateLimitSlots && providerHold.state === "rate_limited") ||
    (options.sweepAuthSlots === true && providerHold.state === "auth_error") ||
    providerHold.state === "credential_rotation"
  );
  if (sweepIndependentSlots && clearableHold) {
    await setProviderHold(env, provider, "credential_rotation", "Checking independent account credentials.", 0);
    providerHold = null;
  }
  if (options.ignoreProviderHold === true) providerHold = null;
  if (providerHold) {
    const error = new Error(providerHold.reason || "El proveedor está temporalmente en pausa.");
    error.code = "PROVIDER_COOLDOWN";
    error.status = providerHold.state === "quota_exhausted" ? 402 : providerHold.state === "rate_limited" ? 429 : 503;
    error.retryAfter = Math.max(1, Number(providerHold.valid_until || 0) - Math.floor(Date.now() / 1000));
    throw error;
  }
  // Keys are alternatives only for key-specific authentication failures.
  // Provider-wide limits/outages must not duplicate paid or quota-consuming calls.
  const maxAttempts = Math.min(slots.length,(sweepAuthSlots || sweepQuotaSlots || sweepRateLimitSlots) ? maxCredentialSlots(provider) : Math.min(2,Math.max(1,Number(options.maxAttempts)||2)));
  const metrics = await getCredentialMetricsSnapshot(env, [provider]);
  const slotMetrics = metrics[provider] || {};
  const startIndex = Number.isInteger(options.startIndex)
    ? ((options.startIndex % slots.length) + slots.length) % slots.length
    : await nextCredentialStartIndex(env, provider, slots.length);
  const rotated = slots.slice(startIndex).concat(slots.slice(0, startIndex));
  const orderedSlots = rotated.map((slot, index) => ({ slot, index, metrics: slotMetrics[slot.number] || {} }))
    .sort((a, b) => {
      const aScore = credentialCapacityScore(a.metrics), bScore = credentialCapacityScore(b.metrics);
      if (aScore != null && bScore != null && Math.abs(aScore - bScore) > 0.02) return bScore - aScore;
      const aUsed = Number(a.metrics.lastUsedAt) || 0, bUsed = Number(b.metrics.lastUsedAt) || 0;
      return aUsed - bUsed || a.index - b.index;
    }).map(item => item.slot);
  const retryable = new Set(options.retryStatuses || [401]);
  let lastResponse, attempted = 0, earliestPausedUntil = 0;
  for (let offset = 0; offset < orderedSlots.length && attempted < maxAttempts; offset++) {
    const slot = orderedSlots[offset];
    const healthKey = await credentialHealthKey(provider, slot);
    const slotMetric = slotMetrics[slot.number] || {};
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Number(slotMetric.balanceRemainingUsd) <= 0 && Number(slotMetric.balanceLimitUsd) > 0) {
      const resetAt = Number(slotMetric.balanceResetAt) > nowSeconds ? Number(slotMetric.balanceResetAt) : nowSeconds + 21600;
      if (!earliestPausedUntil || resetAt < earliestPausedUntil) earliestPausedUntil = resetAt;
      continue;
    }
    const rateResetActive = Number(slotMetric.requestsResetAt || 0) > nowSeconds || Number(slotMetric.tokensResetAt || 0) > nowSeconds;
    if (rateResetActive && (
      (Number(slotMetric.remainingRequests) === 0 && Number(slotMetric.requestsResetAt || 0) > nowSeconds) ||
      (Number(slotMetric.remainingTokens) === 0 && Number(slotMetric.tokensResetAt || 0) > nowSeconds)
    )) {
      const resetAt = Math.max(Number(slotMetric.requestsResetAt || 0), Number(slotMetric.tokensResetAt || 0));
      if (resetAt > 0 && (!earliestPausedUntil || resetAt < earliestPausedUntil)) earliestPausedUntil = resetAt;
      continue;
    }
    const hold = await getProviderHold(env, healthKey);
    if (hold) {
      const until=Number(hold.valid_until)||0;
      if(until>0&&(!earliestPausedUntil||until<earliestPausedUntil))earliestPausedUntil=until;
      continue;
    }
    attempted++;
    let response;
    try { response = await send(slot.value, slot.number); }
    catch(error) {
      await recordCredentialMetrics(env, provider, slot, null, null, { countRequest: true, status: 0 });
      const seconds=error?.name==="AbortError"?45:30;
      await setProviderHold(env, provider, "network_error","El endpoint de "+provider+" no respondió; Prisma lo pausó brevemente para evitar reintentos inútiles.", seconds);
      error.code=error.code||"PROVIDER_UNAVAILABLE"; error.status=Number(error.status)||502; error.retryAfter=Number(error.retryAfter)||seconds;
      throw error;
    }
    await recordCredentialMetrics(env, provider, slot, response, null, { countRequest: options.countRequest !== false });
    lastResponse=response;
    if(response.ok)return response;
    if(response.status===402){
      if (provider === "openrouter") {
        const errorPayload = await response.clone().json().catch(() => ({}));
        const limitSource = String(errorPayload?.error?.metadata?.limit_source || "");
        if (limitSource === "openrouter_key_limit") {
          await setProviderHold(env,healthKey,"quota_exhausted","El límite de gasto de esta clave OpenRouter se agotó; Prisma probará otra clave.",21600);
          continue;
        }
      }
      if (sweepQuotaSlots) {
        await setProviderHold(env,healthKey,"quota_exhausted","Esta cuenta de "+provider+" no tiene saldo o crédito disponible; Prisma probará la siguiente cuenta independiente.",21600);
        continue;
      }
      await setProviderHold(env,provider,"quota_exhausted","El proveedor agotó el saldo o crédito disponible; Prisma pausó el conjunto de credenciales sin probar otras cuentas.",21600);
      return response;
    }
    if(response.status===429){
      if (sweepRateLimitSlots) {
        await setProviderHold(env,healthKey,"rate_limited","Esta cuenta de "+provider+" alcanzó un límite temporal; Prisma probará la siguiente cuenta independiente.",retryHoldSeconds(429,response.headers));
        continue;
      }
      await setProviderHold(env,provider,"rate_limited","El proveedor alcanzó un límite de solicitudes; Prisma pausó el proveedor y utilizará otro motor.",retryHoldSeconds(429,response.headers));
      return response;
    }
    if([408,500,502,503,504].includes(response.status)){
      const seconds=response.status===408?30:45;
      await setProviderHold(env,provider,"provider_unavailable","El endpoint de "+provider+" está temporalmente indisponible; Prisma cambiará de motor y volverá a comprobarlo después.",seconds);
      return response;
    }
    if(!retryable.has(response.status))return response;
    if (response.status === 401 || response.status === 403) {
      await setProviderHold(env,healthKey,"auth_error","Esta credencial de "+provider+" fue rechazada (HTTP "+response.status+"); Prisma probará la siguiente cuenta independiente.",retryHoldSeconds(response.status,response.headers));
    }
  }
  if(lastResponse)return lastResponse;
  const error=new Error(earliestPausedUntil?"Todas las credenciales disponibles de "+provider+" están temporalmente en pausa.":"Todas las credenciales configuradas de "+provider+" están temporalmente en pausa.");
  error.code="CREDENTIALS_PAUSED";error.status=503;
  error.retryAfter=earliestPausedUntil?Math.max(1,earliestPausedUntil-Math.floor(Date.now()/1000)):60;
  throw error;
}
