// OpenRouter Free Router account metadata and conservative shared limits.
import { getCredentialSlots, recordCredentialMetrics } from "./credential-pool.js";
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
    // OpenRouter exposes key-specific credit caps through GET /api/v1/key.
    // Refresh every configured key so the allocator can prefer the key with
    // the healthiest remaining cap without treating shared account credits
    // or free-model rate limits as multiplied capacity.
    const snapshots = await Promise.all(slots.map(async slot => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch("https://openrouter.ai/api/v1/key", {
          method: "GET",
          headers: { Authorization: "Bearer " + slot.value, Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        await recordCredentialMetrics(env,"openrouter",slot,response,payload,{countRequest:false});
        if (!response.ok || !payload?.data) return null;
        const data = payload.data;
        return {
          slot: slot.number,
          data,
          keyBudget: {
            slot: slot.number,
            limitUsd: numericOrNull(data.limit),
            remainingUsd: numericOrNull(data.limit_remaining),
            usageDailyUsd: numericOrNull(data.usage_daily),
            freeModelDaily: data.free_model_daily_requests && typeof data.free_model_daily_requests === "object"
              ? {
                  used: numericOrNull(data.free_model_daily_requests.used),
                  limit: numericOrNull(data.free_model_daily_requests.limit),
                  remaining: numericOrNull(data.free_model_daily_requests.remaining),
                }
              : null,
          },
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }));
    const valid = snapshots.filter(Boolean);
    if (!valid.length) return null;
    const data = valid[0].data;
    const account = {
      isFreeTier: data.is_free_tier !== false,
      dailySpendUsd: numericOrNull(data.usage_daily),
      spendLimitUsd: numericOrNull(data.limit),
      spendRemainingUsd: numericOrNull(data.limit_remaining),
      spendLimitReset: typeof data.limit_reset === "string" ? data.limit_reset : null,
      freeModelDaily: data.free_model_daily_requests && typeof data.free_model_daily_requests === "object" ? {
        used: numericOrNull(data.free_model_daily_requests.used),
        limit: numericOrNull(data.free_model_daily_requests.limit),
        remaining: numericOrNull(data.free_model_daily_requests.remaining),
      } : null,
      keyBudgets: valid.map(item => item.keyBudget),
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
  const reportedDailyLimit = numericOrNull(account?.freeModelDaily?.limit);
  const accountDailyLimit = reportedDailyLimit != null && reportedDailyLimit > 0
    ? Math.min(1000,reportedDailyLimit)
    : account?.isFreeTier === false ? 1000 : 50;
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
