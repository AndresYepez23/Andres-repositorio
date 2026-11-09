// OpenRouter Free Router account metadata and conservative shared limits.
import { getCredentialSlots, requestWithCredentialPool } from "./credential-pool.js";
let accountCache = null;
let accountCacheAt = 0;
let accountCacheKey = "";

function numericOrNull(value) {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? number : null;
}

export async function getOpenRouterAccount(env) {
  const slots = getCredentialSlots(env,"openrouter");
  if (!slots.length) return null;
  const suffix = slots.map(slot => slot.value.slice(-8)).join(":");
  if (accountCache && accountCacheKey === suffix && Date.now() - accountCacheAt < 5 * 60 * 1000) {
    return accountCache;
  }
  try {
    const response = await requestWithCredentialPool(env, "openrouter", async key => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        return await fetch("https://openrouter.ai/api/v1/key", {
          method: "GET",
          headers: { Authorization: "Bearer " + key, Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    const data = payload.data || {};
    const account = {
      isFreeTier: data.is_free_tier !== false,
      dailySpendUsd: numericOrNull(data.usage_daily),
      spendLimitUsd: numericOrNull(data.limit),
      spendRemainingUsd: numericOrNull(data.limit_remaining),
      spendLimitReset: typeof data.limit_reset === "string" ? data.limit_reset : null,
    };
    accountCache = account;
    accountCacheKey = suffix;
    accountCacheAt = Date.now();
    return account;
  } catch {
    return null;
  }
}

export async function getOpenRouterLimits(env) {
  const account = await getOpenRouterAccount(env);
  // OpenRouter's free-model allowance is 50 requests/day by default, or
  // 1,000/day after at least $10 in credits have been purchased.
  // If account metadata is temporarily unavailable, fail closed at 50/day.
  const accountDailyLimit = account?.isFreeTier === false ? 1000 : 50;
  const requestedDaily = Number(env.OPENROUTER_DAILY_LIMIT);
  const dailyLimit = Number.isFinite(requestedDaily) && requestedDaily > 0
    ? Math.min(accountDailyLimit, Math.max(1, Math.min(1000, Math.floor(requestedDaily))))
    : accountDailyLimit;
  const requestedMinute = Number(env.OPENROUTER_PER_MINUTE_LIMIT);
  const perMinuteLimit = Number.isFinite(requestedMinute) && requestedMinute > 0
    ? Math.max(1, Math.min(20, Math.floor(requestedMinute)))
    : 20;
  return { dailyLimit, perMinuteLimit, account };
}
